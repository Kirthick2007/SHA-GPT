from fastapi import APIRouter, HTTPException

from app.dataset import clean_record, get_claim_by_id, load_dataset


router = APIRouter(prefix="/claims", tags=["Claims"])


@router.get("")
def list_claims(limit: int = 25, suspicious_only: bool = False):
    df = load_dataset()

    if suspicious_only:
        df = df[df["suspicious_rule_label"] == 1]

    records = df.head(limit).to_dict(orient="records")
    return [clean_record(record) for record in records]


@router.get("/{claim_id}")
def claim_detail(claim_id: int):
    claim = get_claim_by_id(claim_id)

    if claim is None:
        raise HTTPException(status_code=404, detail="Claim not found")

    return claim

