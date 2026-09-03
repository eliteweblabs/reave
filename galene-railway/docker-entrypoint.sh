#!/bin/sh
set -eu

PORT="${PORT:-8080}"
GALENE_DATA="${GALENE_DATA:-/data}"
GALENE_GROUPS="${GALENE_GROUPS:-/groups}"
GALENE_STATIC="${GALENE_STATIC:-/opt/galene/static}"
GALENE_RECORDINGS="${GALENE_RECORDINGS:-/data/recordings}"
GALENE_TURN_LISTEN_PORT="${GALENE_TURN_LISTEN_PORT:-3478}"
GALENE_RELAY_ONLY="${GALENE_RELAY_ONLY:-1}"
GALENE_ADMIN_USERNAME="${GALENE_ADMIN_USERNAME:-admin}"
GALENE_DEFAULT_GROUP="${GALENE_DEFAULT_GROUP:-meet}"

mkdir -p "${GALENE_DATA}" "${GALENE_RECORDINGS}" "${GALENE_DATA}/var"

# Seed bundled groups into the data volume on first boot.
if [ ! -d "${GALENE_DATA}/groups" ] || [ -z "$(ls -A "${GALENE_DATA}/groups" 2>/dev/null || true)" ]; then
  mkdir -p "${GALENE_DATA}/groups"
  if [ -d /groups ] && [ -n "$(ls -A /groups 2>/dev/null || true)" ]; then
    cp -a /groups/. "${GALENE_DATA}/groups/"
  fi
  if [ -n "${GALENE_GROUP_PASSWORD:-}" ] && [ -f "${GALENE_DATA}/groups/${GALENE_DEFAULT_GROUP}.json" ]; then
    rm -f "${GALENE_DATA}/groups/${GALENE_DEFAULT_GROUP}.json"
  fi
fi
GALENE_GROUPS="${GALENE_DATA}/groups"

PUBLIC_URL="${GALENE_PUBLIC_URL:-}"
if [ -z "${PUBLIC_URL}" ] && [ -n "${RAILWAY_PUBLIC_DOMAIN:-}" ]; then
  PUBLIC_URL="https://${RAILWAY_PUBLIC_DOMAIN}/"
fi
if [ -z "${PUBLIC_URL}" ]; then
  PUBLIC_URL="http://127.0.0.1:${PORT}/"
fi
case "${PUBLIC_URL}" in
  */) ;;
  *) PUBLIC_URL="${PUBLIC_URL}/" ;;
esac

CANONICAL_HOST="${GALENE_CANONICAL_HOST:-}"
if [ -z "${CANONICAL_HOST}" ]; then
  CANONICAL_HOST="$(printf '%s' "${PUBLIC_URL}" | sed -E 's#^https?://([^/:]+).*#\1#')"
fi

ADMIN_SECRET_FILE="${GALENE_DATA}/admin-password"
ADMIN_PASSWORD="${GALENE_ADMIN_PASSWORD:-}"
if [ -z "${ADMIN_PASSWORD}" ]; then
  if [ -f "${ADMIN_SECRET_FILE}" ]; then
    ADMIN_PASSWORD="$(cat "${ADMIN_SECRET_FILE}")"
  else
    ADMIN_PASSWORD="$(openssl rand -base64 18 | tr -d '/+=' | head -c 18)"
    printf '%s' "${ADMIN_PASSWORD}" > "${ADMIN_SECRET_FILE}"
    echo "Generated GALENE_ADMIN_PASSWORD (saved under /data): ${ADMIN_PASSWORD}"
  fi
else
  printf '%s' "${ADMIN_PASSWORD}" > "${ADMIN_SECRET_FILE}"
fi

CONFIG_JSON="${GALENE_DATA}/config.json"
if [ ! -f "${CONFIG_JSON}" ]; then
  cat > "${CONFIG_JSON}" <<EOF
{
  "proxyURL": "${PUBLIC_URL}",
  "canonicalHost": "${CANONICAL_HOST}",
  "writableGroups": true,
  "users": {
    "${GALENE_ADMIN_USERNAME}": {
      "password": "${ADMIN_PASSWORD}",
      "permissions": "admin"
    }
  }
}
EOF
else
  if command -v jq >/dev/null 2>&1; then
    tmp="$(mktemp)"
    jq --arg url "${PUBLIC_URL}" --arg host "${CANONICAL_HOST}" \
      '.proxyURL = $url | .canonicalHost = $host' "${CONFIG_JSON}" > "${tmp}"
    mv "${tmp}" "${CONFIG_JSON}"
  fi
fi

DEFAULT_GROUP_FILE="${GALENE_GROUPS}/${GALENE_DEFAULT_GROUP}.json"
if [ ! -f "${DEFAULT_GROUP_FILE}" ]; then
  GROUP_PASSWORD="${GALENE_GROUP_PASSWORD:-meet}"
  cat > "${DEFAULT_GROUP_FILE}" <<EOF
{
  "displayName": "Meeting Room",
  "description": "Default Galene room — change credentials in Railway variables or edit this file on the volume.",
  "public": true,
  "max-clients": 40,
  "allow-recording": true,
  "autolock": false,
  "unrestricted-tokens": true,
  "users": {
    "host": {
      "password": "${GROUP_PASSWORD}",
      "permissions": "op"
    }
  },
  "wildcard-user": {
    "password": {"type": "wildcard"},
    "permissions": "present"
  }
}
EOF
  echo "Default room /group/${GALENE_DEFAULT_GROUP}/ — moderator: host / ${GROUP_PASSWORD}"
fi

# TURN: Galene built-in server (Railway TCP proxy forwards to GALENE_TURN_LISTEN_PORT).
# Do not write ice-servers.json — that disables the built-in TURN when -turn is set.
TURN_PUBLIC="${GALENE_TURN_PUBLIC:-}"
TURN_FLAG=""
if [ -n "${TURN_PUBLIC}" ]; then
  TURN_FLAG="-turn ${TURN_PUBLIC}"
else
  TURN_FLAG="-turn \"\""
  echo "WARNING: GALENE_TURN_PUBLIC unset — STUN-only; many clients will not connect video."
fi

rm -f "${GALENE_DATA}/ice-servers.json"

GALENE_UDP_MUX_PORT="${GALENE_UDP_MUX_PORT:-50000}"

echo "=============================================="
echo " Galene on http://0.0.0.0:${PORT} (PORT=${PORT})"
echo " Public URL: ${PUBLIC_URL}"
echo " Default room: ${PUBLIC_URL}group/${GALENE_DEFAULT_GROUP}/"
echo " Admin user: ${GALENE_ADMIN_USERNAME}"
if [ -n "${TURN_PUBLIC}" ]; then
  echo " Built-in TURN advertise: ${TURN_PUBLIC}"
else
  echo " Built-in TURN: disabled"
fi
echo "=============================================="

set -- /opt/galene/galene \
  -http ":${PORT}" \
  -insecure \
  -static "${GALENE_STATIC}" \
  -data "${GALENE_DATA}" \
  -groups "${GALENE_GROUPS}" \
  -recordings "${GALENE_RECORDINGS}" \
  -udp-range "${GALENE_UDP_MUX_PORT}"

if [ -n "${TURN_PUBLIC}" ]; then
  set -- "$@" -turn "${TURN_PUBLIC}"
else
  set -- "$@" -turn ""
fi

if [ "${GALENE_RELAY_ONLY}" = "1" ] && [ -n "${TURN_PUBLIC}" ]; then
  set -- "$@" -relay-only
fi

exec "$@"
