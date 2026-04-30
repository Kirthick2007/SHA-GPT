from fastapi import APIRouter

from app.dataset import load_dataset


router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get("/summary")
def dashboard_summary():
    df = load_dataset()

    total_claims = len(df)
    suspicious_claims = int((df["suspicious_rule_label"] == 1).sum())
    approved_claims = int((df["claim_status"].str.lower() == "approved").sum())
    rejected_claims = int((df["claim_status"].str.lower() == "rejected").sum())
    pending_claims = int((df["claim_status"].str.lower() == "pending").sum())
    total_claim_amount = float(df["claim_amount"].sum())
    average_claim_amount = float(df["claim_amount"].mean())

    return {
        "total_claims": total_claims,
        "suspicious_claims": suspicious_claims,
        "safe_claims": total_claims - suspicious_claims,
        "approved_claims": approved_claims,
        "rejected_claims": rejected_claims,
        "pending_claims": pending_claims,
        "total_claim_amount": round(total_claim_amount, 2),
        "average_claim_amount": round(average_claim_amount, 2),
        "suspicious_rate": round((suspicious_claims / total_claims) * 100, 2),
    }


@router.get("/recent-suspicious")
def recent_suspicious_claims(limit: int = 10):
    df = load_dataset()
    records = (
        df[df["suspicious_rule_label"] == 1]
        .sort_values("claim_date", ascending=False)
        .head(limit)
    )

    return records[
        [
            "claim_id",
            "patient_id",
            "provider_id",
            "claim_date",
            "claim_amount",
            "claim_status",
            "provider_specialty",
            "suspicious_reasons",
        ]
    ].to_dict(orient="records")

