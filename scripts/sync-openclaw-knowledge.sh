#!/usr/bin/env bash
# Re-copy OpenClaw email-tools docs + rule JSON into src/knowledge/.
# Default: sibling repo at ../openclaw-email-tools (same parent as reave-1).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OC="${OPENCLAW_EMAIL_TOOLS_DIR:-$ROOT/../openclaw-email-tools}"
RV="$ROOT/src/knowledge"
if [[ ! -d "$OC" ]]; then
  echo "Expected OpenClaw repo at: $OC" >&2
  echo "Set OPENCLAW_EMAIL_TOOLS_DIR to override." >&2
  exit 1
fi

hdr() {
  printf '%s\n\n' "$1"
  printf '> **Source:** `openclaw-email-tools`. Snapshot: %s. Not auto-synced — run this script after changes there.\n\n' "$(date +%F)"
  printf '%s\n\n' '---'
  printf '\n'
}

hdr "# OpenClaw email tools — client guide (snapshot)" | cat - "$OC/CLIENT.md" >"$RV/openclaw-client-guide.md"
hdr "# OpenClaw email tools — developer README (snapshot)" | cat - "$OC/README.md" >"$RV/openclaw-developer-readme.md"

{
  hdr "# OpenClaw email rules — JSON snapshots"
  echo "## \`src/config/status-rules.json\` (shipped default in repo)"
  echo '```json'
  cat "$OC/src/config/status-rules.json"
  echo '```'
  echo
  echo "## \`data/status-rules.json\` (local working copy)"
  echo '```json'
  cat "$OC/data/status-rules.json"
  echo '```'
  echo
  prod_json=$(ls "$OC/data"/rules-openclaw-email-tools-production-*.json 2>/dev/null | head -1 || true)
  if [[ -n "${prod_json:-}" ]]; then
    echo "## \`$(basename "$prod_json")\` (Railway export in that repo)"
    echo '```json'
    cat "$prod_json"
    echo '```'
  else
    echo "## (no \`rules-openclaw-email-tools-production-*.json\` found under data/)"
  fi
} >"$RV/openclaw-email-rules-json-snapshots.md"

{
  hdr "# OpenClaw email tools — custom triggers (reference)"
  echo "Rules invoke side effects with \`trigger:<name>\` in the \`do\` array."
  echo
  echo "## Registered triggers (from \`src/handlers/triggers.ts\`)"
  echo
  echo "| Name | Purpose |"
  echo "|------|---------|"
  echo "| \`noop\` | No-op (returns \`{ ok: true }\`). |"
  echo "| \`telegram\` | POST to Telegram \`sendMessage\` using \`TELEGRAM_BOT_TOKEN\` + \`TELEGRAM_CHAT_ID\` (Markdown body with status/from/subject). |"
  echo "| \`webhook\` | POST JSON payload to \`WEBHOOK_URL\`. |"
  echo "| \`example-notify\` | Stub / demo — replace for real notification side-effect. |"
  echo
  echo "> **Note:** Separate from the \`reave-1\` Business OS webhook bot; may share the same bot token but uses \`TELEGRAM_CHAT_ID\` for outbound alerts."
} >"$RV/openclaw-triggers-reference.md"

echo "Synced OpenClaw knowledge into $RV"
ls -la "$RV"/openclaw-*.md
