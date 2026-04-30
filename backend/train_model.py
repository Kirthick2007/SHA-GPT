from __future__ import annotations

import json
import pickle
from pathlib import Path

import numpy as np
import pandas as pd


BASE_DIR = Path(__file__).resolve().parent
DATASET_PATH = BASE_DIR / "data" / "cleaned_insurance_hackathon_ready.csv"
MODELS_DIR = BASE_DIR / "models"
MODEL_PATH = MODELS_DIR / "claim_fraud_model.pkl"
MODEL_JSON_PATH = MODELS_DIR / "claim_fraud_model.json"
METRICS_PATH = MODELS_DIR / "claim_fraud_model_metrics.json"

TARGET_COLUMN = "suspicious_rule_label"

NUMERIC_FEATURES = [
    "claim_amount",
    "patient_age",
    "payment_lag_days",
    "payment_ratio",
    "provider_total_claims",
    "provider_avg_claim_amount",
    "provider_rejection_rate",
    "provider_pending_rate",
    "provider_claim_amount_zscore",
    "patient_total_claims",
    "patient_avg_claim_amount",
    "claim_amount_vs_provider_avg",
    "claim_amount_vs_patient_avg",
]

CATEGORICAL_FEATURES = [
    "claim_status",
    "patient_gender",
    "patient_state",
    "provider_specialty",
    "provider_state",
    "claim_has_payment",
    "provider_patient_state_mismatch",
]


def sigmoid(values: np.ndarray) -> np.ndarray:
    values = np.clip(values, -35, 35)
    return 1 / (1 + np.exp(-values))


def auc_score(y_true: np.ndarray, scores: np.ndarray) -> float:
    order = np.argsort(scores)
    ranks = np.empty_like(order, dtype=float)
    ranks[order] = np.arange(1, len(scores) + 1)
    positive = y_true == 1
    negative_count = int((y_true == 0).sum())
    positive_count = int(positive.sum())
    if positive_count == 0 or negative_count == 0:
        return 0.0
    rank_sum = float(ranks[positive].sum())
    return (rank_sum - positive_count * (positive_count + 1) / 2) / (positive_count * negative_count)


def load_training_data() -> pd.DataFrame:
    if not DATASET_PATH.exists():
        raise FileNotFoundError(f"Dataset not found: {DATASET_PATH}")

    df = pd.read_csv(DATASET_PATH)
    df.columns = [column.strip() for column in df.columns]

    required_columns = [TARGET_COLUMN, *NUMERIC_FEATURES, *CATEGORICAL_FEATURES]
    missing_columns = [column for column in required_columns if column not in df.columns]
    if missing_columns:
        raise ValueError(f"Dataset is missing required columns: {missing_columns}")

    return df


def build_feature_matrix(df: pd.DataFrame, model_state: dict | None = None) -> tuple[np.ndarray, dict]:
    state = model_state or {}
    numeric_medians = state.get("numeric_medians") or {}
    numeric_means = state.get("numeric_means") or {}
    numeric_stds = state.get("numeric_stds") or {}
    category_values = state.get("category_values") or {}

    numeric_parts = []
    for column in NUMERIC_FEATURES:
        series = pd.to_numeric(df[column], errors="coerce")
        median = numeric_medians.get(column)
        if median is None:
            median = float(series.median()) if not np.isnan(series.median()) else 0.0
            numeric_medians[column] = median

        values = series.fillna(median).to_numpy(dtype=float)
        mean = numeric_means.get(column)
        std = numeric_stds.get(column)
        if mean is None or std is None:
            mean = float(values.mean())
            std = float(values.std()) or 1.0
            numeric_means[column] = mean
            numeric_stds[column] = std

        numeric_parts.append(((values - mean) / std).reshape(-1, 1))

    categorical_parts = []
    for column in CATEGORICAL_FEATURES:
        values = df[column].fillna("Unknown").astype(str).str.strip().replace("", "Unknown")
        categories = category_values.get(column)
        if categories is None:
            categories = sorted(values.unique().tolist())
            category_values[column] = categories

        encoded = np.zeros((len(df), len(categories)), dtype=float)
        category_index = {category: index for index, category in enumerate(categories)}
        for row_index, value in enumerate(values):
            index = category_index.get(value)
            if index is not None:
                encoded[row_index, index] = 1.0
        categorical_parts.append(encoded)

    x = np.hstack([*numeric_parts, *categorical_parts])
    next_state = {
        "numeric_medians": numeric_medians,
        "numeric_means": numeric_means,
        "numeric_stds": numeric_stds,
        "category_values": category_values,
    }
    return x, next_state


