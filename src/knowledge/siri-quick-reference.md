# Siri Shortcuts Quick Reference

Copy-paste these JSON payloads into Apple Shortcuts → Get Contents of URL → Request Body.

**Endpoint**: `https://reave.app/api/siri`  
**Method**: POST  
**Header**: `X-Siri-Key: your-key-from-railway`

---

## List Clients

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

## Create Work Item

```json
{
  "action": "create_work",
  "title": "Website redesign",
  "client": "Acme Corp",
  "status": "active",
  "priority": "high",
  "body": "Full site redesign with modern stack",
  "format": "text"
}
```

**Available priorities**: `low`, `medium`, `high`, `urgent`

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

# Create client
curl -X POST https://reave.app/api/siri \
  -H "X-Siri-Key: YOUR_KEY_HERE" \
  -H "Content-Type: application/json" \
  -d '{"action":"create_client","name":"Jane Smith","email":"[email protected]","format":"text"}'

# List work
curl -X POST https://reave.app/api/siri \
  -H "X-Siri-Key: YOUR_KEY_HERE" \
  -H "Content-Type: application/json" \
  -d '{"action":"list_work","status":"active","format":"text"}'

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
