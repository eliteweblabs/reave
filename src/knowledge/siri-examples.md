# Siri Shortcuts Examples

Real-world shortcut configurations you can copy into the Shortcuts app.

## Example 1: "List My Contacts"

**What it does**: Lists all clients (or searches if you add input).

**Siri phrase**: "list my contacts" or "show my contacts"

**Shortcut steps**:

1. **Get Contents of URL**
   - URL: `https://reave.app/api/siri`
   - Method: POST
   - Headers:
     - Name: `X-Siri-Key`
     - Value: `[paste your SIRI_API_KEY here]`
     - Name: `Content-Type`
     - Value: `application/json`
   - Request Body: Text
     ```json
     {
       "action": "list_clients",
       "limit": 10,
       "format": "text"
     }
     ```

2. **Show Result**

---

## Example 2: "Find Client" (with dynamic input)

**What it does**: Asks for a contact name, then shows their details.

**Siri phrase**: "find contact" or "lookup client"

**Shortcut steps**:

1. **Ask for Input**
   - Prompt: "Which client?"
   - Input Type: Text
   - Default Answer: (leave blank)

2. **Set Variable**
   - Variable Name: `ClientName`
   - Value: `Provided Input`

3. **Text** (build JSON — insert the variable as a **pill**, not typed text)
   - Type the opening JSON, then **tap `ClientName` in the variable bar** below the keyboard to insert it as a blue pill inside the quotes:
   ```
   {
     "action": "get_client",
     "name": 
   ```
   *(tap ClientName variable here — it must appear as a blue chip, not the word "ClientName" typed out)*
   ```
   ,
     "format": "text"
   }
   ```
   If `"name"` shows plain text `ClientName` instead of a blue variable pill, the API gets an empty name and returns **"name is required"**.

4. **Get Contents of URL**
   - URL: `https://reave.app/api/siri`
   - Method: **POST** (tap the action → expand → change from GET)
   - Headers:
     - `X-Siri-Key` → your key
     - `Content-Type` → `application/json`
   - Request Body: **Text** → select the **Text** output from step 3 (not JSON fields with typed placeholders)

5. **Show Result**

6. **Speak Text** (optional)
   - Text: `Contents of URL` (so Siri reads it aloud)

---

## Example 3: "Quick Add Client"

**What it does**: Prompts for name, email, phone, company — creates the contact.

**Siri phrase**: "add client" or "new client"

**Shortcut steps**:

1. **Ask for Input**
   - Prompt: "Contact name?"
   - Variable: `Name`

2. **Ask for Input**
   - Prompt: "Email address? (optional)"
   - Default Answer: ""
   - Variable: `Email`

3. **Ask for Input**
   - Prompt: "Phone number? (optional)"
   - Default Answer: ""
   - Variable: `Phone`

4. **Ask for Input**
   - Prompt: "Company name? (optional)"
   - Default Answer: ""
   - Variable: `Company`

5. **Text** (build JSON)
   ```json
   {
     "action": "create_client",
     "name": "Name",
     "email": "Email",
     "phone": "Phone",
     "company": "Company",
     "format": "text"
   }
   ```

6. **Get Contents of URL**
   - URL: `https://reave.app/api/siri`
   - Method: POST
   - Headers: `X-Siri-Key` + `Content-Type: application/json`
   - Request Body: `Text` (from step 5)

7. **Show Result**

---

## Example 4: "Start Time Tracking"

**What it does**: Asks which project (speaks the most recent), listens for "yes" or a project name like "Cooper Website", then starts a timer. Creates a new project when the contact exists but the project does not.

**Requires**: `time_tracking` enabled in install config.

**Siri phrase**: "start time tracking"

**Shortcut steps**:

1. **Get Contents of URL** (prompt)
   - URL: `https://reave.app/api/siri`
   - Method: POST
   - Headers: `X-Siri-Key` + `Content-Type: application/json`
   - Request Body:
     ```json
     {
       "action": "start_time_tracking",
       "format": "json"
     }
     ```

