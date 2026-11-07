#!/usr/bin/env bash
# Creates a dedicated runtime identity for the Dropboard services, so they do not share the project's default compute account.
# It can call Vertex AI (so Pilot needs no API key) and read only Dropboard's own secrets.
# Usage: PROJECT_ID=travelcompanion-341011 ./infra/setup-runtime-sa.sh
# Safe to re-run. Run it before infra/setup-secrets.sh (which detects this account), or again afterwards.
set -euo pipefail

: "${PROJECT_ID:?}"
SA_NAME="${RUNTIME_SA_NAME:-dropboard-runtime}"
SA_EMAIL="$SA_NAME@$PROJECT_ID.iam.gserviceaccount.com"

gcloud services enable aiplatform.googleapis.com --project="$PROJECT_ID"

gcloud iam service-accounts describe "$SA_EMAIL" --project="$PROJECT_ID" >/dev/null 2>&1 || \
  gcloud iam service-accounts create "$SA_NAME" --display-name="Dropboard runtime" --project="$PROJECT_ID"

# Vertex AI: call Gemini models with this identity
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$SA_EMAIL" --role=roles/aiplatform.user --condition=None >/dev/null

# Secrets: only the ones that exist, only for this account
for secret in database-url better-auth-secret anthropic-api-key google-api-key google-client-id google-client-secret resend-api-key; do
  if gcloud secrets describe "$secret" --project="$PROJECT_ID" >/dev/null 2>&1; then
    gcloud secrets add-iam-policy-binding "$secret" --project="$PROJECT_ID" \
      --member="serviceAccount:$SA_EMAIL" --role=roles/secretmanager.secretAccessor >/dev/null
    echo "granted access to secret: $secret"
  fi
done

echo
echo "Runtime account ready: $SA_EMAIL"
echo "Tell the deploy workflow to use it, and which AI provider to run:"
echo "  gh variable set RUNTIME_SERVICE_ACCOUNT --env staging --repo haziq-bangash/Dropboard --body $SA_EMAIL"
echo "  gh variable set AI_PROVIDER --env staging --repo haziq-bangash/Dropboard --body google"
