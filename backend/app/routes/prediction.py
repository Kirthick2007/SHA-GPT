from fastapi import APIRouter, HTTPException

from app.dataset import get_claim_by_id


router = APIRouter(prefix="/prediction", tags=["Prediction"])


def risk_level(score: int) -> str:
    if score >= 75:
        return "High Risk"
    if score >= 40:
        return "Medium Risk"
    return "Low Risk"


def decision_for_score(score: int) -> str:
    if score >= 75:
        return "Send for investigation"
    if score >= 40:
        return "Manual review"
    return "Fast-track payout"


@router.get("/claim/{claim_id}")
def predict_existing_claim(claim_id: int):
    claim = get_claim_by_id(claim_id)

    if claim is None:
        raise HTTPException(status_code=404, detail="Claim not found")

    reasons_text = claim.get("suspicious_reasons") or ""
    reasons = [reason for reason in reasons_text.split("|") if reason]
    base_score = 20
    score = min(98, base_score + len(reasons) * 25)

    if claim.get("suspicious_rule_label") == 0:
        score = min(score, 35)

    return {
        "claim_id": claim_id,
        "risk_score": score,
        "risk_level": risk_level(score),
        "decision": decision_for_score(score),
        "reasons": reasons,
        "claim": claim,
    }