2. **Get Dictionary Value** — key `text` (spoken prompt)

3. **Speak Text** — Dictionary Value from step 2

4. **Dictate Text** (or **Ask for Input**)
   - Prompt: "Which project?"
   - Variable: `ProjectAnswer`

5. **Get Dictionary Value** from step 1 — key `data`, then key `suggested`, then key `slug`
   - Variable: `SuggestedSlug` (may be empty if no recent project)

6. **Text** (build JSON — use variable pills for `ProjectAnswer` and `SuggestedSlug`)
   ```json
   {
     "action": "start_time_tracking",
     "query": 
   ```
   *(ProjectAnswer pill)*
   ```json
   ,
     "suggested_slug": 
   ```
   *(SuggestedSlug pill — omit the key entirely in Shortcuts if empty, or pass empty string)*
   ```json
   ,
     "format": "text"
   }
   ```

7. **Get Contents of URL** — same headers as step 1, body from step 6

8. **Speak Text** — response (e.g. "Tracking time on Cooper Website for Cooper Corp.")

**Companion shortcut — "Stop Time Tracking"**:

```json
{
  "action": "stop_time_tracking",
  "format": "text"
}
```

---

## Example 5: "My Active Work"

**What it does**: Shows all active work items.

**Siri phrase**: "my active work" or "show active projects"

**Shortcut steps**:

1. **Get Contents of URL**
   - URL: `https://reave.app/api/siri`
   - Method: POST
   - Headers: `X-Siri-Key` + `Content-Type: application/json`
   - Request Body:
     ```json
     {
       "action": "list_work",
       "status": "active",
       "format": "text"
     }
     ```

2. **Show Result**

---

## Example 6: "Create Work Item"

**What it does**: Prompts for title and client, creates a new work item.

**Siri phrase**: "create work item" or "new project"

**Shortcut steps**:

1. **Ask for Input**
   - Prompt: "Project title?"
   - Variable: `Title`

2. **Ask for Input**
   - Prompt: "Contact name?"
   - Variable: `Client`

3. **Ask from List**
   - Prompt: "Status?"
   - Options: `active`, `quote`, `paused`
   - Variable: `Status`

4. **Text**
   ```json
   {
     "action": "create_work",
     "title": "Title",
     "client": "Client",
     "status": "Status",
     "format": "text"
   }
   ```

5. **Get Contents of URL**
   - URL: `https://reave.app/api/siri`
   - Method: POST
   - Headers: `X-Siri-Key` + `Content-Type: application/json`
   - Request Body: `Text`

6. **Show Result**

---

## Example 6c: "Add a To-Do"

**What it does**: Creates a personal/work to-do (not a contact project) from a dictated title. The server reads the title for a date or time (`tomorrow`, `Friday at 3`, `August 15`) and sets the due date — no second prompt.

**Siri phrase**: "add a to-do" or "new to-do"

**Shortcut steps**:

1. **Ask for Input**
   - Prompt: "What's the to-do?"
   - Variable: `Title`

2. **Text**
   ```json
   {
     "action": "add_todo",
     "title": "Title",
     "format": "text"
   }
   ```

3. **Get Contents of URL**
   - URL: `https://reave.app/api/siri`
   - Method: POST
   - Headers: `X-Siri-Key` + `Content-Type: application/json`
   - Request Body: `Text`

4. **Show Result**

Example: saying "Call the plumber tomorrow at 3" stores **Call the plumber** due tomorrow at 3 PM.

**Optional**: A separate shortcut for `"action": "list_todos"` / `"action": "complete_todo"`.

---

## Example 6d: "Record a Payment"

**What it does**: Records an offline payment in Crater for a customer (cash, check, card, etc.).

**Siri phrase**: "record a payment" or "add a payment"

**Requires**: `billing` feature + Crater API configured.

