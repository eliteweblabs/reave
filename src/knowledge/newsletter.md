# Newsletter & Email Automation

Lifecycle emails + one-off broadcasts, built on Resend. Gated by the
`email_marketing` feature (config-{slug}.json). Admin surface: the **Newsletter**
tab in `/admin/`.

## Templates

Defined in `src/lib/newsletterTemplates.ts`. Two kinds:

**Automation (lifecycle):**
- `user_welcome` — welcome a new contact
- `user_followup` — check in a few days later
- `project_complete` — thank-you after a project is marked done
- `review_request` — ask a happy client for a review

**Broadcast (manual):**
- `reengagement` — "we miss you" win-back
- `referral_request` — ask for referrals
- `announcement` — company news / launch
- `newsletter_update` — recurring roundup
- `seasonal_promo` — limited-time offer
- `thank_you` — appreciation note

All templates render through `brandedEmailHtml` and include a CAN-SPAM footer
(company name + address + one-click unsubscribe).

## Automation rules — the "when"

Defaults in `src/lib/newsletterAutomations.ts`; per-install overrides
(enable/disable + timing) saved in Postgres and editable in the admin UI.

| Automation | Trigger | Default delay | Notes |
|-----------|---------|---------------|-------|
| Welcome | contact created | 5 min | via `POST /api/clients` or `/api/contacts` |
| Welcome follow-up | contact created | 3 days | skipped if the contact already has a project |
| Project complete | job → `done` | 1 hour | fired from `storeWriteWork` |
| Review request | job → `done` | 5 days | uses `NEWSLETTER_REVIEW_URL` |

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

Broadcasts (`POST /api/newsletter/send`, owner-only) enqueue immediate sends to
all contacts (or a list of uids) and dispatch right away, bypassing the window.

Cron/manual trigger: `GET/POST /api/newsletter/poll?key=NEWSLETTER_POLL_SECRET`
(add `&force=1` to ignore the send window).

## Unsubscribe

Every email carries a signed token link → `/api/newsletter/unsubscribe`
(public; supports RFC 8058 one-click POST). Unsubscribes are stored per email
and honored on every future send.

## Storage

Postgres (DATABASE_URL): `newsletter_queue`, `newsletter_unsubscribes`,
`newsletter_automations`. Falls back to `src/knowledge/newsletter.json` in dev.
