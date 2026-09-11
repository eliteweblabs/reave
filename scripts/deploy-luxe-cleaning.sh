#!/usr/bin/env bash
# Deploy Luxe Cleaning (formerly Maid & Marble) on Railway + wire Vapi voice.
#
# Preferred path (Cloud Agent / no CLI): RAILWAY_API_TOKEN + GraphQL configure script
#   RAILWAY_API_TOKEN=… VAPI_API_KEY=… PUBLIC_VAPI_PUBLIC_KEY=… npm run configure:luxe-cleaning-railway
#
# CLI fallback (local machine with railway login):
#   VAPI_API_KEY=… PUBLIC_VAPI_PUBLIC_KEY=… bash scripts/deploy-luxe-cleaning.sh
#
# Env:
#   LUXE_CLEANING_RAILWAY_PROJECT  — Railway project id (see docs/deploy-checklists/luxe-cleaning.md)
#   LUXE_CLEANING_RAILWAY_SERVICE  — service name (default: auto / reave)
#   LUXE_CLEANING_RAILWAY_ENV      — environment (default: production)
#
# Dry run:
#   DRY_RUN=1 bash scripts/deploy-luxe-cleaning.sh
#   npm run configure:luxe-cleaning-railway -- --dry-run
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -n "${RAILWAY_API_TOKEN:-}" ]]; then
  echo "RAILWAY_API_TOKEN set — using GraphQL configure script (no Railway CLI/MCP)."
  CONFIG_ARGS=()
  [[ "${DRY_RUN:-}" == "1" ]] && CONFIG_ARGS+=(--dry-run)
  exec npm run configure:luxe-cleaning-railway -- "${CONFIG_ARGS[@]}"
fi

if command -v railway >/dev/null 2>&1; then
  RAILWAY=(railway)
elif command -v npx >/dev/null 2>&1; then
  RAILWAY=(npx --yes @railway/cli)
else
  echo "Install Railway CLI or set RAILWAY_API_TOKEN for GraphQL configure:"
  echo "  npm run configure:luxe-cleaning-railway"
  exit 1
fi

PROJECT="${LUXE_CLEANING_RAILWAY_PROJECT:-}"
ENV_NAME="${LUXE_CLEANING_RAILWAY_ENV:-production}"
SERVICE="${LUXE_CLEANING_RAILWAY_SERVICE:-reave}"

RAILWAY_ARGS=()
if [[ -n "$PROJECT" ]]; then
  RAILWAY_ARGS+=(-p "$PROJECT" -e "$ENV_NAME" -s "$SERVICE")
fi

PUBLIC_SITE_DOMAIN="${PUBLIC_SITE_DOMAIN:-maidandmarble.com}"
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

set_var INSTALL_CONFIG "luxe-cleaning"
set_var PUBLIC_SITE_DOMAIN "$PUBLIC_SITE_DOMAIN"
set_var PUBLIC_INSTALL_HOMEPAGE_VOICE "1"
set_var COMPANY_NAME "Luxe Cleaning"
set_var COMPANY_DESCRIPTION "Woman-owned premium house cleaning in Central Massachusetts."
set_var COMPANY_SUPPORT_PHONE "$VAPI_PHONE"

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
echo "  Check Railway build logs for: [vapi-sync] Created assistant …"
echo ""

if [[ "${DRY_RUN:-}" == "1" ]]; then
  echo "Dry run complete — no Railway changes."
else
  echo "Variables set. Redeploy this service (or push to main if auto-deploy) to run prebuild."
fi
