#!/bin/bash
# Fetches secrets from GCP Secret Manager and writes them to the env file
# Called by systemd ExecStartPre before NanoClaw starts
set -euo pipefail

ENV_DIR="/mnt/data/nanoclaw/data/env"
ENV_FILE="$ENV_DIR/env"
mkdir -p "$ENV_DIR"

# Determine project from metadata server
PROJECT=$(curl -s -H "Metadata-Flavor: Google" \
  http://metadata.google.internal/computeMetadata/v1/project/project-id)

echo "Fetching secrets from project: $PROJECT"

# Fetch each secret and write to env file
# Only fetches secrets that exist — missing secrets are skipped with a warning
: > "$ENV_FILE"  # truncate

fetch_secret() {
  local name=$1
  local env_var=$2
  local value
  if value=$(gcloud secrets versions access latest --secret="$name" --project="$PROJECT" 2>/dev/null); then
    echo "${env_var}=${value}" >> "$ENV_FILE"
    echo "  Loaded: $name -> $env_var"
  else
    echo "  Warning: Secret '$name' not found or not accessible, skipping"
  fi
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