**Shortcut steps**:

1. **Ask for Input**
   - Prompt: "Which customer?"
   - Variable: `Customer`

2. **Ask for Input**
   - Prompt: "How much?"
   - Input Type: Number (or Text)
   - Variable: `Amount`

3. **Ask for Input** (optional)
   - Prompt: "Payment mode? cash, check, card, bank transfer, or other"
   - Variable: `Mode`

4. **Text**
   ```json
   {
     "action": "record_payment",
     "customer_name": "Customer",
     "amount": "Amount",
     "payment_mode": "Mode",
     "format": "text"
   }
   ```

5. **Get Contents of URL**
   - URL: `https://reave.app/api/siri`
   - Method: POST
   - Headers: `X-Siri-Key` + `Content-Type: application/json`
   - Request Body: `Text` (not the JSON key/value list)

6. **Show Result** / **Speak Text**

**Tip**: If Crater says the customer or invoice is ambiguous, re-run with a fuller customer name or add `invoice_id`. Dictate `100`, `$100`, or `100 bucks` — keep the Amount pill inside quotes so the JSON stays valid. Do not switch Get Contents of URL to Request Body → JSON; that list is what produces a generic Cloudflare 400 in Shortcuts.

---

## Example 7: "Create Reave Project"

**What it does**: Finds an existing client or creates a new one, then starts a project. Prompts for missing details via Siri.

**Siri phrase**: "create reave project" or "new reave project"

**Shortcut steps**:

1. **Ask for Input**
   - Prompt: `Existing client name? Leave blank for a new client.`
   - Variable: `ClientQuery`

2. **If** `ClientQuery` **has any value**
   - **Text** (build lookup JSON):
     ```json
     {
       "action": "find_client",
       "client": "ClientQuery"
     }
     ```
   - **Get Contents of URL**
     - URL: `https://reave.app/api/siri`
     - Method: POST
     - Headers: `X-Siri-Key` + `Content-Type: application/json`
     - Request Body: Text (from above)
   - **Get Dictionary from Input** → Input: Contents of URL
   - **Get Dictionary Value** → Key: `data`, Dictionary: Dictionary
   - **Get Dictionary Value** → Key: `found`, Dictionary: Dictionary Value
   - **Set Variable** → Name: `ClientFound`, Value: Dictionary Value
   - **Otherwise**
   - **Set Variable** → Name: `ClientFound`, Value: `false`

3. **If** `ClientFound` **is** `false`
   - **Ask for Input** → Prompt: `Client first name?`, Variable: `FirstName`
   - **Ask for Input** → Prompt: `Client last name?`, Variable: `LastName`
   - **Ask for Input** → Prompt: `Company name?`, Variable: `Company`
   - **Ask for Input** → Prompt: `Email address?`, Variable: `Email`

4. **Ask for Input**
   - Prompt: `Project title?`
   - Variable: `ProjectTitle`

5. **Text** (build create JSON — Shortcuts replaces variables automatically)
   ```json
   {
     "action": "create_project",
     "client": "ClientQuery",
     "first_name": "FirstName",
     "last_name": "LastName",
     "company": "Company",
     "email": "Email",
     "title": "ProjectTitle",
     "format": "text"
   }
   ```

6. **Get Contents of URL**
   - URL: `https://reave.app/api/siri`
   - Method: POST
   - Headers: `X-Siri-Key` + `Content-Type: application/json`
   - Request Body: Text (from step 5)

7. **Speak Text** → Text: Contents of URL

**Notes**:
- When an existing client is found, the first/last/company/email fields are ignored.
- Leave `ClientQuery` blank to always create a new client.
- Use **Speak Text** instead of **Show Result** if you want Siri to read the confirmation aloud.

---

## Example 7b: "Audit" (quick street audit)

