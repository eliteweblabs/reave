# Siri Shortcuts Integration

Control Reave through Siri using Apple Shortcuts. Say things like "Hey Siri, ask Reave what's on my to-do list", "Hey Siri, list my contacts", or "Hey Siri, create work item" and interact with your business from anywhere.

## How it Works

Apple Shortcuts calls `/api/siri` with JSON commands and displays the response. Each shortcut is a simple HTTP request that:

1. Calls `POST https://reave.app/api/siri` with JSON body
2. Includes authentication (X-Siri-Key header or Clerk session token)
3. Receives a response (text or JSON) that Siri can read aloud or display

**Sleep mode:** Siri Shortcuts bypass overnight quiet hours. CRUD actions always work, and audit research, freeform agent prompts, plus their completion push still run during sleep mode (unlike inbound email triage and other automated AI).

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
6. Name your shortcut (e.g., "List Contacts")
7. Tap the info button → Add to Siri → record a phrase like "list my contacts"

Now say "Hey Siri, list my contacts" and it runs!

## Available Actions

### Ask the Agent

**What it does**: Send a freeform prompt to the same knowledge agent as Admin → Sessions. Siri waits briefly for a spoken reply. If the turn needs tools and takes longer, you get an immediate ack and a push when the answer lands. The conversation is saved as a chat titled `Siri · …`.

**JSON body**:

```json
{
  "action": "prompt",
  "message": "How many hours did we bill last week?",
  "format": "text"
}
```

**Parameters**:
- `message` (required): What to ask. Aliases: `prompt`, `text`, `query`, `q`.
- `thread_id` (optional): Continue an existing owner chat (use the `threadId` from a previous response).
- `async` (optional): `true` to return immediately and push when done (same as `wait: false`).
- `format` (optional): `json` or `text` (use `text` so Siri can speak the reply).

**Example response** (finished in time):

```
You billed 18.5 hours last week across three active projects.
```

**Example response** (still running):

```
Working on that. I will notify you when it is ready.
```

**Siri phrase**: "ask Reave" or "prompt the agent" or "hey Reave"

**Also accepts**: `"action": "ask"`, `"action": "chat"`, `"action": "ask_agent"`

**Requirement**: `ANTHROPIC_API_KEY` and `AGENT_ALERT_USER_ID` (so the thread lands in your Sessions list and the completion push can reach you).

**Tip**: Use Shortcuts' **Ask for Input** for the message, then **Speak Text** on the response. For follow-ups, save `threadId` from the JSON response and pass it back as `thread_id`.

### List Contacts

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

**Siri phrase**: "list my contacts" or "search clients for acme"

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
- `name` (required): Contact name to search for (exact or whole-word match — "Tony" will not match "Tom")

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
- `name` (required): Contact name
- `email` (optional): Email address
- `phone` (optional): Phone number (E.164 format)
- `company` (optional): Company name
- `notes` (optional): Internal notes

**Example response**:

