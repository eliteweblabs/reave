#!/bin/sh
set -eu

PORT="${PORT:-8080}"
GALENE_DATA="${GALENE_DATA:-/data}"
GALENE_GROUPS="${GALENE_GROUPS:-/groups}"
GALENE_STATIC="${GALENE_STATIC:-/opt/galene/static}"
GALENE_RECORDINGS="${GALENE_RECORDINGS:-/data/recordings}"
GALENE_TURN_LISTEN_PORT="${GALENE_TURN_LISTEN_PORT:-1194}"
GALENE_TURN_USERNAME="${GALENE_TURN_USERNAME:-galene}"
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
  # Drop baked-in demo credentials when real secrets are supplied at deploy time.
  if [ -n "${GALENE_GROUP_PASSWORD:-}" ] && [ -f "${GALENE_DATA}/groups/${GALENE_DEFAULT_GROUP}.json" ]; then
    rm -f "${GALENE_DATA}/groups/${GALENE_DEFAULT_GROUP}.json"
  fi
fi
GALENE_GROUPS="${GALENE_DATA}/groups"

# Public URL (Railway terminates TLS at the edge).
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

# TURN credentials (persist on volume when possible).
TURN_SECRET_FILE="${GALENE_DATA}/turn-secret"
if [ -z "${GALENE_TURN_PASSWORD:-}" ]; then
  if [ -f "${TURN_SECRET_FILE}" ]; then
    GALENE_TURN_PASSWORD="$(cat "${TURN_SECRET_FILE}")"
  else
    GALENE_TURN_PASSWORD="$(openssl rand -hex 24)"
    printf '%s' "${GALENE_TURN_PASSWORD}" > "${TURN_SECRET_FILE}"
  fi
else
  printf '%s' "${GALENE_TURN_PASSWORD}" > "${TURN_SECRET_FILE}"
fi

# Admin password for galenectl / server admin API.
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
  # Keep existing config but refresh proxy URL when Railway domain changes.
  if command -v jq >/dev/null 2>&1; then
    tmp="$(mktemp)"
    jq --arg url "${PUBLIC_URL}" --arg host "${CANONICAL_HOST}" \
      '.proxyURL = $url | .canonicalHost = $host' "${CONFIG_JSON}" > "${tmp}"
    mv "${tmp}" "${CONFIG_JSON}"
  fi
fi

# Default open meeting room (only if missing).
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

# ICE / TURN — Railway has no inbound UDP; use coturn over TCP via Railway TCP proxy.
ICE_FILE="${GALENE_DATA}/ice-servers.json"
TURN_PUBLIC="${GALENE_TURN_PUBLIC:-}"

if [ -n "${TURN_PUBLIC}" ]; then
  cat > "${ICE_FILE}" <<EOF
[
  {
    "urls": [
      "turn:${TURN_PUBLIC}?transport=tcp"
    ],
    "username": "${GALENE_TURN_USERNAME}",
    "credential": "${GALENE_TURN_PASSWORD}"
  }
]
EOF
else
  cat > "${ICE_FILE}" <<EOF
[
  {
    "urls": [
      "stun:stun.l.google.com:19302",
      "stun:stun1.l.google.com:19302"
    ]
  }
]
EOF
  echo "WARNING: GALENE_TURN_PUBLIC is unset — only STUN is configured."
  echo "         Video may fail for many networks until you add a Railway TCP proxy on port ${GALENE_TURN_LISTEN_PORT} and set GALENE_TURN_PUBLIC."
fi

# coturn (TCP-only relay for Railway)
cat > /etc/coturn/turnserver.conf <<EOF
listening-port=${GALENE_TURN_LISTEN_PORT}
tls-listening-port=0
listening-ip=0.0.0.0
relay-ip=127.0.0.1
fingerprint
lt-cred-mech
user=${GALENE_TURN_USERNAME}:${GALENE_TURN_PASSWORD}
realm=${CANONICAL_HOST}
no-udp
no-dtls
no-tls
no-cli
log-file=stdout
EOF

echo "Starting coturn on TCP ${GALENE_TURN_LISTEN_PORT}..."
turnserver -c /etc/coturn/turnserver.conf &
COTURN_PID=$!

cleanup() {
  kill "${COTURN_PID}" 2>/dev/null || true
}
trap cleanup INT TERM

GALENE_UDP_MUX_PORT="${GALENE_UDP_MUX_PORT:-50000}"

echo "=============================================="
echo " Galene on http://0.0.0.0:${PORT}"
echo " Public URL: ${PUBLIC_URL}"
echo " Default room: ${PUBLIC_URL}group/${GALENE_DEFAULT_GROUP}/"
echo " Admin user: ${GALENE_ADMIN_USERNAME}"
echo " TURN listen: ${GALENE_TURN_LISTEN_PORT}/tcp"
if [ -n "${TURN_PUBLIC}" ]; then
  echo " TURN public: turn:${TURN_PUBLIC}?transport=tcp"
else
  echo " TURN public: (not set — add Railway TCP proxy + GALENE_TURN_PUBLIC)"
fi
echo "=============================================="

set -- /opt/galene/galene \
  -http ":${PORT}" \
  -insecure \
  -static "${GALENE_STATIC}" \
  -data "${GALENE_DATA}" \
  -groups "${GALENE_GROUPS}" \
  -recordings "${GALENE_RECORDINGS}" \
  -turn "" \
  -udp-range "${GALENE_UDP_MUX_PORT}"

if [ "${GALENE_RELAY_ONLY}" = "1" ]; then
  set -- "$@" -relay-only
fi

exec "$@"
