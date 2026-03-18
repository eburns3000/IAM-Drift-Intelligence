#!/usr/bin/env bash
# IAM Drift Intelligence — Frontend Deployment to S3 + CloudFront
#
# Usage:
#   ./infrastructure/scripts/deploy-frontend.sh \
#     --bucket iam-drift-intelligence-frontend \
#     --distribution YOUR_CLOUDFRONT_ID \
#     --api-url https://your-api-id.execute-api.us-east-1.amazonaws.com/prod
#
# Prerequisites:
#   - AWS CLI configured with S3 + CloudFront permissions
#   - S3 bucket + CloudFront distribution already created (by SAM template)
#   - npm install run in frontend/ directory

set -euo pipefail

S3_BUCKET=""
CF_DISTRIBUTION_ID=""
API_BASE_URL=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --bucket)       S3_BUCKET="$2";           shift 2 ;;
    --distribution) CF_DISTRIBUTION_ID="$2";  shift 2 ;;
    --api-url)      API_BASE_URL="$2";         shift 2 ;;
    *) echo "Unknown argument: $1"; exit 1 ;;
  esac
done

if [[ -z "$S3_BUCKET" ]]; then
  echo "Error: --bucket is required"
  echo "Usage: $0 --bucket BUCKET_NAME [--distribution CF_ID] [--api-url API_URL]"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$(cd "$SCRIPT_DIR/../../frontend" && pwd)"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  IAM Drift Intelligence Frontend Deployment"
echo "  S3 Bucket:     $S3_BUCKET"
echo "  CloudFront ID: ${CF_DISTRIBUTION_ID:-'(skipping invalidation)'}"
echo "  API Base URL:  ${API_BASE_URL:-'(using proxy)'}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo ""
echo "▶ Building frontend..."
cd "$FRONTEND_DIR"

cat > .env.production <<EOF
VITE_API_BASE_URL=${API_BASE_URL}
EOF

npm run build
echo "✓ Build complete → $FRONTEND_DIR/dist"

echo ""
echo "▶ Syncing to s3://$S3_BUCKET..."

aws s3 sync dist/assets s3://"$S3_BUCKET"/assets \
  --cache-control "max-age=31536000,immutable" \
  --delete

aws s3 sync dist s3://"$S3_BUCKET" \
  --exclude "assets/*" \
  --cache-control "no-cache,no-store,must-revalidate" \
  --delete

echo "✓ S3 sync complete"

if [[ -n "$CF_DISTRIBUTION_ID" ]]; then
  echo ""
  echo "▶ Creating CloudFront invalidation..."
  INVALIDATION_ID=$(aws cloudfront create-invalidation \
    --distribution-id "$CF_DISTRIBUTION_ID" \
    --paths "/*" \
    --query 'Invalidation.Id' \
    --output text)
  echo "✓ Invalidation created: $INVALIDATION_ID"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✓ Deployment complete"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
