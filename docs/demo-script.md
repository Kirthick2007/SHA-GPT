# ClaimShield AI Demo Script

## 30-Second Introduction

ClaimShield AI is a real-time insurance claim fraud detection system. It checks claims before payout, identifies suspicious provider behavior, explains why a claim is risky, and records every decision in a tamper-evident audit log.

## Demo Steps

### 1. Dashboard

Open the dashboard and say:

> This dashboard gives the fraud investigation team a real-time view of claim volume, suspicious claims, safe claims, and claim amount exposure.

Point out:

- Live operations cards that update automatically during the demo
- Claims Today
- Auto Approved
- Flagged for Review
- Rejected / Held
- Fraud Prevented
- Average Decision Time
- Total claims: 200,000
- Suspicious claims: 141,996
- Safe claims: 58,004
- Suspicious rate: 71%

### 2. Insurance Coverage Calculator

Use the default sample values and say:

> Along with fraud detection, the system estimates payout responsibility. If the patient has a policy limit of 5 lakhs, it calculates available coverage, eligible claim amount, insurance payment, patient payment, and remaining limit.

Point out:

- Policy limit
- Claim amount
- Deductible
- Co-pay percentage
- Already used amount
- Insurance pays
- Patient pays
- Remaining insurance limit

### 3. Claim Risk Check

Use claim ID `1` and click Check.

Say:

> The system instantly gives a risk score, decision, explainable suspicious reasons, and payout estimate. This helps reviewers understand both fraud risk and financial responsibility before payout.

### 4. Claims Page

Open Claims.

Say:

> This is the investigation queue. Reviewers can filter suspicious claims and run claim checks directly from the table.

### 5. Provider Risk Page

Open Providers.

Say:

> This page detects provider-level anomalies. It helps identify providers with unusual suspicious claim rates, high rejection patterns, and abnormal billing behavior.

### 6. Audit Log

Open Audit Log.

Say:

> Every claim check creates a hash-linked audit record. If a previous decision is modified, the hash chain breaks. This gives us transparent, tamper-evident claim processing.

## Closing Pitch

> ClaimShield AI helps insurers catch fraud before reimbursement, reduce manual review time, and accelerate payouts for genuine claims. It combines live operations monitoring, risk scoring, provider anomaly detection, patient coverage calculation, explainable decisions, and transparent audit logging in one workflow.
