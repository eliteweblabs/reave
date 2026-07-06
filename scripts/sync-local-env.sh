#!/usr/bin/env bash
# Point local .env at Reave App production (reave.app) using public URLs reachable from your Mac.
# Reave Demo is a separate Railway project with its own empty databases — do not use it for local dev parity.
#
# Usage (from repo root):
#   npm run sync:env
#   npm run dev
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! command -v railway >/dev/null 2>&1; then
  echo "Install Railway CLI: https://docs.railway.com/guides/cli"
  exit 1
fi

# Reave App — production at reave.app (see GITHUB_AND_RAILWAY.md)
REAVE_APP_PROJECT="${REAVE_APP_PROJECT_ID:-af65eb9a-b11c-4c1c-8030-66b4347dcf71}"
REAVE_APP_ENV="${REAVE_APP_ENVIRONMENT:-production}"

echo "Pulling Reave App ($REAVE_APP_ENV) variables…"
railway variable list -k -p "$REAVE_APP_PROJECT" -e "$REAVE_APP_ENV" -s reave > .env.railway
railway variable list -k -p "$REAVE_APP_PROJECT" -e "$REAVE_APP_ENV" -s reave-postgres > .env.railway.postgres

ENV_FILE=".env"
touch "$ENV_FILE"

upsert_env() {
  local key="$1"
  local value="$2"
  if [[ -z "$value" ]]; then
    return
  fi
  if grep -qE "^${key}=" "$ENV_FILE"; then
    # Portable in-place replace (macOS + Linux)
    local tmp
    tmp="$(mktemp)"
    awk -v k="$key" -v v="$value" 'BEGIN{done=0} $0 ~ "^" k "=" {print k "=" v; done=1; next} {print} END{if(!done) print k "=" v}' "$ENV_FILE" > "$tmp"
    mv "$tmp" "$ENV_FILE"
    echo "  ~ $key"
  else
    printf '%s=%s\n' "$key" "$value" >> "$ENV_FILE"
    echo "  + $key"
  fi
}

# Public Postgres URL for local dev (internal *.railway.internal does not resolve on localhost).
DB_PUBLIC="$(grep -E '^DATABASE_PUBLIC_URL=' .env.railway.postgres | cut -d= -f2- || true)"
if [[ -n "$DB_PUBLIC" ]]; then
  upsert_env "DATABASE_URL" "$DB_PUBLIC"
else
  echo "  ! DATABASE_PUBLIC_URL missing on reave-postgres — DATABASE_URL unchanged"
fi

# Public contact-api URL (production uses http://contact-api.railway.internal:8080).
CONTACT_PUBLIC="$(grep -E '^RAILWAY_SERVICE_CONTACT_API_URL=' .env.railway | cut -d= -f2- || true)"
CONTACT_KEY="$(grep -E '^CONTACT_API_KEY=' .env.railway | cut -d= -f2- || true)"
if [[ -n "$CONTACT_PUBLIC" ]]; then
  upsert_env "CONTACT_API_BASE_URL" "https://${CONTACT_PUBLIC}"
fi
if [[ -n "$CONTACT_KEY" ]]; then
  upsert_env "CONTACT_API_KEY" "$CONTACT_KEY"
fi

# Other production keys — always refresh so local matches reave.app.
SYNC_KEYS=(
  FEATURES
  PUBLIC_BOOKING_API_URL
  CALCOM_WEBAPP_URL
  CALCOM_USERNAME
  CALCOM_EVENT_TYPE_ID
  CRATER_API_BASE_URL
  CRATER_API_TOKEN
  RESEND_API_KEY
  RESEND_WEBHOOK_SECRET
  RESEND_FROM
  CLOUDFLARE_API_TOKEN
  CLOUDFLARE_ZONE_ID
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
  PUBLIC_SITE_URL
  PUBLIC_CLERK_PUBLISHABLE_KEY
)

for key in "${SYNC_KEYS[@]}"; do
  line="$(grep -E "^${key}=" .env.railway || true)"
  if [[ -n "$line" ]]; then
    upsert_env "$key" "${line#*=}"
  fi
done

echo ""
echo "Done — $ENV_FILE now targets Reave App production (reave.app)."
echo "DATABASE_URL uses the public Postgres proxy; never use npm run dev:railway (it overrides with internal URLs)."
echo "Restart: npm run dev"
