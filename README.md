# IAM Drift Intelligence

AI-powered IAM least-privilege governance platform. Continuously scans AWS IAM roles, detects permission drift, generates AI-proposed remediation policies, simulates impact, and provides a full review-and-apply workflow — all without ever writing directly to production IAM.

## Live Demo

| Item | Value |
|------|-------|
| Frontend | https://d24vg0bs5gjmhb.cloudfront.net |
| API | https://p6oiquka77.execute-api.us-east-1.amazonaws.com/prod |
| AWS Account | TechCorp demo — `111122223333` |
| Default scan | `2026-03-17-account-111122223333-scan-001` |
| Seed roles | 10 IAM roles (4 HIGH, 4 MEDIUM, 2 LOW risk) |

## What It Does

| Page | Description |
|------|-------------|
| **Dashboard** | Account health score (0–100), 30-day trend chart, wildcard action before/after, risk distribution bar chart, trigger manual scan |
| **Remediation Queue** | Review all PENDING findings; approve (requires simulation COMPLETE) or reject with notes; optimistic UI removes row immediately |
| **Role Detail** | React Flow blast radius graph, AI intent/gap analysis, simulation results (preserved / removed / breaking), side-by-side policy diff, Terraform export |
| **Drift Timeline** | Per-role risk score and permission count over time across multiple scans |
| **Policy Versions** | Full policy history with version diffs; rollback to previous version for applied findings |
| **Executive Report** | AI-generated markdown report for leadership; generate on demand or per scan |

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  CloudFront + S3  │  React 18 SPA (6 pages)                 │
└──────────────────────────────┬──────────────────────────────┘
                               │ HTTPS
┌──────────────────────────────▼──────────────────────────────┐
│  API Gateway HTTP API v2  │  Single Lambda (apiHandler)      │
│  14 routes: scans / findings / dashboard / reports           │
└──────────┬────────────────────────┬────────────────────────┘
           │                        │
┌──────────▼──────────┐  ┌─────────▼──────────────────────────┐
│  DynamoDB (3 tables) │  │  EventBridge → SQS → Lambdas       │
│  findings            │  │  scannerLambda  → enrichmentLambda  │
│  scans               │  │  (5-stage pipeline)                 │
│  accounts            │  │  Stage 1: CloudTrail lookup         │
└──────────────────────┘  │  Stage 2: AI enrichment (Claude)    │
                          │  Stage 3: IAM Policy Simulator      │
                          │  Stage 4: Blast radius assembly      │
                          │  Stage 5: Health score update        │
                          └─────────────────────────────────────┘
                                         │
                               ┌─────────▼──────────┐
                               │  SNS → Email alert  │
                               │  (risk_score ≥ 13)  │
                               └────────────────────┘
