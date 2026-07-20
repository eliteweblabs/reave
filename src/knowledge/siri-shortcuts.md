# Siri Shortcuts Integration

Control Reave through Siri using Apple Shortcuts. Say things like "Hey Siri, list my clients" or "Hey Siri, create work item" and interact with your business from anywhere.

## How it Works

Apple Shortcuts calls `/api/siri` with JSON commands and displays the response. Each shortcut is a simple HTTP request that:

1. Calls `POST https://reave.app/api/siri` with JSON body
2. Includes authentication (X-Siri-Key header or Clerk session token)
3. Receives a response (text or JSON) that Siri can read aloud or display

## Setup

### 1. Get Your Siri API Key

Add `SIRI_API_KEY` to Railway → Astro service → Variables:

```bash
SIRI_API_KEY=your-secure-random-key-here
```

Generate a strong key:

```bash
openssl rand -base64 32
```

**Keep this key private** — it gives full access to your Reave data.

### 2. Create Your First Shortcut

On your iPhone/iPad:

1. Open the **Shortcuts** app
2. Tap **+** (new shortcut)
3. Add action: **Get Contents of URL**
4. Configure:
   - **URL**: `https://reave.app/api/siri`
   - **Method**: POST
   - **Request Body**: JSON (see examples below)
   - **Headers**: Add header `X-Siri-Key` with value `your-key-from-railway`
5. Add action: **Show Result** (displays the response)
6. Name your shortcut (e.g., "List Clients")
7. Tap the info button → Add to Siri → record a phrase like "list my clients"

Now say "Hey Siri, list my clients" and it runs!

## Available Actions

### List Clients

**What it does**: Search or list all clients.

**JSON body**:

```json
{
  "action": "list_clients",
  "query": "acme",
  "limit": 10,
  "format": "text"
}
```

**Parameters**:
- `query` (optional): Search term to filter clients
- `limit` (optional): Max results (default 10, max 50)
- `format` (optional): `json` or `text` (default `json`)

**Example response** (format=text):

```
Found 2 clients:

Tony Vello · Solid Builders · [email protected] · +1234567890
Acme Corp · [email protected]
```

**Siri phrase**: "list my clients" or "search clients for acme"

### Get Client Details

**What it does**: Get full details for one client.

**JSON body**:

```json
{
  "action": "get_client",
  "name": "Tony Vello",
  "format": "text"
}
```

**Parameters**:
- `name` (required): Client name to search for (exact or whole-word match — "Tony" will not match "Tom")

**Example response** (format=text):

```
Tony Vello
Company: Solid Builders
Email: [email protected]
Phone: +1234567890
Notes: VIP client - hosting + monthly retainer
```

**Not found**:

```
Client not found: Tony. Would you like to add a new client?
```

**Siri phrase**: "get client Tony Vello"

### Create Client

**What it does**: Add a new client.

**JSON body**:

```json
{
  "action": "create_client",
  "name": "Jane Smith",
  "email": "[email protected]",
  "phone": "+19876543210",
  "company": "Smith Industries",
  "notes": "Met at conference 2026",
  "format": "text"
}
```

**Parameters**:
- `name` (required): Client name
- `email` (optional): Email address
- `phone` (optional): Phone number (E.164 format)
- `company` (optional): Company name
- `notes` (optional): Internal notes

**Example response**:

```
✅ Created client: Jane Smith (Smith Industries)
```

**Siri phrase**: "create client Jane Smith"

**Tip**: Use Shortcuts' **Ask for Input** action to prompt for name/email/phone dynamically.

### List Work Items

**What it does**: Show current work/projects.

**JSON body**:

```json
{
  "action": "list_work",
  "status": "active",
  "format": "text"
}
```

**Parameters**:
- `status` (optional): Filter by status (`active`, `complete`, `paused`, `quote`, `archived`)

**Example response**:

```
5 work items (active):

ACTIVE: Website redesign · Acme Corp
ACTIVE: SEO optimization · Tony Vello
ACTIVE: Hosting migration · Smith Industries
ACTIVE: Mobile app design · StartupCo
ACTIVE: Brand refresh · Local Cafe

...and 2 more
```

**Siri phrase**: "list my work" or "show active projects"

### Find Client

