#!/usr/bin/env bash
# IAM Drift Intelligence — DynamoDB Local Table Setup
#
# Creates all three DynamoDB tables with their GSIs in DynamoDB Local.
#
# Prerequisites:
#   docker run -d -p 8000:8000 amazon/dynamodb-local
#
# Usage:
#   ./infrastructure/scripts/setup-local-dynamo.sh

set -euo pipefail

ENDPOINT="http://localhost:8000"
REGION="us-east-1"
STACK="iam-drift"

# Dummy credentials for DynamoDB Local
export AWS_ACCESS_KEY_ID=local
export AWS_SECRET_ACCESS_KEY=local
export AWS_DEFAULT_REGION=$REGION

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  IAM Drift Intelligence — DynamoDB Local Table Setup"
echo "  Endpoint: $ENDPOINT"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ─── iam-drift-findings ───────────────────────────────────────────────────────
# PK: scan_id (S)  SK: role_id (S)
# GSIs:
#   review_decision-index   PK: review_decision (S)
#   risk_level-index        PK: risk_level (S)
#   account_id-index        PK: account_id (S)

echo ""
echo "▶ Creating ${STACK}-findings..."
aws dynamodb create-table \
  --endpoint-url "$ENDPOINT" \
  --table-name "${STACK}-findings" \
  --attribute-definitions \
    AttributeName=scan_id,AttributeType=S \
    AttributeName=role_id,AttributeType=S \
    AttributeName=review_decision,AttributeType=S \
    AttributeName=risk_level,AttributeType=S \
    AttributeName=account_id,AttributeType=S \
  --key-schema \
    AttributeName=scan_id,KeyType=HASH \
    AttributeName=role_id,KeyType=RANGE \
  --global-secondary-indexes \
    '[
      {
        "IndexName": "review_decision-index",
        "KeySchema": [{"AttributeName": "review_decision", "KeyType": "HASH"}],
        "Projection": {"ProjectionType": "ALL"}
      },
      {
        "IndexName": "risk_level-index",
        "KeySchema": [{"AttributeName": "risk_level", "KeyType": "HASH"}],
        "Projection": {"ProjectionType": "ALL"}
      },
      {
        "IndexName": "account_id-index",
        "KeySchema": [{"AttributeName": "account_id", "KeyType": "HASH"}],
        "Projection": {"ProjectionType": "ALL"}
      }
    ]' \
  --billing-mode PAY_PER_REQUEST \
  2>/dev/null && echo "✓ Created" || echo "  Already exists"

# ─── iam-drift-scans ──────────────────────────────────────────────────────────
# PK: scan_id (S)

echo ""
echo "▶ Creating ${STACK}-scans..."
aws dynamodb create-table \
  --endpoint-url "$ENDPOINT" \
  --table-name "${STACK}-scans" \
  --attribute-definitions \
    AttributeName=scan_id,AttributeType=S \
  --key-schema \
    AttributeName=scan_id,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  2>/dev/null && echo "✓ Created" || echo "  Already exists"

# ─── iam-drift-accounts ───────────────────────────────────────────────────────
# PK: account_id (S)

echo ""
echo "▶ Creating ${STACK}-accounts..."
aws dynamodb create-table \
  --endpoint-url "$ENDPOINT" \
  --table-name "${STACK}-accounts" \
  --attribute-definitions \
    AttributeName=account_id,AttributeType=S \
  --key-schema \
    AttributeName=account_id,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  2>/dev/null && echo "✓ Created" || echo "  Already exists"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✓ Tables ready. Now run:"
echo "    cd backend"
echo "    STORAGE_BACKEND=dynamodb DYNAMODB_ENDPOINT=http://localhost:8000 npm run seed:dynamo"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
