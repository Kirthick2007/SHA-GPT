from fastapi import APIRouter

from app.dataset import load_dataset


router = APIRouter(prefix="/providers", tags=["Providers"])


@router.get("/risk")
def provider_risk(limit: int = 10):
    df = load_dataset()

    grouped = (
        df.groupby(["provider_id", "provider_specialty", "provider_state"])
        .agg(
            total_claims=("claim_id", "count"),
            average_claim_amount=("claim_amount", "mean"),
            suspicious_claims=("suspicious_rule_label", "sum"),
            rejection_rate=("provider_rejection_rate", "mean"),
            average_zscore=("provider_claim_amount_zscore", "mean"),
        )
        .reset_index()
    )

    grouped["risk_score"] = (
        (grouped["suspicious_claims"] / grouped["total_claims"]) * 70
        + grouped["rejection_rate"] * 30
    )

    result = grouped.sort_values("risk_score", ascending=False).head(limit)

    result["average_claim_amount"] = result["average_claim_amount"].round(2)
    result["rejection_rate"] = result["rejection_rate"].round(4)
    result["average_zscore"] = result["average_zscore"].round(4)
    result["risk_score"] = result["risk_score"].round(2)

    return result.to_dict(orient="records")

