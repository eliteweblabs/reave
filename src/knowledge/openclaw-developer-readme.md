# OpenClaw email tools — developer README (snapshot)

> **Source:** `openclaw-email-tools`. Snapshot: 2026-06-12. Not auto-synced — run this script after changes there.

---


# openclaw-email-tools

A small toolkit for letting **OpenClaw** monitor and automatically handle a user's
email account.

> **Looking for the non-developer hand-off doc?** See [`CLIENT.md`](./CLIENT.md).
> It's the one-page guide for whoever will manage the rules day-to-day.

## Quick start (the management UI)

```bash
npm install
npm run serve            # starts the web UI + the inbox monitor
```

Then open `http://127.0.0.1:4400` and manage rules from the browser. Set
`ADMIN_USER` + `ADMIN_PASSWORD` in `.env` to put the UI behind HTTP Basic
auth before exposing it on a real network.

The core idea: incoming emails are matched against a **keyword / phrase rule
table** that maps phrases → a generic numeric **status code** (`01`, `02`, ...).
Each status code has a registered **handler function** that decides what to do
with the email (mark, archive, log, reply, escalate, etc.).

The library is provider-agnostic. It ships with three providers behind the
same `EmailProvider` interface:

- `MockEmailProvider` — in-memory, used by the demo and tests.
- `ImapEmailProvider` — IMAP + Gmail App Password (recommended; matches the
  existing OpenClaw email infra). Setup steps below.
- `GmailProvider` — real Gmail via the Google API + OAuth. Setup steps below.

Microsoft Graph can be added later as another adapter without changing any
rule, handler, or pipeline code.

## How a rule is structured

Each rule says **"if these phrases match, do these things, in order."**
Single source of truth: `src/config/status-rules.json`.

```json
{
  "rules": [
    {
      "status": "01",
      "description": "Mark, archive, and log status 01 emails.",
      "matchMode": "any",
      "fields": ["subject", "body"],
      "phrases": ["OPENCLAW-TEST-STATUS-01", "status 01 trigger phrase"],
      "do": ["mark", "archive", "log"],
      "enabled": true
    },
    {
      "status": "02",
      "description": "Urgent — also notify Thomas.",
      "phrases": ["URGENT", "asap please", "emergency"],
      "do": ["mark", "trigger:example-notify", "log"]
    }
  ]
}
```

Built-in actions: `mark`, `archive`, `log`. Custom actions: `trigger:<name>`,
where `<name>` is registered in `src/handlers/triggers.ts`. Default `do` if
omitted: `["mark", "archive", "log"]`.

To add a status `03`, `04`, ... you only edit the JSON (or use the web UI).
There's no per-status code unless you want a bespoke trigger — and even then,
that's one function in `triggers.ts`.

## Tools exposed to OpenClaw

All exported from the package root (`openclaw-email-tools`):

- `processEmail(email, opts?)` — classify → run actions → log pipeline. The
  main tool OpenClaw should call per inbound message.
- `monitorInbox(provider, opts?)` — long-running poller that runs
  `processEmail` on every new message. Returns a controller.
- `startServer(opts?)` — launches the management UI + (optionally) the
  monitor in one process.
- `classifyEmail(email)` — returns matched rules (does not mutate).
- `loadRules()` / `setRules()` / `reloadRules()` — read / override / re-read
  the active rule table.
- `loadRulesFromFile()` / `saveRulesToFile()` / `validateRuleTable()` —
  programmatic rule-table management.
- `registerTrigger(name, fn)` / `getTrigger(name)` / `listTriggers()` —
  manage custom side-effect actions.
- `registerHandler(status, fn)` — override the generic action runner for a
  specific status code (rare).
- `readMonitorState()` / `resetMonitorState()` — inspect or wipe the
  monitor's persisted cursor.
- `getRecentLogs(limit?)` / `addLogSink()` — observability hooks.

## Quick start (mock)

```bash
npm install
npm run demo     # runs scripts/demo.ts against the mock provider
npm run build    # emits dist/ for consumers
```

## Wiring up a real account via IMAP (recommended)

Works with any IMAP server. For Gmail, you authenticate with a **Google App
Password** (no OAuth client setup required).

1. **Generate a Gmail app password**
   - https://myaccount.google.com/security → enable 2-Step Verification.
   - https://myaccount.google.com/apppasswords → create one for "Mail".

2. **`.env`** — copy `.env.example` and fill in:

   ```env
   IMAP_USER=you@your-domain.com
   IMAP_PASSWORD=xxxxxxxxxxxxxxxx   # the 16-char app password, no spaces
   # IMAP_HOST=imap.gmail.com       # default
   # IMAP_PORT=993                  # default
   ```

3. **Sanity check (read-only)**

   ```bash
   npm run imap:test
   ```

   Lists the most recent inbox messages. No labels, no archives, no writes.

