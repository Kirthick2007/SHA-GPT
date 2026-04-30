# Project Summary

## Project Name

ClaimShield AI

## One-Line Description

Real-time fraudulent insurance claim detection with explainable risk scoring, provider anomaly detection, and tamper-evident claim audit logging.

## What It Solves

Insurance fraud causes delayed payouts, financial loss, and heavy manual review. ClaimShield AI helps detect suspicious claims before reimbursement and supports faster processing for genuine claims.

## Core Modules

### Dashboard

Shows claim volume, suspicious claims, safe claims, claim status, total claim amount, and recent suspicious claims.

### Claim Detection

Accepts a claim ID and returns:

- Risk score
- Risk level
- Decision
- Suspicious reasons

### Claims Queue

Shows claim records and lets investigators run checks from the table.

### Provider Risk Analysis

Ranks providers by risk score using claim volume, suspicious claim count, rejection rate, and billing anomaly behavior.

### Audit Log

Stores each claim check as a hash-linked event with:

- Claim ID
- Action
- Decision
- Risk score
- Timestamp
- Previous hash
- Current hash

## Specialization Highlights

- Real-time claim scoring
- Explainable AI-style decisions
- Provider anomaly detection
- Pre-payout fraud flagging
- Tamper-evident audit chain
- Dashboard for insurance investigators

## Architecture

```text
Dataset CSV
   -> Local Backend API
   -> Frontend Dashboard
   -> Claim Check + Provider Analysis
   -> Audit Log Hash Chain
```

## Future Scope

- Replace rule-based suspicious label with verified fraud labels
- Add medical billing/procedure codes
- Add login roles for investigator, provider, and admin
- Store audit logs in a real database or blockchain ledger
- Add model training pipeline with Random Forest or XGBoost
- Deploy backend and frontend to the cloud