**What it does**: Look up a client by name. Returns `found: true/false` in JSON for Shortcuts conditionals.

**JSON body**:

```json
{
  "action": "find_client",
  "client": "Tony Vello"
}
```

### Create Project

**What it does**: Find or create a client, then create a work/project item in one call. Use with the **Create Reave Project** Siri shortcut.

**JSON body**:

```json
{
  "action": "create_project",
  "client": "Tony Vello",
  "first_name": "Jane",
  "last_name": "Smith",
  "company": "Smith Industries",
  "email": "jane@example.com",
  "title": "Website redesign",
  "format": "text"
}
```

**Parameters**:
- `title` (required): Project title
- `client` (optional): Existing client name to look up first
- `first_name`, `last_name` (required for new clients): Used when `client` is blank or not found
- `company`, `email`, `phone` (optional): Saved on new clients only

**Example response**:

```
Created project Website redesign for Tony Vello. Status: active.
```

**Siri phrase**: "create reave project" or "new reave project"

### Create Work Item

**What it does**: Start a new project/work item.

**JSON body**:

```json
{
  "action": "create_work",
  "title": "Logo design for Acme",
  "client": "Acme Corp",
  "status": "active",
  "priority": "high",
  "body": "Need new logo ASAP for rebranding campaign",
  "format": "text"
}
```

**Parameters**:
- `title` (required): Work item title
- `client` (required): Client name
- `status` (optional): `active`, `complete`, `paused`, `quote`, `archived` (default: `active`)
- `priority` (optional): `low`, `medium`, `high`, `urgent` (default: `medium`)
- `body` (optional): Detailed description

**Example response**:

```
✅ Created work item: Logo design for Acme
Status: active
Client: Acme Corp
```

**Siri phrase**: "create work item"

**Tip**: Use **Ask for Input** actions to prompt for title and client.

### Send SMS

**What it does**: Send a text message via Telnyx.

**JSON body**:

```json
{
  "action": "send_sms",
  "to": "+19876543210",
  "message": "Your invoice is ready! Check reave.app/c/xyz",
  "format": "text"
}
```

**Parameters**:
- `to` (required): Recipient phone number (E.164 format)
- `message` (required): Message text

**Example response**:

```
✅ Sent SMS to +19876543210
```

**Siri phrase**: "send client message"

**Requirement**: `TELNYX_API_KEY` and `TELNYX_FROM_NUMBER` must be configured.

### Status Check

**What it does**: Quick health check of Reave services.

**JSON body**:

```json
{
  "action": "status",
  "format": "text"
}
```

**Example response**:

```
Reave Status

Contact API: online
Telnyx: online
Claude: online
```

**Siri phrase**: "check reave status"

## Advanced Shortcut Techniques

### Dynamic Input

Use **Ask for Input** to make shortcuts interactive:

1. Add **Ask for Input** action → "What's the client name?"
2. Store result in variable `ClientName`
3. In **Get Contents of URL**, use the variable in JSON:

```json
{
  "action": "get_client",
  "name": "ClientName",
  "format": "text"
}
```

Shortcuts will replace `ClientName` with the user's input.

### Speak Results

Add **Speak Text** action after **Get Contents of URL** to have Siri read the response aloud (great while driving).

### Home Screen / Widget

Add shortcuts to your Home Screen or Today View widget for one-tap access (no "Hey Siri" needed).

### Automation

Use **Shortcuts Automation** to trigger actions based on:
- **Time of day**: "List active work every morning at 9am"
- **Location**: "Show client details when I arrive at their office"
- **NFC tag**: Tap NFC tag to check status

### Chaining Actions

Combine multiple API calls in one shortcut:

1. **Get Contents of URL** → list_clients
2. **Choose from List** → pick a client
3. **Get Contents of URL** → get_client with selected name
4. **Show Result**

## Example Shortcuts

### "Morning Briefing"

Runs every weekday at 9am:

1. Call `/api/siri` with `{"action": "list_work", "status": "active", "format": "text"}`
2. Call `/api/siri` with `{"action": "status", "format": "text"}`
3. **Speak Text** with both results
4. Show notification

### "Quick Add Client"

Accessible from Share Sheet when someone texts you their contact:

