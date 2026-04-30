# Backend

This folder will contain the FastAPI backend.

The backend will:

- Read the insurance dataset.
- Store claims in SQLite.
- Train a fraud risk model.
- Provide API endpoints for the frontend.
- Create audit log records for claim decisions.

## Main Backend Files

```text
backend/
  app/
    main.py
    database.py
    fraud_engine.py
    audit.py
    routes/
      claims.py
      dashboard.py
      providers.py
      prediction.py
  data/
    cleaned_insurance_hackathon_ready.xlsx
  models/
  requirements.txt
```

## Step 2: Run The Backend

Open a terminal inside this `backend` folder and run:

```bash
pip install -r requirements.txt
python prepare_data.py
uvicorn app.main:app --reload
```

Then open:

```text
http://127.0.0.1:8000
```

Expected result:

```json
{
  "message": "ClaimShield AI backend is running",
  "dataset_found": true
}
```
