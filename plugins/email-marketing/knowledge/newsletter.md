# Newsletter & Email Automation

Lifecycle emails + one-off broadcasts, built on Resend. Gated by the
`email_marketing` feature (config-{slug}.json). Admin surface: the **Newsletter**
tab in `/admin/`. Projects have an **Email** tab with the send history.
The dashboard lists upcoming scheduled emails so the owner can cancel or
reschedule before they go out.

## Agent conditionals — say these out loud

When chatting with the owner, check `list_scheduled_emails` (also injected
into your briefing) and surface the matching line:

- A broadcast due in 1–3 days:
  “The fall Newsletter is set to go out in two days. Would you like to review it?”
- A project just marked done with a delayed follow-up:
  “Project ABC has been marked completed. In two weeks the follow-up email will be sent.”
  Delay is the Newsletter automation setting (days/hours after completion).
- A named template to one client (owner asks, or you offer):
  “Send the ‘We value your opinion’ email to client ABC”
  → `send_template_email` with `template: "we value your opinion"` and `client: "ABC"`.

Dashboard copy uses the same phrasing. From that view the owner can **Cancel**
or **Adjust** the send time. You can do the same with `cancel_scheduled_email`
and `reschedule_email`.

## Templates

Defined in `src/lib/newsletterTemplates.ts`. Two kinds:

**Automation (lifecycle):**
- `user_welcome` — welcome a new contact
- `user_followup` — check in a few days later
- `project_complete` — thank-you after a project is marked done
- `review_request` — ask a happy client for a review
- `value_your_opinion` — “We value your opinion” feedback ask

**Broadcast (manual):**
- `reengagement` — "we miss you" win-back
- `referral_request` — ask for referrals
- `announcement` — company news / launch
- `newsletter_update` — recurring / seasonal roundup (fall newsletter)
- `seasonal_promo` — limited-time offer
- `thank_you` — appreciation note

All templates render through `brandedEmailHtml` and include a CAN-SPAM footer
(company name + address + one-click unsubscribe).

## Automation rules — the "when"

Defaults in `src/lib/newsletterAutomations.ts`; per-install overrides
(enable/disable + timing) saved in Postgres and editable in the admin
**Newsletter** tab. The project-complete follow-up delay is the admin setting
the owner changes when they want “in two weeks” instead of “in an hour.”

| Automation | Trigger | Default delay | Notes |
|-----------|---------|---------------|-------|
| Welcome | contact created | 5 min | via `POST /api/clients` or `/api/contacts` |
| Welcome follow-up | contact created | 3 days | skipped if the contact already has a project |
| Project complete | job → `done` | 1 hour | fired from `storeWriteWork` |
| Review request | job → `done` | 5 days | uses `NEWSLETTER_REVIEW_URL` |
| We value your opinion | job → `done` | 14 days | **off by default** — enable + set delay in Newsletter |

## Agent tools

- `list_email_templates` — ids and labels
- `list_scheduled_emails` — upcoming queue, grouped broadcasts
- `send_template_email` — send/schedule a template to one client
- `cancel_scheduled_email` / `reschedule_email` — triage the queue

## How sends happen — the "how"

1. An event fires (`onContactCreated` / `onJobCompleted` in
   `src/lib/newsletterEngine.ts`) and **enqueues** one scheduled send per
   enabled automation, with a `dedup_key` so it can only be queued once.
2. The scheduler (`src/lib/newsletterScheduler.ts`, lazy-started like the uptime
   poller, every `NEWSLETTER_POLL_MINUTES`) calls `processDueNewsletterSends`.
3. For each due send it applies the guardrails, then sends via Resend with
   `List-Unsubscribe` headers:
   - skip if on the suppression list (`newsletter_unsubscribes`)
   - skip follow-ups if the contact already converted
   - only send inside the send window (`NEWSLETTER_SEND_WINDOW_START/END`,
     weekdays unless `NEWSLETTER_SEND_ON_WEEKENDS=true`)

Broadcasts (`POST /api/newsletter/send`, owner-only) can send immediately or
accept `dueAt` to schedule. A `campaign_id` groups the batch so cancel/adjust
treats “the fall newsletter” as one row, not one row per contact.

Cron/manual trigger: `GET/POST /api/newsletter/poll?key=NEWSLETTER_POLL_SECRET`
(add `&force=1` to ignore the send window).

## Project Email tab

`GET /api/work/:slug/emails` merges inbound (linked + `job_slug`), outbound
(`project_outbound_emails`), and newsletter queue rows for that project.

## Unsubscribe

Every email carries a signed token link → `/api/newsletter/unsubscribe`
(public; supports RFC 8058 one-click POST). Unsubscribes are stored per email
and honored on every future send.

## Storage

Postgres (DATABASE_URL): `newsletter_queue`, `newsletter_unsubscribes`,
`newsletter_automations`. Falls back to `src/knowledge/newsletter.json` in dev.