**What it does**: Say a business name — add street or town if needed — and it kicks off the research agent in the background: finds the business and website, resolves/creates the contact, runs a **fast audit** (Lighthouse, HTML, SSL, DNS, Google/social/reputation search — no Playwright or link crawl), and files a project with a write-up. Siri gets a short immediate ack ("Running an audit on … It will be available in the Reave app shortly."); the finished result (new client + new project + top findings) shows up a little later as a push notification.

**Siri phrase**: "audit" or "create proposal" or "research this business"

**Shortcut steps**:

1. **Ask for Input**
   - Prompt: `Which business? Add street or town if the name is common.`
   - Variable: `Business`

2. **Text** (build JSON — insert the variable as a blue pill, not typed text)
   ```json
   {
     "action": "audit",
     "business": "Business",
     "format": "text"
   }
   ```

3. **Get Contents of URL**
   - URL: `https://reave.app/api/siri`
   - Method: POST
   - Headers: `X-Siri-Key` + `Content-Type: application/json`
   - Request Body: Text (from step 2)

4. **Speak Text** → Text: Contents of URL

**Examples of what to say**:
- "Example Plumbing"
- "Joe's Barber on Main Street"
- "The Corner Cafe in Springfield"

**Notes**:
- One prompt is enough — the research agent finds the website and contact details from the name/description.
- This does NOT reply with the finished audit — that comes later via push notification (needs `AGENT_ALERT_USER_ID` + web push configured). The immediate Siri response only confirms the research has started.
- The new client and project both land in the admin dashboard as soon as the research finishes, even before the push notification arrives.
- `"action": "create_proposal"` still works and runs the same quick tier.

---

## Example 7c: "Full Audit" (comprehensive)

**What it does**: Same as the quick audit, plus Playwright UX/UI (real browser), broken link crawl, and tech stack detection. Use when you have time — not optimized for on-the-street speed.

**Siri phrase**: "full audit"

**Shortcut steps**: Same as Example 6b, but use `"action": "full_audit"` in the JSON body.

---

## Example 8: "Send Client SMS"

**What it does**: Sends a text message via Telnyx.

**Siri phrase**: "text a contact" or "send client sms"

**Shortcut steps**:

1. **Ask for Input**
   - Prompt: "Client phone number? (E.164 format, e.g. +12125551234)"
   - Keyboard Type: Phone Pad
   - Variable: `Phone`

2. **Ask for Input**
   - Prompt: "Message?"
   - Variable: `Message`

3. **Text**
   ```json
   {
     "action": "send_sms",
     "to": "Phone",
     "message": "Message",
     "format": "text"
   }
   ```

4. **Get Contents of URL**
   - URL: `https://reave.app/api/siri`
   - Method: POST
   - Headers: `X-Siri-Key` + `Content-Type: application/json`
   - Request Body: `Text`

5. **Show Result**

---

## Example 9: "Morning Briefing" (Automation)

**What it does**: Runs every weekday at 9am, speaks your active work and status.

**Trigger**: Time of Day → 9:00 AM, weekdays

**Shortcut steps**:

1. **Get Contents of URL** (active work)
   - URL: `https://reave.app/api/siri`
   - Method: POST
   - Headers: `X-Siri-Key` + `Content-Type: application/json`
   - Request Body:
     ```json
     {"action":"list_work","status":"active","format":"text"}
     ```
   - Variable: `WorkList`

2. **Get Contents of URL** (status check)
   - URL: `https://reave.app/api/siri`
   - Method: POST
   - Headers: `X-Siri-Key` + `Content-Type: application/json`
   - Request Body:
     ```json
     {"action":"status","format":"text"}
     ```
   - Variable: `Status`

3. **Text**
   ```
   Good morning! Here's your briefing:

   WorkList

   Status
   ```

4. **Speak Text**
   - Text: `Text` (from step 3)
   - Wait Until Finished: On

5. **Show Notification** (optional)
   - Title: "Morning Briefing"
   - Body: `Text` (from step 3)

---

## Example 10: "Ask Reave" (prompt the agent)

