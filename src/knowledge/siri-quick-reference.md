# Siri Shortcuts Quick Reference

Copy-paste these JSON payloads into Apple Shortcuts → Get Contents of URL → Request Body.

**Endpoint**: `https://reave.app/api/siri`  
**Method**: POST  
**Header**: `X-Siri-Key: your-key-from-railway`

---

## List Contacts

```json
{
  "action": "list_clients",
  "format": "text"
}
```

**With search**:

```json
{
  "action": "list_clients",
  "query": "acme",
  "limit": 10,
  "format": "text"
}
```

---

## Get Client Details

```json
{
  "action": "get_client",
  "name": "Tony Vello",
  "format": "text"
}
```

---

## Create Client

```json
{
  "action": "create_client",
  "name": "Jane Smith",
  "email": "[email protected]",
  "phone": "+19876543210",
  "company": "Smith Industries",
  "notes": "Met at conference",
  "format": "text"
}
```

---

## List Work Items

```json
{
  "action": "list_work",
  "format": "text"
}
```

**Filter by status**:

```json
{
  "action": "list_work",
  "status": "active",
  "format": "text"
}
```

**Available statuses**: `active`, `complete`, `paused`, `quote`, `archived`

---

## Audit (quick — street speed)

Say a business name — add street or town if the name is common — and the research agent finds the business, runs a fast audit (Lighthouse, HTML, SSL, DNS, Google/social/reputation), and files a project. Skips Playwright and link crawls. Returns immediately; the finished audit lands via push notification.

```json
{
  "action": "audit",
  "business": "Example Plumbing Co on Oak Street in Portland",
  "format": "text"
}
```

**Required**: `business` (aliases: `business_name`, `company`, `name`, `query`). **Optional**: `url`, `phone`, `email`, `notes`.

**Backward compatible**: `"action": "create_proposal"` runs the same quick tier.

---

## Full Audit (comprehensive)

Everything in the quick audit plus Playwright UX/UI, broken links, and tech stack. Slower — use at a desk, not on the street.

```json
{
  "action": "full_audit",
  "business": "Example Plumbing Co on Oak Street in Portland",
  "format": "text"
}
```

**Also accepts**: `"action": "create_proposal_full"`

---

## Create Work Item

```json
{
  "action": "create_work",
  "title": "Website redesign",
  "client": "Acme Corp",
  "status": "active",
  "priority": "high",
  "body": "Full website redesign with modern stack",
  "format": "text"
}
```

**Available priorities**: `low`, `medium`, `high`, `urgent`

---

## Add To-Do

```json
{
  "action": "add_todo",
  "title": "Call the accountant about Q2 taxes",
  "due_date": "2026-08-15",
  "priority": "high",
  "format": "text"
}
```

**Also accepts**: `"action": "create_todo"`. Title aliases: `todo`, `text`, `query`.

---

## Record Payment

```json
{
  "action": "record_payment",
  "customer_name": "Acme Plumbing",
  "amount": 250,
  "payment_mode": "CHECK",
  "format": "text"
}
```

**Also accepts**: `"action": "add_payment"` or `"action": "create_payment"`.

**Requires** `billing` feature + Crater (`CRATER_API_BASE_URL`, `CRATER_API_TOKEN`).

**Optional**: `payment_date` (`YYYY-MM-DD`), `notes`, `invoice_id`. Customer aliases: `customer`, `client`, `name`. Mode aliases: `mode`, `method` (`cash`, `check`/`cheque`, `card`/`credit card`, `ach`/`bank transfer`, `other`).

---

## List To-Dos

```json
{
  "action": "list_todos",
  "status": "open",
  "format": "text"
}
```

---

## Complete To-Do

```json
{
  "action": "complete_todo",
  "title": "Call the accountant",
  "format": "text"
}
```

**Also accepts**: `"action": "done_todo"` or `"action": "mark_todo_done"`. Match by `id` or title.

---

## Delete To-Do

```json
{
  "action": "delete_todo",
  "title": "Call the accountant",
  "format": "text"
}
```

**Also accepts**: `"action": "clear_todo"`.

---

## Send SMS

```json
{
  "action": "send_sms",
  "to": "+19876543210",
  "message": "Your invoice is ready!",
  "format": "text"
}
```

---

## Status Check

```json
{
  "action": "status",
  "format": "text"
}
```

