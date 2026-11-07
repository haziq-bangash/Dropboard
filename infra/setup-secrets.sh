#!/usr/bin/env bash
# One-time (and re-runnable) Secret Manager setup for one environment.
# Usage: PROJECT_ID=travelcompanion-341011 DATABASE_URL='postgres://user:pass@host/db?sslmode=require' ./infra/setup-secrets.sh
# Optional: ANTHROPIC_API_KEY=... and/or GOOGLE_API_KEY=... also store provider keys. With AI_PROVIDER=google no key is
# needed at all when the service runs as the account from infra/setup-runtime-sa.sh.
# Re-running adds a new secret version; set ROTATE_AUTH_SECRET=1 to also rotate BETTER_AUTH_SECRET
# (this signs every user out). By default an existing auth secret is kept.
set -euo pipefail

: "${PROJECT_ID:?}" "${DATABASE_URL:?}"
SA_NAME="${SA_NAME:-dropboard-deployer}"
DEPLOYER="$SA_NAME@$PROJECT_ID.iam.gserviceaccount.com"
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
# Prefer the dedicated runtime account (see infra/setup-runtime-sa.sh); fall back to the project's default one
RUNTIME_SA="$PROJECT_NUMBER-compute@developer.gserviceaccount.com"
if gcloud iam service-accounts describe "dropboard-runtime@$PROJECT_ID.iam.gserviceaccount.com" --project="$PROJECT_ID" >/dev/null 2>&1; then
  RUNTIME_SA="dropboard-runtime@$PROJECT_ID.iam.gserviceaccount.com"
fi

gcloud services enable secretmanager.googleapis.com --project="$PROJECT_ID"

put_secret() { # name, value
  local name="$1" value="$2"
  if gcloud secrets describe "$name" --project="$PROJECT_ID" >/dev/null 2>&1; then
    printf '%s' "$value" | gcloud secrets versions add "$name" --project="$PROJECT_ID" --data-file=- >/dev/null
  else
    printf '%s' "$value" | gcloud secrets create "$name" --project="$PROJECT_ID" --replication-policy=automatic --data-file=- >/dev/null
  fi
}

put_secret database-url "$DATABASE_URL"

if ! gcloud secrets describe better-auth-secret --project="$PROJECT_ID" >/dev/null 2>&1 || [ "${ROTATE_AUTH_SECRET:-0}" = 1 ]; then
  put_secret better-auth-secret "$(openssl rand -base64 48 | tr -d '\n')"
fi

names="database-url better-auth-secret"
if [ -n "${ANTHROPIC_API_KEY:-}" ]; then
  put_secret anthropic-api-key "$ANTHROPIC_API_KEY"
  names="$names anthropic-api-key"
fi
# Optional: a Google API key, only if you do not use the service identity for Vertex AI
if [ -n "${GOOGLE_API_KEY:-}" ]; then
  put_secret google-api-key "$GOOGLE_API_KEY"
  names="$names google-api-key"
fi
# Optional: Google sign-in (OAuth client from Google Cloud console > Credentials)
if [ -n "${GOOGLE_CLIENT_ID:-}" ] && [ -n "${GOOGLE_CLIENT_SECRET:-}" ]; then
  put_secret google-client-id "$GOOGLE_CLIENT_ID"
  put_secret google-client-secret "$GOOGLE_CLIENT_SECRET"
  names="$names google-client-id google-client-secret"
fi

# Narrow, per-secret access: the runtime account reads values; the deployer may only look the secrets up.
for name in $names; do
  gcloud secrets add-iam-policy-binding "$name" --project="$PROJECT_ID" \
    --member="serviceAccount:$RUNTIME_SA" --role=roles/secretmanager.secretAccessor >/dev/null
  gcloud secrets add-iam-policy-binding "$name" --project="$PROJECT_ID" \
    --member="serviceAccount:$DEPLOYER" --role=roles/secretmanager.viewer >/dev/null
done

echo
echo "Secrets ready: $names"
echo "Next: add the same database URL as a GitHub secret named DATABASE_URL on the 'staging' environment"
echo "(the deploy workflow uses it to run prisma migrate deploy):"
echo "  gh secret set DATABASE_URL --env staging --repo haziq-bangash/Dropboard"