```

## Tech Stack

**Frontend**
- React 18.3 + TypeScript + Vite
- Tailwind CSS (utility-first)
- Recharts (health score + risk distribution charts)
- React Flow 11 (blast radius graph)
- Axios + React Router v6

**Backend**
- Node.js 20 + TypeScript
- AWS Lambda (arm64) — 4 functions
- API Gateway HTTP API v2
- DynamoDB (PAY_PER_REQUEST + PITR)
- SQS (scan queue + enrichment queue)
- SNS (HIGH risk email alerts)
- EventBridge (scheduled scans)
- AWS SAM + CloudFormation

## AI Layer

The enrichment pipeline calls Claude via a model-agnostic `AIProvider` interface:

```typescript
interface AIProvider {
  generateRemediationBundle(input: RemediationInput): Promise<RemediationBundle>;
  generateExecutiveSummary(input: ExecutiveSummaryInput): Promise<string>;
}
```

`generateRemediationBundle()` returns:
- `intent_summary` — what this role is meant to do
- `actual_permissions_summary` — what it can actually do
- `intent_gap` — the difference (what it has that it shouldn't)
- `abuse_scenario` — how an attacker could exploit it
- `proposed_policy` — least-privilege PolicyDocument
- `ai_confidence_score` + `ai_confidence_note`

Switch providers via `AI_PROVIDER=bedrock` (implement `BedrockProvider` against the same interface).

## Risk Scoring Model

Each finding receives a deterministic `risk_score` (0–22) before AI runs:

| Signal | Max Points |
|--------|-----------|
| Wildcard actions (`*`) | 8 |
| Wildcard resources (`*`) | 6 |
| Unused services (>90 days) | 4 |
| High-blast-radius services (iam, s3, ec2, rds, lambda, sts, kms) | 4 |

`risk_level` thresholds: CRITICAL ≥ 18 · HIGH ≥ 13 · MEDIUM ≥ 6 · LOW < 6

SNS alert fires on first enrichment when `risk_score >= 13` (`alert_sent` flag prevents duplicates).

## Key Metrics (TechCorp Demo)

| Metric | Value |
|--------|-------|
| Account health score | 54 / 100 |
| Total roles scanned | 10 |
| Wildcard actions (before) | 12 |
| Wildcard actions (after approved) | 9 |
| Avg permission reduction | 38.9% |
| Findings APPROVED | 3 (2 applied) |
| Findings REJECTED | 1 |
| Findings PENDING | 6 |

## Portfolio

IAM Drift Intelligence is the fourth project in a cloud operations portfolio:

1. **MigrationOps** — AI-assisted migration planning platform (React + Express + Claude)
2. **SentinelOps** — AI incident triage and runbook automation (React + 4-Lambda AWS backend)
3. **DeployIQ** — Intelligent deployment pipeline with risk scoring
4. **IAM Drift Intelligence** — Continuous IAM governance with AI remediation ← *this project*

Each project demonstrates a different AWS architecture pattern while sharing a consistent frontend stack (React 18 + TypeScript + Tailwind + Vite).

## Local Development

**Fast mode (in-memory storage, no AWS required)**
```bash
# Terminal 1 — backend
cd backend
cp .env.example .env          # add ANTHROPIC_API_KEY
npm install
npm run dev                   # http://localhost:3001

# Terminal 2 — frontend
cd frontend
npm install
npm run dev                   # http://localhost:5173
```

**With DynamoDB Local**
```bash
# Start DynamoDB Local
docker run -d -p 8000:8000 amazon/dynamodb-local

# Create tables
./infrastructure/scripts/setup-local-dynamo.sh

# Seed data (first time only)
cd backend && npm run seed:dynamo

# Start backend pointing at local DynamoDB
STORAGE_BACKEND=dynamodb DYNAMODB_ENDPOINT=http://localhost:8000 npm run dev
```

**With AWS DynamoDB**
```bash
# Set env vars
export AWS_REGION=us-east-1
export STORAGE_BACKEND=dynamodb

cd backend
npm run seed:dynamo           # seeds iam-drift-findings, iam-drift-scans, iam-drift-accounts
npm run dev
```

## Deployment

**Store the API key in SSM**
```bash
aws ssm put-parameter \
  --name /iam-drift-intelligence/anthropic-api-key \
  --value "sk-ant-..." \
  --type SecureString \
  --region us-east-1
```

**Build and deploy backend (SAM)**
```bash
sam build
sam deploy --guided
# Follow prompts — saves config to samconfig.toml for subsequent deploys
sam deploy          # subsequent deploys (no --guided needed)
```

**Deploy frontend to S3 + CloudFront**
```bash
cd frontend
npm run build

./infrastructure/scripts/deploy-frontend.sh \
  --bucket YOUR_S3_BUCKET \
  --distribution YOUR_CLOUDFRONT_ID \
  --api-url https://YOUR_API_ID.execute-api.us-east-1.amazonaws.com
```

**Seed production DynamoDB**
```bash
cd backend
AWS_REGION=us-east-1 STORAGE_BACKEND=dynamodb npm run seed:dynamo
```
