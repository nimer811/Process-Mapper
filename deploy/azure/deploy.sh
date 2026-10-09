#!/usr/bin/env bash
# Creates the Process AI demo on Azure (free-tier friendly) with the Azure CLI:
#   - Azure Database for PostgreSQL Flexible Server, Burstable B1ms, 32 GB (free for 12 months on a
#     free account), with pgvector allowed
#   - a Storage account + private container for uploaded files (Blob)
#   - a Container Apps environment and app running ghcr.io/nimer811/process-mapper:latest, scaling to
#     zero when idle (stays within the monthly free allowance for a demo)
# Usage:  az login   then   bash deploy/azure/deploy.sh
# Optional: LOCATION=westeurope  LLM_API_KEY=sk-...  (otherwise you paste the key in the portal)
# Safe to run again: existing resources are kept; the app is updated to the latest image.
set -euo pipefail

LOCATION="${LOCATION:-uaenorth}"
RG="${RG:-process-ai-demo}"
APP="${APP:-process-ai}"
ENV_NAME="${ENV_NAME:-process-ai-env}"
IMAGE="${IMAGE:-ghcr.io/nimer811/process-mapper:latest}"
STATE="$(dirname "$0")/.state"   # generated names and secrets (git-ignored), reused on re-runs
mkdir -p "$STATE"
remember() { local f="$STATE/$1"; [ -s "$f" ] || printf '%s' "$2" > "$f"; cat "$f"; }

SUFFIX=$(remember suffix "$(openssl rand -hex 3)")
PG="${PG:-process-ai-db-$SUFFIX}"
SA="${SA:-processai$SUFFIX}"
PG_PASSWORD=$(remember pg-password "Pa$(openssl rand -hex 16)")
ACCESS_CODE=$(remember access-code "$(openssl rand -base64 9 | tr -dc 'A-Za-z0-9' | head -c 10)")

echo "==> Region $LOCATION, resource group $RG"
az config set extension.use_dynamic_install=yes_without_prompt --only-show-errors >/dev/null
az provider register --namespace Microsoft.App --wait --only-show-errors
az provider register --namespace Microsoft.DBforPostgreSQL --wait --only-show-errors
az provider register --namespace Microsoft.Storage --wait --only-show-errors
az group create -n "$RG" -l "$LOCATION" -o none

echo "==> PostgreSQL (Burstable B1ms, 32 GB) — takes 5–10 minutes the first time"
if ! az postgres flexible-server show -g "$RG" -n "$PG" -o none 2>/dev/null; then
  az postgres flexible-server create -g "$RG" -n "$PG" -l "$LOCATION" \
    --tier Burstable --sku-name Standard_B1ms --storage-size 32 --version 16 \
    --admin-user processai --admin-password "$PG_PASSWORD" \
    --public-access 0.0.0.0 --high-availability Disabled --yes -o none
fi
az postgres flexible-server parameter set -g "$RG" --server-name "$PG" --name azure.extensions --value VECTOR -o none
az postgres flexible-server db create -g "$RG" --server-name "$PG" --database-name process_ai -o none 2>/dev/null || true
DATABASE_URL="postgres://processai:${PG_PASSWORD}@${PG}.postgres.database.azure.com:5432/process_ai?sslmode=require"

echo "==> Storage for uploaded files"
az storage account show -g "$RG" -n "$SA" -o none 2>/dev/null ||
  az storage account create -g "$RG" -n "$SA" -l "$LOCATION" --sku Standard_LRS --kind StorageV2 \
    --min-tls-version TLS1_2 --allow-blob-public-access false -o none
STORAGE_CS=$(az storage account show-connection-string -g "$RG" -n "$SA" --query connectionString -o tsv)

echo "==> Container Apps environment"
az containerapp env show -g "$RG" -n "$ENV_NAME" -o none 2>/dev/null ||
  az containerapp env create -g "$RG" -n "$ENV_NAME" -l "$LOCATION" --logs-destination none -o none

KEY="${LLM_API_KEY:-set-me-in-the-portal}"
SECRETS=(db-url="$DATABASE_URL" storage-cs="$STORAGE_CS" access-code="$ACCESS_CODE")
ENVS=(
  NODE_ENV=production MIGRATE_ON_START=true SEED_ON_START=true SEED_DEMO_ON_START=true
  AUTH_MODE=dev ALLOW_DEV_AUTH=true ORG_CODE=7X STORAGE_DRIVER=azure LOG_LEVEL=info
  AI_MONTHLY_TOKEN_BUDGET=5000000 LLM_PROVIDER=openai LLM_CHAT_MODEL=gpt-5.4-mini
  LLM_EMBEDDING_MODEL=text-embedding-3-small
  DATABASE_URL=secretref:db-url AZURE_STORAGE_CONNECTION_STRING=secretref:storage-cs
  DEMO_ACCESS_CODE=secretref:access-code LLM_API_KEY=secretref:llm-api-key
)

echo "==> The app (scales to zero when idle)"
if az containerapp show -g "$RG" -n "$APP" -o none 2>/dev/null; then
  az containerapp secret set -g "$RG" -n "$APP" --secrets "${SECRETS[@]}" -o none
  [ -n "${LLM_API_KEY:-}" ] && az containerapp secret set -g "$RG" -n "$APP" --secrets llm-api-key="$KEY" -o none
  az containerapp update -g "$RG" -n "$APP" --image "$IMAGE" --set-env-vars "${ENVS[@]}" \
    --revision-suffix "r$(date +%s)" -o none
else
  az containerapp create -g "$RG" -n "$APP" --environment "$ENV_NAME" --image "$IMAGE" \
    --ingress external --target-port 3000 --cpu 0.5 --memory 1.0Gi --min-replicas 0 --max-replicas 1 \
    --secrets "${SECRETS[@]}" llm-api-key="$KEY" --env-vars "${ENVS[@]}" -o none
fi

FQDN=$(az containerapp show -g "$RG" -n "$APP" --query properties.configuration.ingress.fqdn -o tsv)
echo
echo "Process AI: https://$FQDN"
echo "Access code: $ACCESS_CODE"
[ -z "${LLM_API_KEY:-}" ] && echo "Next: paste your OpenAI key in the portal (Container App '$APP' → Secrets → llm-api-key), then restart."
echo "The first visit after a quiet period takes ~20–30 s while the app wakes up."