**What it does**: Dictates a question to the same knowledge agent as Admin → Sessions. Siri speaks the reply when it comes back in time; longer turns notify you.

**Siri phrase**: "ask Reave" or "prompt the agent" or "hey Reave"

**Shortcut steps**:

1. **Ask for Input**
   - Prompt: "What should I ask Reave?"
   - Input Type: Text
   - Store in: `Prompt`

2. **Get Contents of URL**
   - URL: `https://reave.app/api/siri`
   - Method: POST
   - Headers: `X-Siri-Key` + `Content-Type: application/json`
   - Request Body (Text):
     ```json
     {"action":"prompt","message":"Prompt","format":"text"}
     ```
     *(Shortcuts replaces `Prompt` with what you said.)*

3. **Speak Text**
   - Text: `Contents of URL`
   - Wait Until Finished: On

**Pro tip**: For a follow-up, use the JSON response's `data.threadId` as `thread_id` on the next call. Use `"async": true` when you know the ask will take a while (research, code, audits).

---

## Example 11: "Reave Status" (Widget/Lock Screen)

**What it does**: Quick health check you can run from Lock Screen widget.

**Siri phrase**: "check reave" or "reave status"

**Shortcut steps**:

1. **Get Contents of URL**
   - URL: `https://reave.app/api/siri`
   - Method: POST
   - Headers: `X-Siri-Key` + `Content-Type: application/json`
   - Request Body:
     ```json
     {"action":"status","format":"text"}
     ```

2. **Show Result**

**Pro tip**: Add this to your Lock Screen widget for one-tap status check (no unlock needed).

---

## Advanced: Sharing Context from Other Apps

### From Contacts App

1. Open Contacts → select a contact
2. Tap Share button
3. Choose your "Add Client" shortcut
4. Shortcuts auto-extracts name, email, phone
5. Pre-fills the API request

**Shortcut modification**: Add **Receive [Contact] from [Share Sheet]** as the first action, then use `Get Details of Contact` to extract fields.

### From Safari (Save URL to Client)

1. Browse a contact's website
2. Tap Share → your "Add Client Website" shortcut
3. Shortcut extracts URL + page title
4. Prompts for client name
5. Creates client with website in notes

### From Photos (Attach to Work Item)

Upload image separately via `/api/work/[slug]/files`, then reference in work body. Shortcuts can't upload files directly to `/api/siri`, but you can chain shortcuts:

1. First shortcut: upload photo to your server/cloud
2. Second shortcut: create work item with URL in body

---

## Troubleshooting

### Shortcut fails with "Invalid JSON"

- Check the JSON syntax (use [jsonlint.com](https://jsonlint.com/))
- Make sure variable names match exactly (case-sensitive)
- Ensure the Request Body type is **Text** (not Dictionary)

### "Unauthorized" error

- `X-Siri-Key` header is missing or wrong
- Copy the key from Railway → Astro → Variables → `SIRI_API_KEY`
- Re-add the header (no extra spaces)

### Siri doesn't understand the phrase

- Re-record the phrase (Settings → Siri & Search → Shortcuts)
- Try a more unique phrase (avoid common words like "open" or "call")
- Speak clearly and slowly when recording

### Response is empty

- Check the `format` parameter: use `"format": "text"` for Siri-friendly output
- Test with curl first (see siri-quick-reference.md)

---

## Tips

- **Pin to Home Screen**: Shortcuts with long names get truncated; use short names for Home Screen icons
- **Use Folders**: Organize shortcuts into folders (e.g. "Reave", "Contacts", "Work")
- **Backup**: iCloud syncs shortcuts, but export critical ones (Share → Copy iCloud Link)
- **Share with Team**: Share iCloud links with team members so they can import your shortcuts

---

**See also**:
- Full documentation: `/knowledge/siri-shortcuts`
- Quick reference (JSON payloads): `/knowledge/siri-quick-reference`
