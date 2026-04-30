from functools import lru_cache

import pandas as pd

from app.config import DATASET_CSV_PATH, DATASET_PATH


@lru_cache(maxsize=1)
def load_dataset() -> pd.DataFrame:
    if DATASET_CSV_PATH.exists():
        df = pd.read_csv(DATASET_CSV_PATH)
    else:
        df = pd.read_excel(DATASET_PATH)

    df.columns = [column.strip() for column in df.columns]

    date_columns = ["claim_date", "payment_date"]
    for column in date_columns:
        if column in df.columns:
            df[column] = pd.to_datetime(df[column], errors="coerce")

    return df


def clean_record(record: dict) -> dict:
    cleaned = {}
    for key, value in record.items():
        if pd.isna(value):
            cleaned[key] = None
        elif hasattr(value, "isoformat"):
            cleaned[key] = value.isoformat()
        else:
            cleaned[key] = value
    return cleaned


def get_claim_by_id(claim_id: int) -> dict | None:
    df = load_dataset()
    match = df[df["claim_id"] == claim_id]

    if match.empty:
        return None

    return clean_record(match.iloc[0].to_dict())
