#!/bin/sh
set -eu

GALENE_DATA="${GALENE_DATA:-/data}"
GALENE_GROUPS="${GALENE_GROUPS:-/groups}"
GALENE_STATIC="${GALENE_STATIC:-/opt/galene/static}"
GALENE_RECORDINGS="${GALENE_RECORDINGS:-/data/recordings}"
GALENE_TURN_LISTEN_PORT="${GALENE_TURN_LISTEN_PORT:-3478}"
GALENE_RELAY_ONLY="${GALENE_RELAY_ONLY:-1}"
GALENE_ADMIN_USERNAME="${GALENE_ADMIN_USERNAME:-admin}"
GALENE_DEFAULT_GROUP="${GALENE_DEFAULT_GROUP:-meet}"

# Railway overwrites PORT with the TCP proxy application port when a TCP proxy exists.
# HTTP must stay on 8080 (or GALENE_HTTP_PORT); TURN uses GALENE_TURN_LISTEN_PORT.
if [ -n "${GALENE_HTTP_PORT:-}" ]; then
  HTTP_PORT="${GALENE_HTTP_PORT}"
elif [ -n "${RAILWAY_TCP_APPLICATION_PORT:-}" ] && [ "${PORT:-}" = "${RAILWAY_TCP_APPLICATION_PORT}" ]; then
  HTTP_PORT=8080
else
  HTTP_PORT="${PORT:-8080}"
fi

mkdir -p "${GALENE_DATA}" "${GALENE_RECORDINGS}" "${GALENE_DATA}/var"

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
  PUBLIC_URL="http://127.0.0.1:${HTTP_PORT}/"
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
GROUP_PASSWORD="${GALENE_GROUP_PASSWORD:-meet}"

if [ ! -f "${DEFAULT_GROUP_FILE}" ]; then
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
elif [ -n "${GALENE_GROUP_PASSWORD:-}" ] && command -v jq >/dev/null 2>&1; then
  tmp="$(mktemp)"
  jq --arg pw "${GROUP_PASSWORD}" \
    '.users.host.password = $pw' "${DEFAULT_GROUP_FILE}" > "${tmp}"
  mv "${tmp}" "${DEFAULT_GROUP_FILE}"
fi

# Public TURN address — only when Railway TCP proxy is active.
TURN_PUBLIC=""
if [ -n "${RAILWAY_TCP_PROXY_DOMAIN:-}" ] && [ -n "${RAILWAY_TCP_PROXY_PORT:-}" ]; then
  TURN_PUBLIC="${RAILWAY_TCP_PROXY_DOMAIN}:${RAILWAY_TCP_PROXY_PORT}"
fi

rm -f "${GALENE_DATA}/ice-servers.json"

# REΛVe branding — pull logo + palette from the main app (same pattern as Crater).
REAVE_APP_URL="${REAVE_APP_URL:-}"
if [ -n "${REAVE_APP_URL}" ] && command -v curl >/dev/null 2>&1 && command -v jq >/dev/null 2>&1; then
  BRAND_JSON="$(mktemp)"
  BRAND_CSS="${GALENE_STATIC}/reave-brand.css"
  BRAND_LOGO="${GALENE_STATIC}/reave-logo.png"
  REAVE_ORIGIN="$(printf '%s' "${REAVE_APP_URL}" | sed -E 's#/$##')"
  if curl -fsS "${REAVE_ORIGIN}/api/branding" -o "${BRAND_JSON}" 2>/dev/null; then
    PRIMARY="$(jq -r '.primary // empty' "${BRAND_JSON}" 2>/dev/null || true)"
    SECONDARY="$(jq -r '.secondary // empty' "${BRAND_JSON}" 2>/dev/null || true)"
    COMPANY_NAME="$(jq -r '.name // empty' "${BRAND_JSON}" 2>/dev/null || true)"
    LOGO_URL="$(jq -r '.logoDarkUrl // .logoEmailUrl // empty' "${BRAND_JSON}" 2>/dev/null || true)"
    if [ -z "${LOGO_URL}" ] && [ "$(jq -r '.logoSource // empty' "${BRAND_JSON}" 2>/dev/null || true)" = "admin" ]; then
      LOGO_V="$(jq -r '.stored.primary // empty' "${BRAND_JSON}" 2>/dev/null || true)"
      if [ -n "${LOGO_V}" ]; then
        LOGO_URL="${REAVE_ORIGIN}/api/branding/logo.alt?v=$(printf '%s' "${LOGO_V}" | sed 's/ /+/g')"
      else
        LOGO_URL="${REAVE_ORIGIN}/api/branding/logo.alt"
      fi
    fi
    if [ -n "${PRIMARY}" ]; then
      cat > "${BRAND_CSS}" <<EOF
