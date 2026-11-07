#!/usr/bin/env bash
# One-time GCP bootstrap for ONE environment (run once for staging, once for prod).
# Usage: PROJECT_ID=dropboard-staging BILLING_ACCOUNT=XXXXXX-XXXXXX-XXXXXX \
#        GITHUB_REPO=haziq-bangash/Dropboard BUDGET_USD=20 ./infra/setup-gcp.sh
set -euo pipefail

: "${PROJECT_ID:?}" "${BILLING_ACCOUNT:?}" "${GITHUB_REPO:?}"
REGION="${REGION:-europe-west1}"
BUDGET_USD="${BUDGET_USD:-20}"
SA="${SA_NAME:-dropboard-deployer}"
POOL="${POOL:-dropboard-github}"
SA_EMAIL="$SA@$PROJECT_ID.iam.gserviceaccount.com"

gcloud projects describe "$PROJECT_ID" >/dev/null 2>&1 || gcloud projects create "$PROJECT_ID"
gcloud billing projects link "$PROJECT_ID" --billing-account="$BILLING_ACCOUNT"
gcloud config set project "$PROJECT_ID"

gcloud services enable run.googleapis.com artifactregistry.googleapis.com \
  iamcredentials.googleapis.com cloudbilling.googleapis.com billingbudgets.googleapis.com

# Artifact Registry with cleanup: keep only the 5 newest images
gcloud artifacts repositories describe dropboard --location="$REGION" >/dev/null 2>&1 || \
  gcloud artifacts repositories create dropboard --repository-format=docker --location="$REGION"
cat > /tmp/cleanup.json <<JSON
[{"name":"keep-recent","action":{"type":"Keep"},"mostRecentVersions":{"keepCount":5}},
 {"name":"delete-rest","action":{"type":"Delete"},"condition":{"tagState":"any"}}]
JSON
gcloud artifacts repositories set-cleanup-policies dropboard --location="$REGION" --policy=/tmp/cleanup.json

# Deployer service account (least privilege)
gcloud iam service-accounts describe "$SA_EMAIL" >/dev/null 2>&1 || \
  gcloud iam service-accounts create "$SA" --display-name="Dropboard GitHub deployer"
for role in roles/run.admin roles/artifactregistry.writer roles/iam.serviceAccountUser; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:$SA_EMAIL" --role="$role" --condition=None >/dev/null
done

# Workload Identity Federation: keyless auth, restricted to this repo
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
gcloud iam workload-identity-pools describe "$POOL" --location=global >/dev/null 2>&1 || \
  gcloud iam workload-identity-pools create "$POOL" --location=global --display-name="GitHub"
gcloud iam workload-identity-pools providers describe github-oidc \
  --location=global --workload-identity-pool="$POOL" >/dev/null 2>&1 || \
  gcloud iam workload-identity-pools providers create-oidc github-oidc \
    --location=global --workload-identity-pool="$POOL" \
    --issuer-uri="https://token.actions.githubusercontent.com" \
    --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
    --attribute-condition="assertion.repository=='$GITHUB_REPO'"
gcloud iam service-accounts add-iam-policy-binding "$SA_EMAIL" \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/$POOL/attribute.repository/$GITHUB_REPO" >/dev/null

# Budget alerts at 50/90/100% of BUDGET_USD
gcloud billing budgets create --billing-account="$BILLING_ACCOUNT" \
  --display-name="$PROJECT_ID budget" \
  --filter-projects="projects/$PROJECT_ID" \
  --budget-amount="${BUDGET_USD}USD" \
  --threshold-rule=percent=0.5 --threshold-rule=percent=0.9 --threshold-rule=percent=1.0 || \
  echo "Budget creation failed (may already exist); check the console."

echo
echo "Set these GitHub environment variables/secrets for this environment:"
echo "  GCP_PROJECT_ID = $PROJECT_ID"
echo "  GCP_REGION     = $REGION"
echo "  GCP_SERVICE_ACCOUNT = $SA_EMAIL"
echo "  GCP_WORKLOAD_IDENTITY_PROVIDER = projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/$POOL/providers/github-oidc"
