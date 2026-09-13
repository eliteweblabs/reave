#!/usr/bin/env bash
# One-shot DNS + redirect setup for darwinbottles.com migration.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CF_TOKEN=$(grep '^CLOUDFLARE_API_TOKEN=' "$ROOT/.env" | cut -d= -f2- | tr -d '"')

OLD_ZONE=6225abddd32ec53314b6f8cd1ca0ca52
NEW_ZONE=1a3aeefbc14642d78826c5c4133d7d7e
API="https://api.cloudflare.com/client/v4"
AUTH=(-H "Authorization: Bearer $CF_TOKEN" -H "Content-Type: application/json")

upsert_cname() {
  local zone=$1 name=$2 content=$3
  curl -s -X POST "$API/zones/$zone/dns_records" "${AUTH[@]}" \
    --data "{\"type\":\"CNAME\",\"name\":\"$name\",\"content\":\"$content\",\"proxied\":false}" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print(('OK' if d.get('success') else 'ERR'), '$name', d.get('errors', d.get('result',{}).get('name','')))"
}

upsert_txt() {
  local zone=$1 name=$2 content=$3
  curl -s -X POST "$API/zones/$zone/dns_records" "${AUTH[@]}" \
    --data "{\"type\":\"TXT\",\"name\":\"$name\",\"content\":\"$content\",\"proxied\":false}" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print(('OK' if d.get('success') else 'ERR'), '$name', d.get('errors'))"
}

add_redirect() {
  local zone=$1 host=$2 desc=$3
  local phase=http_request_dynamic_redirect
  local expr="http.host eq \"$host\""
  local target='concat("https://darwinbottles.com", http.request.uri.path)'
  local ruleset
  ruleset=$(curl -s "$API/zones/$zone/rulesets/phases/$phase/entrypoint" "${AUTH[@]}" | python3 -c "import sys,json; print(json.load(sys.stdin)['result']['id'])")
  local rules_json
  rules_json=$(curl -s "$API/zones/$zone/rulesets/$ruleset" "${AUTH[@]}" | python3 -c "
import sys,json
body=json.load(sys.stdin)
rules=body['result'].get('rules') or []
rules=[r for r in rules if r.get('description')!='$desc']
rules.append({
  'action':'redirect',
  'expression':'$expr',
  'description':'$desc',
  'enabled':True,
  'action_parameters':{
    'from_value':{
      'status_code':301,
      'target_url':{'expression':'$target'},
      'preserve_query_string':True
    }
  }
})
import json as j; print(j.dumps(rules))
")
  curl -s -X PUT "$API/zones/$zone/rulesets/$ruleset" "${AUTH[@]}" \
    --data "{\"rules\":$rules_json}" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print(('OK redirect' if d.get('success') else 'ERR redirect'), '$host', d.get('errors'))"
}

echo "=== darwinbottles.com Railway + Clerk DNS ==="
upsert_cname "$NEW_ZONE" "@" ltie4ipc.up.railway.app
upsert_cname "$NEW_ZONE" "www" j6fvo29d.up.railway.app
upsert_cname "$NEW_ZONE" "clerk" frontend-api.clerk.services
upsert_cname "$NEW_ZONE" "accounts" accounts.clerk.services
upsert_cname "$NEW_ZONE" "clkmail" mail.zv5ejo33ai9g.clerk.services
upsert_cname "$NEW_ZONE" "clk._domainkey" dkim1.zv5ejo33ai9g.clerk.services
upsert_cname "$NEW_ZONE" "clk2._domainkey" dkim2.zv5ejo33ai9g.clerk.services

echo "=== upsidedownbottle.com → darwinbottles.com redirects ==="
add_redirect "$OLD_ZONE" "upsidedownbottle.com" "Redirect apex to darwinbottles.com"
add_redirect "$OLD_ZONE" "www.upsidedownbottle.com" "Redirect www to darwinbottles.com"

echo "=== done ==="
