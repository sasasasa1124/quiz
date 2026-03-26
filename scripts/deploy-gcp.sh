#!/bin/bash
set -euo pipefail

PROJECT=ehc-kota-sasamoto-c34610
REGION=asia-northeast1
REGISTRY=$REGION-docker.pkg.dev/$PROJECT/scholion/scholion
SERVICE=scholion
SA=scholion-sa@$PROJECT.iam.gserviceaccount.com
CONNECTOR=scholion-connector

SHA=$(git rev-parse --short HEAD)
IMAGE=$REGISTRY:$SHA

# Load secrets from .env.gcp if present
if [ -f "$(dirname "$0")/../.env.gcp" ]; then
  set -o allexport
  source "$(dirname "$0")/../.env.gcp"
  set +o allexport
fi

PUBKEY=${NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:-""}

echo "==> Submitting build to Cloud Build (image: $IMAGE)"
gcloud builds submit . \
  --config cloudbuild.yaml \
  --substitutions "_IMAGE=$IMAGE,_NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=$PUBKEY" \
  --project $PROJECT

echo "==> Deploying to Cloud Run"
gcloud run deploy $SERVICE \
  --image "$IMAGE" \
  --region $REGION \
  --service-account $SA \
  --platform managed \
  --allow-unauthenticated \
  --vpc-connector $CONNECTOR \
  --vpc-egress private-ranges-only \
  --set-secrets=CLERK_SECRET_KEY=CLERK_SECRET_KEY:latest \
  --set-secrets=GEMINI_API_KEY=GEMINI_API_KEY:latest \
  --set-secrets=DATABASE_URL=DATABASE_URL:latest \
  --set-secrets=ADMIN_EMAILS=ADMIN_EMAILS:latest \
  --set-secrets=GITHUB_TOKEN=GITHUB_TOKEN:latest \
  --set-secrets=GITHUB_OWNER=GITHUB_OWNER:latest \
  --set-secrets=GITHUB_REPO=GITHUB_REPO:latest \
  --project $PROJECT

echo "==> Deployed:"
gcloud run services describe $SERVICE --region $REGION --project $PROJECT \
  --format="value(status.url)"