4. **Run the full pipeline against the latest message**

   ```bash
   npm run imap:process-latest             # dry-run: classify only
   npm run imap:process-latest -- --apply  # actually mark / archive / log
   ```

   In `--apply` mode the matched email is given a Gmail label
   `openclaw/status/<code>` (via the `X-GM-LABELS` IMAP extension) and the
   `\Inbox` label is removed (Gmail-style archive). Use a test inbox until
   you trust your rules.

### Using `ImapEmailProvider` from your own code

```ts
import { ImapEmailProvider, processEmail } from "openclaw-email-tools";

const provider = new ImapEmailProvider({
  user: process.env.IMAP_USER!,
  password: process.env.IMAP_PASSWORD!,
});

try {
  for (const email of await provider.listInbox()) {
    await processEmail(email, { provider });
  }
} finally {
  await provider.close();
}
```

Internally the provider keeps one persistent IMAP connection (opened lazily
on the first call). Always `close()` when you're done so it logs out cleanly.

## Continuous monitoring

`monitorInbox(provider, opts)` polls on a fixed interval and runs
`processEmail` on every new message that arrives. It persists a small
state file (`./data/monitor-state.json` by default) so restarts don't
re-process old mail.

### From the command line

```bash
npm run monitor                         # poll every 60s, run handlers
npm run monitor -- --dry-run            # classify + log only, no mutations
npm run monitor -- --interval 15        # poll every 15s
npm run monitor -- --no-skip-existing   # also act on existing inbox first run
npm run monitor:status                  # print current state file
npm run monitor:reset                   # wipe state (next run re-bootstraps)
```

`Ctrl-C` triggers a graceful shutdown — the monitor finishes its current
tick, flushes state, and closes the IMAP connection before exiting.

By default, on the very first run the monitor records every existing inbox
message as "already seen" and only acts on mail that arrives after startup.
This protects against accidentally archiving a real mailbox the first time
you turn it on. Override with `--no-skip-existing` (or
`skipExistingOnFirstRun: false` in code).

### From your own code

```ts
import {
  ImapEmailProvider,
  monitorInbox,
} from "openclaw-email-tools";

const provider = new ImapEmailProvider({
  user: process.env.IMAP_USER!,
  password: process.env.IMAP_PASSWORD!,
});

const controller = await monitorInbox(provider, {
  intervalMs: 30_000,
  dryRun: false,
});

process.on("SIGINT", () => void controller.stop());
await controller.done;
```

### Testing the monitor end-to-end

You can verify the full flow safely without touching real mail. Pick any of:

1. **Dry-run against the real inbox** — proves the wiring works, mutates nothing.

   ```bash
   npm run monitor -- --dry-run --interval 5 --no-skip-existing
   ```

   Every tick lists the inbox and logs a `[dry-run] classified` line per
   message with the matched status codes (which will be empty until you
   define real rules).