/* Generated from ${REAVE_ORIGIN}/api/branding — do not edit on the volume */
:root {
  --reave-primary: ${PRIMARY};
  --reave-secondary: ${SECONDARY:-${PRIMARY}};
}
.users-header {
  background: var(--reave-primary) !important;
  display: flex !important;
  align-items: center !important;
  box-sizing: border-box !important;
  width: 100% !important;
  overflow: hidden !important;
}
#left-sidebar .users-header {
  min-width: 0 !important;
}
.navbar,
.navbar .container,
.navbar .container-fluid,
.navbar .container-lg,
.navbar .container-md,
.navbar .container-sm,
.navbar .container-xl {
  background: var(--reave-primary) !important;
}
.topnav .navbar-brand,
#title.navbar-brand {
  color: #fff !important;
}
.btn-primary {
  background-color: var(--reave-primary) !important;
  border-color: var(--reave-primary) !important;
}
.btn-primary:hover,
.btn-primary:focus {
  background-color: var(--reave-secondary) !important;
  border-color: var(--reave-secondary) !important;
}
#left-sidebar .galene-header,
.galene-header {
  display: block !important;
  flex: 1 1 auto !important;
  width: 100% !important;
  max-width: 100% !important;
  min-width: 0 !important;
  min-height: 0 !important;
  line-height: 0 !important;
  font-size: 0 !important;
  color: transparent !important;
  overflow: hidden !important;
}
.galene-header .reave-wordmark,
#title.navbar-brand .reave-wordmark {
  display: block !important;
  width: 100% !important;
  max-width: 100% !important;
  height: auto !important;
  max-height: 2.25rem !important;
  object-fit: contain !important;
  object-position: left center !important;
}
#title.navbar-brand {
  display: block !important;
  min-height: 2.5rem !important;
}
EOF
      LOGO_OK=0
      if [ -n "${LOGO_URL}" ]; then
        if curl -fsSL "${LOGO_URL}" -o "${BRAND_LOGO}" 2>/dev/null; then
          LOGO_OK=1
        fi
      fi
      if [ "${LOGO_OK}" = "1" ]; then
        if [ -f "${GALENE_STATIC}/galene.html" ]; then
          sed -i 's#<div class="galene-header">.*</div>#<div class="galene-header"><img src="/reave-logo.png" alt="" class="reave-wordmark" /></div>#' "${GALENE_STATIC}/galene.html" 2>/dev/null || true
        fi
        if [ -f "${GALENE_STATIC}/index.html" ]; then
          sed -i 's#<h1 id="title" class="navbar-brand">.*</h1>#<h1 id="title" class="navbar-brand"><img src="/reave-logo.png" alt="" class="reave-wordmark" /></h1>#' "${GALENE_STATIC}/index.html" 2>/dev/null || true
        fi
      fi
      for html in galene.html index.html; do
        target="${GALENE_STATIC}/${html}"
        if [ -f "${target}" ] && ! grep -q 'reave-brand.css' "${target}" 2>/dev/null; then
          sed -i 's#<link rel="stylesheet" type="text/css" href="/galene.css"/>#&\n    <link rel="stylesheet" type="text/css" href="/reave-brand.css"/>#' "${target}" 2>/dev/null || true
          sed -i 's#<link rel="stylesheet" href="/mainpage.css">#&\n    <link rel="stylesheet" type="text/css" href="/reave-brand.css"/>#' "${target}" 2>/dev/null || true
        fi
      done
      echo "REΛVe branding applied from ${REAVE_ORIGIN}/api/branding"
    fi
  fi
  rm -f "${BRAND_JSON}"
fi

# Share guest link — opens reave.app popup (Clerk auth) to mint Galene ?token= invite.
if [ -n "${REAVE_APP_URL:-}" ]; then
  REAVE_ORIGIN="$(printf '%s' "${REAVE_APP_URL}" | sed -E 's#/$##')"
  cat > "${GALENE_STATIC}/reave-meet-share.js" <<EOF
(function () {
  var REAVE = '${REAVE_ORIGIN}';
  function groupFromPath() {
    var m = window.location.pathname.match(/\\/group\\/([^/]+)/);
    return m ? decodeURIComponent(m[1]) : 'meet';
  }
  function sharePopup() {
    var g = encodeURIComponent(groupFromPath());
    window.open(
      REAVE + '/admin/meet-invite?group=' + g,
      'reave-meet-share',
      'width=460,height=360,noopener,noreferrer'
    );
  }
  function addBtn(parent, className, label) {
    if (!parent || parent.querySelector('.reave-share-btn')) return;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = className + ' reave-share-btn';
    btn.textContent = label;
    btn.addEventListener('click', sharePopup);
    parent.appendChild(btn);
  }
  function mount() {
    addBtn(document.querySelector('header nav.topnav, header .topnav'), 'btn btn-default btn-sm', 'Share link');
    var form = document.getElementById('loginform') || document.getElementById('groupform');
    if (form) {
      var wrap = document.createElement('p');
      wrap.className = 'reave-share-wrap';
      addBtn(wrap, 'btn btn-default', 'Share guest link');
      form.insertAdjacentElement('afterend', wrap);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
EOF
  for html in galene.html index.html; do
    target="${GALENE_STATIC}/${html}"
    if [ -f "${target}" ] && ! grep -q 'reave-meet-share.js' "${target}" 2>/dev/null; then
      sed -i 's#</body>#    <script src="/reave-meet-share.js"></script>\n  </body>#' "${target}" 2>/dev/null || true
    fi
  done
fi

GALENE_UDP_MUX_PORT="${GALENE_UDP_MUX_PORT:-50000}"

echo "=============================================="
echo " HTTP on 0.0.0.0:${HTTP_PORT} (Railway PORT=${PORT:-unset})"
echo " Public URL: ${PUBLIC_URL}"
echo " Default room: ${PUBLIC_URL}group/${GALENE_DEFAULT_GROUP}/"
echo " Admin user: ${GALENE_ADMIN_USERNAME}"
if [ -n "${TURN_PUBLIC}" ]; then
  echo " Built-in TURN: ${TURN_PUBLIC} (listen :${GALENE_TURN_LISTEN_PORT})"
else
  echo " Built-in TURN: disabled"
fi
echo "=============================================="

set -- /opt/galene/galene \
  -http ":${HTTP_PORT}" \
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