```
✅ Created contact: Jane Smith (Smith Industries)
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

**What it does**: Look up a contact by name. Returns `found: true/false` in JSON for Shortcuts conditionals.

**JSON body**:

```json
{
  "action": "find_client",
  "client": "Tony Vello"
}
```

### Create Project

**What it does**: Find or create a contact, then create a work/project item in one call. Use with the **Create Reave Project** Siri shortcut.

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

### Audit (quick — street speed)

**What it does**: Say a business name — add street or town if the name is common — and it hands the job to the research agent: finds the real business and website, looks up or creates the contact, runs a **fast audit** (Lighthouse, HTML/content, SSL, DNS, Google/social/reputation search), and files an audit project (status `audit`, not inquiry). Skips slow Playwright browser automation and link crawls so you get results faster on the street.

Because Lighthouse alone can take up to ~2 minutes, this action returns immediately with an acknowledgment — the finished audit, new client, and new project land a little later in the **System alerts** chat thread with a push notification (requires `AGENT_ALERT_USER_ID` and web push set up). Siri won't sit there waiting.

**JSON body**:

```json
{
  "action": "audit",
  "business": "Example Plumbing Co on Oak Street in Portland",
  "format": "text"
}
```

**Parameters**:
- `business` (required): Business name or freeform description. Aliases: `business_name`, `company`, `name`, `query`. Include street, town, or neighborhood when the name alone isn't enough to find the right place.
- `url` (optional): Website if you already know it — usually omitted; the agent finds it via web search.
- `phone`, `email`, `notes` (optional): Extra context if you have it.

**Example response** (immediate ack — the real result comes later via push notification):

```
Running an audit on Example Plumbing Co. It will be available in the Reave app shortly.
```

**Siri phrase**: "audit" or "create proposal" or "research this business"

**Also accepts**: `"action": "create_proposal"` (same quick tier — backward compatible)

**Requirement**: `ANTHROPIC_API_KEY` (for the research agent), `CONTACT_API_BASE_URL` (to create the contact), and `AGENT_ALERT_USER_ID` (so the finished audit posts to System alerts with a push notification — without it the research still runs but there's nowhere to see the result land).

### Full Audit (comprehensive)

**What it does**: Same as the quick audit, plus **Playwright** real-browser UX/UI checks (nav menus, JS errors, tap targets, screenshots), **broken link crawl**, and **tech stack detection**. Use when you're back at a desk and want the deepest report — not for on-the-street speed.

**JSON body**:

```json
{
  "action": "full_audit",
  "business": "Example Plumbing Co on Oak Street in Portland",
  "format": "text"
}
```

**Example response**:

```
Running a full audit on Example Plumbing Co. It will be available in the Reave app shortly.
```

**Siri phrase**: "full audit"

**Also accepts**: `"action": "create_proposal_full"`

**Requirement**: Same as quick audit. Playwright requires Chromium in the server environment (included in the Docker image).

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
- `client` (required): Contact name
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

### Add To-Do

**What it does**: Create a personal/work to-do (dynamic alert) — separate from client projects. Use when you want a reminder that is **not** a job with a contact.

**JSON body**:

```json
{
  "action": "add_todo",
  "title": "Call the accountant about Q2 taxes",
  "due_date": "2026-08-15",
  "priority": "high",
  "format": "text"
}
```

**Parameters**:
- `title` (required): Task text. Aliases: `todo`, `text`, `query`. Dates and times in the title (`tomorrow`, `Friday at 3`, `August 15`) are parsed automatically and stripped from the stored title.
- `due_date` (optional): Deadline (`YYYY-MM-DD` or ISO). Alias: `due`. Spoken values like `tomorrow` also work. An explicit `due_date` wins over a date found in the title.
- `priority` (optional): `low`, `normal`, `high`, `urgent` (default: `normal`)

**Also accepts**: `"action": "create_todo"`

**Example response**:

```
Added to-do: Call the accountant about Q2 taxes · high · due Aug 15
```

Dictating `"Call the plumber tomorrow at 3"` stores title `Call the plumber` due tomorrow at 3 PM (owner time zone) and replies `Added to-do: Call the plumber · due tomorrow at 3 PM`.

**Siri phrase**: "add a to-do" or "new to-do"

**Tip**: Use **Ask for Input** for the title so you can dictate freely — include the day or time in the same sentence. You do not need a second prompt for the due date.

### Record Payment

**What it does**: Record an offline customer payment in Crater (cash, check, card, bank transfer, etc.). Requires the `billing` feature and Crater API env vars.

**JSON body**:

```json
{
  "action": "record_payment",
  "customer_name": "Acme Plumbing",
  "amount": 250,
  "payment_mode": "CHECK",
  "format": "text"
}
```

**Parameters**:
- `customer_name` (required): Customer name as it appears in Crater. Aliases: `customer`, `client`, `name`.
- `amount` (required): Payment amount in whole dollars. Accepts numerals, `$250`, and spoken currency (`100 bucks`, `100 dollars`). Alias: `payment_amount`. Quote the Shortcuts variable in the JSON body (`"amount": "Amount"`) so dictation like `100 bucks` stays valid JSON.
- `payment_mode` (optional): `CASH`, `CHECK`, `CREDIT_CARD`, `BANK_TRANSFER`, or `OTHER`. Voice-friendly aliases like `card`, `ach`, and `cheque` work. Aliases: `mode`, `method`.
- `payment_date` (optional): `YYYY-MM-DD` (defaults to today in Crater). Alias: `date`.
- `notes` (optional): Free-text note. Alias: `note`.
- `invoice_id` (optional): Specific open invoice when the customer has more than one. Alias: `invoice`.

**Also accepts**: `"action": "add_payment"` or `"action": "create_payment"`

**Example response**:

```
Recorded $250 payment from Acme Plumbing via check.
```

If Crater cannot uniquely match the customer, invoice, or payment mode, the spoken error asks you to be more specific (e.g. include `invoice_id` or `payment_mode`).

**Siri phrase**: "record a payment" or "add a payment"

**Tip**: Use **Ask for Input** for customer name and amount; add a third prompt for payment mode when you take mixed payment types.

### List To-Dos

**What it does**: Read open (or filtered) personal to-dos aloud.

**JSON body**:

```json
{
  "action": "list_todos",
  "status": "open",
  "format": "text"
}
```

**Parameters**:
- `status` (optional): `open` (default), `done`, or `all`
- `priority` (optional): filter by priority
- `limit` (optional): max items (default 15, max 50)

**Siri phrase**: "list my to-dos" or "what's on my to-do list"

### Update To-Do

**What it does**: Change title, due date, priority, or status. Match by `id` or by title text.

**JSON body**:

```json
{
  "action": "update_todo",
  "title": "Call the accountant",
  "priority": "urgent",
  "format": "text"
}
```

**Parameters**:
- `id` or `title` (required): Which item — title aliases: `todo`, `text`, `query`
- `new_title` (optional): Rename (use this when matching by title so the lookup title is not overwritten)
- `due_date` / `due` (optional): New deadline, or empty string to clear
- `priority` (optional): `low`, `normal`, `high`, `urgent`
- `status` (optional): `open` or `done`

**Siri phrase**: "update to-do"

### Complete To-Do

**What it does**: Mark a to-do done (clears it from the open list). Match by `id` or title.

**JSON body**:

```json
{
  "action": "complete_todo",
  "title": "Call the accountant",
  "format": "text"
}
```

**Also accepts**: `"action": "done_todo"` or `"action": "mark_todo_done"`

**Siri phrase**: "complete to-do" or "mark to-do done"

### Delete To-Do

**What it does**: Permanently remove a to-do. Match by `id` or title.

**JSON body**:

```json
{
  "action": "delete_todo",
  "title": "Call the accountant",
  "format": "text"
}
```

**Also accepts**: `"action": "clear_todo"`

**Siri phrase**: "delete to-do" or "clear to-do"

**Requirement**: `DATABASE_URL` (same Postgres to-do store the admin dashboard and agent use).

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

1. Add **Ask for Input** action → "What's the contact name?"
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
2. **Choose from List** → pick a contact
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
2. **Ask for Input** → "Contact name?"
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
- **Long agent turns**: Simple questions come back as spoken text. Tool-heavy prompts (audits, code, research) may take longer than Siri will wait — you'll get a push when the chat reply is ready. Pass `thread_id` to continue the same session.

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
- `check_schedule`: Show today's bookings (requires Cal.com integration)

**Ask the agent** (requires `ANTHROPIC_API_KEY` + `AGENT_ALERT_USER_ID`):

- `prompt` / `ask` / `chat` / `ask_agent`: Freeform prompt — spoken reply or push when the turn is long

**Billing** (requires `billing` feature + Crater):

- `record_payment` / `add_payment` / `create_payment`: Record an offline customer payment

**Personal to-dos** (requires `DATABASE_URL`):

- `add_todo` / `create_todo`: Create a quick to-do item (spoken dates/times in the title are applied automatically)
- `list_todos`: List open (or filtered) to-dos
- `update_todo`: Change title, due date, priority, or status
- `complete_todo` / `done_todo` / `mark_todo_done`: Mark a to-do done
- `delete_todo` / `clear_todo`: Permanently remove a to-do

**Time tracking** (requires `time_tracking` feature):

- `start_time_tracking`: Prompt with the most recent project, or start on `query` ("yes" or project name). Creates a project when the contact exists but no matching project is found.
- `stop_time_tracking`: Stop the active timer and append logged hours to the project time log.
- `time_tracking_status`: Report the running timer or suggest the most recent project.

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