def train_logistic_regression(x_train: np.ndarray, y_train: np.ndarray) -> tuple[np.ndarray, list[float]]:
    x_with_bias = np.hstack([np.ones((x_train.shape[0], 1)), x_train])
    weights = np.zeros(x_with_bias.shape[1], dtype=float)
    learning_rate = 0.08
    l2_strength = 0.001
    losses = []

    positive_count = max(1, int(y_train.sum()))
    negative_count = max(1, int((y_train == 0).sum()))
    positive_weight = len(y_train) / (2 * positive_count)
    negative_weight = len(y_train) / (2 * negative_count)
    sample_weights = np.where(y_train == 1, positive_weight, negative_weight)

    for _ in range(450):
        probabilities = sigmoid(x_with_bias @ weights)
        error = (probabilities - y_train) * sample_weights
        gradient = (x_with_bias.T @ error) / len(y_train)
        gradient[1:] += l2_strength * weights[1:]
        weights -= learning_rate * gradient

        loss = -np.mean(
            sample_weights
            * (
                y_train * np.log(probabilities + 1e-9)
                + (1 - y_train) * np.log(1 - probabilities + 1e-9)
            )
        )
        losses.append(float(loss))

    return weights, losses


def predict_proba(x: np.ndarray, weights: np.ndarray) -> np.ndarray:
    x_with_bias = np.hstack([np.ones((x.shape[0], 1)), x])
    return sigmoid(x_with_bias @ weights)


def train_model() -> dict:
    df = load_training_data()
    features = NUMERIC_FEATURES + CATEGORICAL_FEATURES
    y = df[TARGET_COLUMN].astype(int).to_numpy()

    rng = np.random.default_rng(42)
    train_mask = np.zeros(len(df), dtype=bool)
    for label in [0, 1]:
        label_indices = np.where(y == label)[0]
        rng.shuffle(label_indices)
        train_size = int(len(label_indices) * 0.8)
        train_mask[label_indices[:train_size]] = True

    train_df = df.loc[train_mask, features].reset_index(drop=True)
    test_df = df.loc[~train_mask, features].reset_index(drop=True)
    y_train = y[train_mask]
    y_test = y[~train_mask]

    x_train, model_state = build_feature_matrix(train_df)
    x_test, _ = build_feature_matrix(test_df, model_state)

    weights, losses = train_logistic_regression(x_train, y_train)
    probabilities = predict_proba(x_test, weights)
    predictions = (probabilities >= 0.5).astype(int)

    true_positive = int(((predictions == 1) & (y_test == 1)).sum())
    true_negative = int(((predictions == 0) & (y_test == 0)).sum())
    false_positive = int(((predictions == 1) & (y_test == 0)).sum())
    false_negative = int(((predictions == 0) & (y_test == 1)).sum())

    accuracy = float((predictions == y_test).mean())
    precision = true_positive / max(1, true_positive + false_positive)
    recall = true_positive / max(1, true_positive + false_negative)
    f1 = 2 * precision * recall / max(1e-9, precision + recall)

    metrics = {
        "model_type": "CustomLogisticRegression",
        "target_column": TARGET_COLUMN,
        "label_note": (
            "This hackathon model is trained on suspicious_rule_label, which is a rule-based "
            "proxy label. In production, replace it with verified fraud investigation outcomes."
        ),
        "dataset_rows": int(len(df)),
        "train_rows": int(len(train_df)),
        "test_rows": int(len(test_df)),
        "positive_label_rows": int(y.sum()),
        "negative_label_rows": int((y == 0).sum()),
        "features": features,
        "accuracy": round(accuracy, 4),
        "precision": round(float(precision), 4),
        "recall": round(float(recall), 4),
        "f1": round(float(f1), 4),
        "roc_auc": round(float(auc_score(y_test, probabilities)), 4),
        "confusion_matrix": [[true_negative, false_positive], [false_negative, true_positive]],
        "final_training_loss": round(losses[-1], 4),
    }

    model_artifact = {
        "weights": weights,
        "features": features,
        "numeric_features": NUMERIC_FEATURES,
        "categorical_features": CATEGORICAL_FEATURES,
        "target_column": TARGET_COLUMN,
        "model_state": model_state,
        "metrics": metrics,
    }

    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    with MODEL_PATH.open("wb") as model_file:
        pickle.dump(model_artifact, model_file)

    model_json_artifact = {
        "weights": weights.tolist(),
        "features": features,
        "numeric_features": NUMERIC_FEATURES,
        "categorical_features": CATEGORICAL_FEATURES,
        "target_column": TARGET_COLUMN,
        "model_state": model_state,
        "metrics": metrics,
    }
    MODEL_JSON_PATH.write_text(json.dumps(model_json_artifact, indent=2), encoding="utf-8")
    METRICS_PATH.write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    return metrics


if __name__ == "__main__":
    training_metrics = train_model()
    print("ClaimShield ML model trained successfully.")
    print(f"Model saved to: {MODEL_PATH}")
    print(f"Node model saved to: {MODEL_JSON_PATH}")
    print(f"Metrics saved to: {METRICS_PATH}")
    print(f"Accuracy: {training_metrics['accuracy']}")
    print(f"Precision: {training_metrics['precision']}")
    print(f"Recall: {training_metrics['recall']}")
    print(f"ROC AUC: {training_metrics['roc_auc']}")
