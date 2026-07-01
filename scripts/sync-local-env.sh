#!/usr/bin/env bash
# Merge Railway production variables into .env for local dev parity.
# Run from repo root after: railway link && railway service reave
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! command -v railway >/dev/null 2>&1; then
  echo "Install Railway CLI: https://docs.railway.com/guides/cli"
  exit 1
fi

echo "Pulling variables from linked Railway service…"
railway variable list -k > .env.railway

ENV_FILE=".env"
touch "$ENV_FILE"

# Keys that make local admin match production (skip RAILWAY_* meta and private BOOKING_API_URL).
SYNC_KEYS=(
  DATABASE_URL
  FEATURES
  PUBLIC_BOOKING_API_URL
  CALCOM_WEBAPP_URL
  CALCOM_USERNAME
  CALCOM_EVENT_TYPE_ID
  CONTACT_API_BASE_URL
  CONTACT_API_KEY
  CRATER_API_BASE_URL
  CRATER_API_TOKEN
  RESEND_API_KEY
  RESEND_WEBHOOK_SECRET
  RESEND_FROM
  ANTHROPIC_API_KEY
  ANTHROPIC_MODEL
  AGENT_ALERT_USER_ID
  GITHUB_TOKEN
  KINSTA_API_KEY
  KINSTA_COMPANY_ID
  CARDDAV_USERNAME
  CARDDAV_PASSWORD
  VAPID_PUBLIC_KEY
  VAPID_PRIVATE_KEY
  VAPID_SUBJECT
  PUSH_ENABLED
)

added=0
skipped=0

for key in "${SYNC_KEYS[@]}"; do
  line="$(grep -E "^${key}=" .env.railway || true)"
  if [[ -z "$line" ]]; then
    continue
  fi
  if grep -qE "^${key}=" "$ENV_FILE"; then
    skipped=$((skipped + 1))
    continue
  fi
  echo "$line" >> "$ENV_FILE"
  added=$((added + 1))
  echo "  + $key"
done

echo ""
echo "Done — added $added variable(s), kept $skipped existing value(s) in $ENV_FILE."
echo "Note: BOOKING_API_URL (Railway private network) is omitted; dev uses PUBLIC_BOOKING_API_URL."
echo "Restart \`npm run dev\` to pick up changes. Or run \`npm run dev:railway\` without copying."
