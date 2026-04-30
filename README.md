# ClaimShield AI

Real-time fraudulent insurance claim detection with provider anomaly analysis and a tamper-evident audit log.

## Problem Statement

Insurance fraud is often detected after reimbursement. ClaimShield AI helps detect suspicious claims before payout, flags abnormal provider patterns, and records decisions transparently.

## Main Features

- Real-time claim risk scoring
- Suspicious claim explanation
- Live operations dashboard simulation
- Patient insurance coverage calculator
- Insurance payout and patient-pay estimate
- Claims investigation queue
- Provider risk analysis
- Tamper-evident audit log
- Dashboard KPIs for fraud teams

## Tech Stack

- Frontend: HTML, CSS, JavaScript, Vite
- Backend: Node.js local API server
- Database: Firebase Cloud Firestore through Firebase Admin SDK
- Dataset: cleaned insurance claims CSV generated from Excel
- Audit log: Browser local storage + SHA-256 hash chain

## Project Structure

```text
claimshield-ai/
  claimshield-backend.js
  start-backend.bat
  start-frontend.bat
  backend/
    data/
      cleaned_insurance_hackathon_ready.csv
      cleaned_insurance_hackathon_ready.xlsx
  frontend/
    index.html
    src/
      app.js
      styles.css
  docs/
    demo-script.md
    project-summary.md
```

## How To Run

Open two terminals or double-click both `.bat` files.

### Backend

```powershell
cd C:\Users\admin\OneDrive\Documents\claimshield-ai
node claimshield-backend.js
```

Backend URL:

```text
http://127.0.0.1:8000/dashboard/summary
```

Firebase status URL:

```text
http://127.0.0.1:8000/firebase/status
```

### Frontend

```powershell
cd C:\Users\admin\OneDrive\Documents\claimshield-ai\frontend
npm.cmd run dev
```

Frontend URL:

```text
http://localhost:5174
```

The frontend may use `5173`, `5174`, or another nearby port depending on what is already running.

## Demo Flow

1. Open the dashboard.
2. Show the live operations cards: claims today, auto-approved, flagged, rejected / held, fraud prevented, and average decision time.
3. Show total claims, suspicious claims, safe claims, claim amount, and suspicious rate.
4. Use the insurance coverage calculator with a sample policy limit such as `500000`.
5. Run a claim check using claim ID `1`.
6. Show risk score, risk level, decision, reasons, insurance pays, patient pays, and remaining insurance limit.
7. Open Claims page and show the investigation queue.
8. Open Providers page and show top risky providers.
9. Open Audit Log page and show the hash-linked claim event.

## Coverage Calculator Logic

The dashboard includes a patient insurance coverage calculator:

```text
available_limit = policy_limit - already_used
eligible_amount = min(claim_amount - deductible, available_limit)
insurance_pays = eligible_amount * (1 - copay_percentage)
patient_pays = claim_amount - insurance_pays
remaining_limit = available_limit - insurance_pays
```

Example:

```text
Policy Limit: Rs. 5,00,000
Claim Amount: Rs. 1,20,000
Deductible: Rs. 10,000
Co-pay: 10%
Already Used: Rs. 80,000
```

The system returns available limit, eligible claim, insurance pays, patient pays, and remaining insurance limit. After a claim check, the calculator automatically uses the claim amount from the selected claim.

## Pitch Highlight

ClaimShield AI now combines fraud risk detection with payout responsibility. It does not only say whether a claim is suspicious; it also shows how much the insurer may pay, how much the patient may pay, and how much insurance coverage remains after the claim.

## Firebase Firestore

The backend connects to Firebase using a private service account file:

```text
backend/firebase-service-account.json
```

This file is ignored by `.gitignore` and must not be uploaded or shared. Each claim check is saved to the Firestore collection:

```text
claim_checks
```

Useful backend routes:

```text
GET /firebase/status
GET /prediction/claim/1
GET /claim-checks?limit=10
```

## Recommended Screenshots For Final Submission

Capture these screens for the final README or presentation deck:

1. Dashboard with the live operations cards visible.
2. Insurance coverage calculator with sample 5 lakh policy values.
3. Claim check result showing risk score, decision, reasons, insurance pays, patient pays, and remaining limit.
4. Provider risk analysis leaderboard.
5. Tamper-evident audit log after running a claim check.

## Suggested Claim IDs

```text
1
77
508
1020
15251
```

## Important Note

The dataset does not contain verified real-world fraud labels. The project uses a rule-based `suspicious_rule_label` created from payment timing, provider rejection patterns, high claim amounts, and claim outlier behavior. This is suitable for a hackathon prototype and can be replaced by verified fraud labels in production.
