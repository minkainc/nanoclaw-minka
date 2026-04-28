#!/bin/bash
# Fetches secrets from GCP Secret Manager and writes them to the env file.
# Called by systemd ExecStartPre as the nanoclaw user.
#
# Uses the metadata server + Secret Manager REST API directly via curl,
# bypassing snap-installed gcloud (which refuses HOME outside /home — the
# nanoclaw user's home is /mnt/data/nanoclaw).
set -euo pipefail

ENV_DIR="/mnt/data/nanoclaw/data/env"
ENV_FILE="$ENV_DIR/env"
mkdir -p "$ENV_DIR"

METADATA_HEADER="Metadata-Flavor: Google"
METADATA_BASE="http://metadata.google.internal/computeMetadata/v1"

PROJECT=$(curl -fsS -H "$METADATA_HEADER" "$METADATA_BASE/project/project-id")
TOKEN=$(curl -fsS -H "$METADATA_HEADER" \
  "$METADATA_BASE/instance/service-accounts/default/token" |
  python3 -c 'import sys,json; print(json.load(sys.stdin)["access_token"])')

echo "Fetching secrets from project: $PROJECT"

: > "$ENV_FILE"

fetch_secret() {
  local name=$1
  local env_var=$2
  local url="https://secretmanager.googleapis.com/v1/projects/$PROJECT/secrets/$name/versions/latest:access"
  local body value

  body=$(curl -fsS -H "Authorization: Bearer $TOKEN" "$url" 2>/dev/null) || {
    echo "  Warning: Secret '$name' not found or not accessible, skipping"
    return
  }

  # Response shape: { "name": "...", "payload": { "data": "<base64>" } }
  value=$(printf '%s' "$body" |
    python3 -c 'import sys,json,base64; print(base64.b64decode(json.load(sys.stdin)["payload"]["data"]).decode("utf-8"), end="")') || {
    echo "  Warning: Secret '$name' decode failed, skipping"
    return
  }

  echo "${env_var}=${value}" >> "$ENV_FILE"
  echo "  Loaded: $name -> $env_var"
}

fetch_secret "anthropic-api-key"     "ANTHROPIC_API_KEY"
fetch_secret "whatsapp-auth-state"   "WHATSAPP_AUTH_STATE"
fetch_secret "slack-bot-token"       "SLACK_BOT_TOKEN"
fetch_secret "slack-signing-secret"  "SLACK_SIGNING_SECRET"
fetch_secret "discord-bot-token"     "DISCORD_BOT_TOKEN"
fetch_secret "telegram-bot-token"    "TELEGRAM_BOT_TOKEN"
fetch_secret "gmail-credentials"     "GMAIL_CREDENTIALS"
fetch_secret "crm-database-url"      "CRM_DATABASE_URL"
fetch_secret "linear-api-key"        "LINEAR_API_KEY"

# Restrict permissions — only nanoclaw user can read
chmod 600 "$ENV_FILE"

echo "Secrets written to $ENV_FILE"
