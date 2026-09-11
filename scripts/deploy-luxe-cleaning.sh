#!/usr/bin/env bash
# Deploy Luxe Cleaning (formerly Maid & Marble) on Railway + wire Vapi voice.
#
# Prerequisites:
#   - Railway CLI: https://docs.railway.com/guides/cli
#   - Linked to the client's Astro service, OR set:
#       LUXE_CLEANING_RAILWAY_PROJECT  — Railway project id
#       LUXE_CLEANING_RAILWAY_SERVICE  — service name (default: reave)
#       LUXE_CLEANING_RAILWAY_ENV      — environment (default: production)
#   - Vapi keys in your shell (or pass inline):
#       VAPI_API_KEY, PUBLIC_VAPI_PUBLIC_KEY
#       PUBLIC_VAPI_ASSISTANT_ID — optional; created automatically when omitted
#
# Usage (from repo root):
#   VAPI_API_KEY=… PUBLIC_VAPI_PUBLIC_KEY=… bash scripts/deploy-luxe-cleaning.sh
#
# Dry run:
#   DRY_RUN=1 bash scripts/deploy-luxe-cleaning.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if command -v railway >/dev/null 2>&1; then
  RAILWAY=(railway)
elif command -v npx >/dev/null 2>&1; then
  RAILWAY=(npx --yes @railway/cli)
else
  echo "Install Railway CLI: https://docs.railway.com/guides/cli"
  exit 1
fi

PROJECT="${LUXE_CLEANING_RAILWAY_PROJECT:-}"
ENV_NAME="${LUXE_CLEANING_RAILWAY_ENV:-production}"
SERVICE="${LUXE_CLEANING_RAILWAY_SERVICE:-reave}"

RAILWAY_ARGS=()
if [[ -n "$PROJECT" ]]; then
  RAILWAY_ARGS+=(-p "$PROJECT" -e "$ENV_NAME" -s "$SERVICE")
fi

PUBLIC_SITE_DOMAIN="${PUBLIC_SITE_DOMAIN:-luxecleaning.com}"
VAPI_PHONE="${VAPI_PHONE_NUMBER:-+15089558850}"
ASSISTANT_ID="${PUBLIC_VAPI_ASSISTANT_ID:-}"

if [[ -z "$ASSISTANT_ID" && -n "${VAPI_API_KEY:-}" && "${DRY_RUN:-}" != "1" ]]; then
  echo "No PUBLIC_VAPI_ASSISTANT_ID — creating Vapi assistant for Luxe Cleaning…"
  ASSISTANT_ID="$(
    INSTALL_CONFIG=luxe-cleaning \
    COMPANY_NAME="Luxe Cleaning" \
    COMPANY_DESCRIPTION="Woman-owned premium house cleaning in Central Massachusetts." \
    VAPI_PHONE_NUMBER="$VAPI_PHONE" \
    VAPI_CREATE_IF_MISSING=1 \
    node --experimental-strip-types scripts/provision-vapi-assistant.ts --print-id
  )"
  echo "  → assistant id: $ASSISTANT_ID"
  echo ""
fi

set_var() {
  local key="$1"
  local value="$2"
  if [[ -z "$value" ]]; then
    echo "  skip $key (empty)"
    return
  fi
  if [[ "${DRY_RUN:-}" == "1" ]]; then
    echo "  [dry-run] railway variable set $key=…"
    return
  fi
  "${RAILWAY[@]}" variable set "${RAILWAY_ARGS[@]}" "$key=$value"
  echo "  ✓ $key"
}

echo "Luxe Cleaning — Railway variable apply (${SERVICE} / ${ENV_NAME})"
echo ""

# ── Install identity ──
set_var INSTALL_CONFIG "luxe-cleaning"
set_var PUBLIC_SITE_DOMAIN "$PUBLIC_SITE_DOMAIN"
set_var PUBLIC_INSTALL_HOMEPAGE_VOICE "1"
set_var COMPANY_NAME "Luxe Cleaning"
set_var COMPANY_DESCRIPTION "Woman-owned premium house cleaning in Central Massachusetts."
set_var COMPANY_SUPPORT_PHONE "$VAPI_PHONE"

# ── Vapi (web widget + inbound phone) ──
set_var VAPI_PHONE_NUMBER "$VAPI_PHONE"
set_var VAPI_API_KEY "${VAPI_API_KEY:-}"
set_var PUBLIC_VAPI_PUBLIC_KEY "${PUBLIC_VAPI_PUBLIC_KEY:-}"
set_var PUBLIC_VAPI_ASSISTANT_ID "${ASSISTANT_ID:-${PUBLIC_VAPI_ASSISTANT_ID:-}}"
set_var VAPI_CREATE_IF_MISSING "1"
set_var VAPI_PHONE_NUMBER_ID "${VAPI_PHONE_NUMBER_ID:-}"

if [[ -z "${VAPI_API_KEY:-}" || -z "${PUBLIC_VAPI_PUBLIC_KEY:-}" ]]; then
  echo ""
  echo "Warning: set VAPI_API_KEY and PUBLIC_VAPI_PUBLIC_KEY on the Astro service."
fi

echo ""
echo "Build-time (prebuild): npm run build runs sync-vapi-assistant.ts when vapi is enabled."
echo "  • Creates the assistant if PUBLIC_VAPI_ASSISTANT_ID is empty"
echo "  • Saves the id to company_config when DATABASE_URL is on the build service"
echo "  • Attaches VAPI_PHONE_NUMBER (+15089558850)"
echo "  Check Railway build logs for: [vapi-sync] Created assistant …"
echo ""

if [[ "${DRY_RUN:-}" == "1" ]]; then
  echo "Dry run complete — no Railway changes."
else
  echo "Variables set. Redeploy this service (or push to main if auto-deploy) to run prebuild."
fi