---

## Dynamic Variables in Shortcuts

Replace values with Shortcut variables:

1. Add **Ask for Input** → store in `ClientName`
2. In JSON, reference the variable (Shortcuts auto-replaces):

```json
{
  "action": "get_client",
  "name": "ClientName",
  "format": "text"
}
```

Shortcuts will replace `ClientName` with the user's input when running.

---

## Testing with curl

```bash
# List clients
curl -X POST https://reave.app/api/siri \
  -H "X-Siri-Key: YOUR_KEY_HERE" \
  -H "Content-Type: application/json" \
  -d '{"action":"list_clients","format":"text"}'

# Get client
curl -X POST https://reave.app/api/siri \
  -H "X-Siri-Key: YOUR_KEY_HERE" \
  -H "Content-Type: application/json" \
  -d '{"action":"get_client","name":"Tony Vello","format":"text"}'

# Create contact
curl -X POST https://reave.app/api/siri \
  -H "X-Siri-Key: YOUR_KEY_HERE" \
  -H "Content-Type: application/json" \
  -d '{"action":"create_client","name":"Jane Smith","email":"[email protected]","format":"text"}'

# List work
curl -X POST https://reave.app/api/siri \
  -H "X-Siri-Key: YOUR_KEY_HERE" \
  -H "Content-Type: application/json" \
  -d '{"action":"list_work","status":"active","format":"text"}'

# Create proposal (quick audit — runs in the background)
curl -X POST https://reave.app/api/siri \
  -H "X-Siri-Key: YOUR_KEY_HERE" \
  -H "Content-Type: application/json" \
  -d '{"action":"audit","business":"Example Plumbing Co on Oak Street in Portland","format":"text"}'

# Full audit (Playwright + links + tech stack — runs in the background)
curl -X POST https://reave.app/api/siri \
  -H "X-Siri-Key: YOUR_KEY_HERE" \
  -H "Content-Type: application/json" \
  -d '{"action":"full_audit","business":"Example Plumbing Co on Oak Street in Portland","format":"text"}'

# Record payment
curl -X POST https://reave.app/api/siri \
  -H "X-Siri-Key: YOUR_KEY_HERE" \
  -H "Content-Type: application/json" \
  -d '{"action":"record_payment","customer_name":"Acme Plumbing","amount":250,"payment_mode":"CHECK","format":"text"}'

# Status
curl -X POST https://reave.app/api/siri \
  -H "X-Siri-Key: YOUR_KEY_HERE" \
  -H "Content-Type: application/json" \
  -d '{"action":"status","format":"text"}'
```

---

## Common Shortcut Structure

Every Siri shortcut follows this pattern:

1. **Ask for Input** (optional) → store in variables
2. **Get Contents of URL**:
   - URL: `https://reave.app/api/siri`
   - Method: POST
   - Headers: `X-Siri-Key` = `your-key`
   - Body: JSON (see above)
3. **Show Result** or **Speak Text**

---

## Start Time Tracking

**Requires** `time_tracking` in install config `features[]`.

**Prompt** (no query — speaks the most recent project):

```json
{
  "action": "start_time_tracking",
  "format": "text"
}
```

**Confirm recent project** (`suggested_slug` from the prompt response):

```json
{
  "action": "start_time_tracking",
  "query": "yes",
  "suggested_slug": "cooper-website",
  "format": "text"
}
```

**Start on a named project** (finds existing project or creates one for a matching client):

```json
{
  "action": "start_time_tracking",
  "query": "cooper website",
  "format": "text"
}
```

**Stop and log hours**:

```json
{
  "action": "stop_time_tracking",
  "format": "text"
}
```

**Current timer status**:

```json
{
  "action": "time_tracking_status",
  "format": "text"
}
```

---

## Setup Checklist

- [ ] Generate API key: `openssl rand -base64 32`
- [ ] Add `SIRI_API_KEY` to Railway → Astro service → Variables
- [ ] Redeploy if needed (Railway auto-redeploys on var change)
- [ ] Create first shortcut in Shortcuts app
- [ ] Add `X-Siri-Key` header with your key
- [ ] Test with "status" action first
- [ ] Add to Siri with custom phrase
- [ ] Say "Hey Siri, [your phrase]"

---

**Full docs**: `/knowledge/siri-shortcuts`