1. **Receive** text from Share Sheet
2. **Ask for Input** → "Client name?"
3. **Ask for Input** → "Company?"
4. Extract phone/email from shared text
5. **Get Contents of URL** → create_client with all details
6. **Show Result**

### "Client Lookup"

Hey Siri, client lookup:

1. **Ask for Input** → "Which client?"
2. **Get Contents of URL** → get_client
3. **Show Result**
4. **Speak Text** (so Siri reads it aloud)

## Security

### API Key vs Clerk Session

The endpoint accepts two authentication methods:

1. **X-Siri-Key header** (recommended for Shortcuts):
   - Simple: just add a header with your key
   - Secure: key is only stored locally on your device
   - Works offline (after initial setup)

2. **Clerk session token** (for web/app):
   - Uses your Clerk login session
   - Harder to set up in Shortcuts (requires cookie/token handling)
   - Use X-Siri-Key for Shortcuts instead

### Key Safety

- **Never share** your `SIRI_API_KEY` with anyone
- **Rotate the key** if compromised (update Railway var + all shortcuts)
- **Use Face ID/Touch ID** to lock the Shortcuts app
- **iCloud Keychain** stores shortcut data securely, but the key is visible in shortcut config

### Rate Limiting

The endpoint has no built-in rate limiting. If needed, add Cloudflare rate limiting or middleware.

## Limitations

### What Siri Shortcuts Can't Do

- **No rich UI**: Shortcuts can show text/lists/alerts but not full web pages or custom layouts
- **No real-time updates**: Each shortcut runs once; it won't watch for changes
- **No background sync**: iOS restricts background execution (use Automation for scheduled runs)
- **No file uploads**: Can't upload images/PDFs directly (workaround: upload to cloud first, then send URL)

### Workarounds

- **Complex forms**: Use the web app or admin dashboard for data-heavy tasks
- **File attachments**: Use `/api/work/[slug]/files` separately after creating work item
- **Real-time chat**: Siri Shortcuts aren't for conversations — use the admin Chat interface or Vapi voice agent

## Troubleshooting

### "The operation couldn't be completed"

- Check your Wi-Fi/cellular connection
- Verify `SIRI_API_KEY` is set on Railway
- Make sure the key in your shortcut matches Railway exactly (no extra spaces)

### "Invalid JSON"

- Ensure the request body is valid JSON
- Use **Text** type (not Dictionary) in Shortcuts → Get Contents of URL
- Test your JSON at [jsonlint.com](https://jsonlint.com/)

### "Unauthorized"

- `X-Siri-Key` header is missing or incorrect
- Update the key in your shortcut if you rotated it on Railway

### Response is empty or weird

- Check the `format` parameter: use `"format": "text"` for Siri-friendly output
- Look at the raw JSON response (remove **Show Result**, add **Quick Look** instead)
- Test the endpoint directly with `curl`:

```bash
curl -X POST https://reave.app/api/siri \
  -H "X-Siri-Key: your-key" \
  -H "Content-Type: application/json" \
  -d '{"action":"status","format":"text"}'
```

### Siri won't trigger the shortcut

- Re-record the Siri phrase (Settings → Siri & Search → Shortcuts)
- Try a different phrase (avoid common words like "call" or "open")
- Make sure "Listen for 'Hey Siri'" is enabled

## Extending

Want more actions? Edit `/src/pages/api/siri/index.ts` and add a new case in the switch statement. Each action handler returns `{ ok, text?, data?, error? }`.

Example actions to add:

- `list_invoices`: Show outstanding invoices (requires Crater integration)
- `log_time`: Add time entry to a work item
- `check_schedule`: Show today's bookings (requires Cal.com integration)
- `add_todo`: Create a quick to-do item

## Desktop Alternative

Siri Shortcuts are iOS/macOS only. For desktop/CLI access, use:

- **Alfred workflow** (macOS): Same API, triggered via Alfred
- **Raycast script** (macOS): Script Commands calling `/api/siri`
- **curl/httpie**: Direct terminal access

## See Also

- **Vapi Voice Agent**: Call your Telnyx number for AI phone support
- **Client Portal** (`/c/<uid>`): Share links with clients (iOS Home Screen support)
- **Admin Dashboard** (`/admin`): Full web interface for managing clients, work, and services

---

Set `SIRI_API_KEY` on Railway and create your first shortcut to get started! 🚀