2. **End-to-end with a deliberately-matching test email**:

   1. Edit `src/config/status-rules.json` and add a uniquely-recognizable
      phrase you'd never see in real mail, e.g.

      ```json
      "phrases": [
        "OPENCLAW-TEST-STATUS-01",
        "status 01 trigger phrase"
      ]
      ```

   2. Send yourself an email at the monitored address with that phrase in
      the subject or body.
   3. Reset the monitor cursor so it sees the new arrival as new:

      ```bash
      npm run monitor:reset
      ```

   4. Start the monitor with a short interval:

      ```bash
      npm run monitor -- --interval 10
      ```

   5. Within 10 seconds you should see, in order:
      - `monitor: tick — 1 new message(s)`
      - `marked status 01`
      - `ran status 01 trigger function`
      - `archived email`
      - `status 01 pipeline complete`

   6. Verify in Gmail: the message has an `openclaw/status/01` label and
      is no longer in the INBOX (it's in **All Mail**).

3. **One-shot replay against the latest message** — useful when you don't
   want to start the long-running monitor:

   ```bash
   npm run imap:process-latest             # dry-run
   npm run imap:process-latest -- --apply  # actually run the pipeline
   ```

4. **Pure unit-test with the mock provider** — no network at all:

   ```bash
   npm run demo
   ```

### Managing a running monitor

Day-to-day operations:

| Task | Command |
|---|---|
| Start in foreground (good for development) | `npm run monitor` |
| Start in background, log to file | `nohup npm run monitor > monitor.log 2>&1 &` |
| Check what it has done | `npm run monitor:status` |
| Tail the live log | `tail -f monitor.log` |
| Re-process the entire inbox | `npm run monitor:reset && npm run monitor -- --no-skip-existing` |
| Stop a foreground monitor | `Ctrl-C` (graceful) |
| Stop a background monitor | `pkill -INT -f scripts/monitor.ts` (graceful) |

For a production deployment use a process supervisor (launchd / systemd /
pm2 / Docker restart policy) so the monitor restarts on crash. Because the
state file persists `seenEmailIds`, a restart will not re-process anything
it already handled.

### Configuration knobs (`MonitorOptions`)

| Field | Default | Meaning |
|---|---|---|
| `intervalMs` | `60_000` | Time between polling ticks. |
| `stateFile` | `./data/monitor-state.json` | Where the cursor is persisted. |
| `skipExistingOnFirstRun` | `true` | First-run safety: ignore current inbox. |
| `batchSize` | `25` | Max emails processed per tick. |
| `seenIdRingSize` | `1000` | Cap on the ID memory ring. |
| `errorBackoffMs` | `30_000` | Sleep after a failed tick. |
| `dryRun` | `false` | Classify + log only; skip handlers. |
| `rules` | active table | Override the rule table for this monitor. |

Env-var equivalent: `MONITOR_STATE_FILE` overrides the state file path
without code changes.

## Wiring up a real Gmail account via the Gmail API (alternative)

1. **Google Cloud Console**
   - Create or pick a project, then **enable the Gmail API**.
   - **OAuth consent screen → External**, add yourself as a Test User.
   - **Credentials → Create OAuth client → Desktop app** (or Web app with
     `http://localhost:3000/oauth2callback` as a registered redirect URI).
   - Copy the Client ID and Client Secret.

2. **`.env`** — copy `.env.example` and fill in:

   ```env
   GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...
   GOOGLE_REFRESH_TOKEN=    # filled in by the next step
   ```

3. **Mint a refresh token (one time)**

   ```bash
   npm run gmail:auth
   ```

   The script prints a URL, opens a local listener on
   `http://localhost:3000/oauth2callback`, captures the redirect, and prints a
   refresh token. Save that token as `GOOGLE_REFRESH_TOKEN` in `.env`.

4. **Sanity check (read-only)**

   ```bash
   npm run gmail:test
   ```

   Lists the most recent inbox messages. No writes, no labeling, no archiving.

5. **Run the full pipeline against the latest message**

   ```bash
   npm run gmail:process-latest             # dry-run: classify only
   npm run gmail:process-latest -- --apply  # actually mark / archive / log
   ```

   In `--apply` mode the matched email is labeled `openclaw/status/<code>` and
   removed from the `INBOX`. Use a test inbox until you trust your rules.

### Using `GmailProvider` from your own code

```ts
import { GmailProvider, processEmail } from "openclaw-email-tools";

const provider = new GmailProvider({
  clientId: process.env.GOOGLE_CLIENT_ID!,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
  refreshToken: process.env.GOOGLE_REFRESH_TOKEN!,
});

for (const email of await provider.listInbox()) {
  await processEmail(email, { provider });
}
```

`GmailProvider` requests the `gmail.modify` scope: it can read messages and
add/remove labels (which is how Gmail "archives"), but it **cannot
permanently delete** anything.

## Project layout

```
src/
  config/
    status-rules.json       Keyword → status mapping
  lib/
    matcher.ts              Phrase / keyword matching
    email-provider.ts       EmailProvider interface + in-memory mock
    logger.ts               Structured logger
    monitor.ts              Polling loop with state persistence
  handlers/
    registry.ts             status code → handler function
    status-01.ts            Example handler (the one the user spec'd)
  providers/
    imap.ts                 ImapEmailProvider (IMAP + app password — recommended)
    gmail.ts                GmailProvider (Google API + OAuth)
  types.ts                  Shared types
  index.ts                  Public API
  handlers/
    registry.ts             status code → handler (default: action-runner)
    action-runner.ts        the generic handler that reads each rule's `do` list
    triggers.ts             registry of custom triggers (`trigger:<name>`)
  server/
    server.ts               Express HTTP server: rules CRUD, test, events
    public/                 single-file HTML/CSS/JS management UI
scripts/
  demo.ts                       End-to-end runnable demo (mock provider)
  imap-test.ts                  Read-only IMAP connection sanity check
  imap-process-latest.ts        Run pipeline against latest inbox msg via IMAP
  gmail-auth.ts                 One-time OAuth helper → refresh token
  gmail-test.ts                 Read-only Gmail-API connection sanity check
  gmail-process-latest.ts       Run pipeline against latest inbox msg via Gmail API
  monitor.ts                    Long-running poller (CLI entry, no UI)
  monitor-status.ts             Print persisted monitor state
  monitor-reset.ts              Wipe persisted monitor state
  serve.ts                      Production entry: management UI + monitor
data/
  monitor-state.json            Persisted cursor (created on first run; gitignored)
CLIENT.md                       The hand-off doc for the day-to-day rule manager
```
