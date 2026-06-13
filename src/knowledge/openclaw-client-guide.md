# OpenClaw email tools — client guide (snapshot)

> **Source:** `openclaw-email-tools`. Snapshot: 2026-06-12. Not auto-synced — run this script after changes there.

---


# OpenClaw Email Rules — Client Guide

This is the manual for the person who manages day-to-day email rules.
**No coding required.** You'll spend your time in a browser tab and
maybe in `.env` once.

## What this thing does, in plain English

- It watches your inbox in the background.
- For every new email, it checks whether the subject or body contains
  any phrase you've taught it to look for.
- If a phrase matches, it does the actions you've told it to do:
  apply a label, archive the email, log the event, optionally trigger
  a custom action.
- It does this forever, until you turn it off.

## Starting and stopping the management tool

Every command is run from inside the project folder.

```bash
npm install      # one-time, installs dependencies
npm run serve    # starts the management UI + the inbox monitor
```

The terminal will print a line like:

```
[server] listening on http://127.0.0.1:4400
```

Open that URL in your browser. That page is your management tool.

To stop everything: press `Ctrl-C` in the terminal. It shuts down
gracefully (finishes the current poll, flushes state, closes the IMAP
connection).

> **Tip — keep it running.** Use a process supervisor in production
> (launchd / systemd / pm2 / Docker `restart: always`) so it restarts
> after a crash or reboot. Because the monitor remembers what it has
> already processed, restarting never re-handles old mail.

## Logging in (optional but recommended)

If you put these two values in `.env`, the browser will ask for a
username and password before showing the page:

```
ADMIN_USER=admin
ADMIN_PASSWORD=pick-something-strong
```

Without those set, anyone who can reach the server URL can manage
rules. Set them as soon as you put this on a server.

## Connecting to your inbox

Open `.env` and fill in:

```
IMAP_USER=you@your-domain.com
IMAP_PASSWORD=xxxxxxxxxxxxxxxx
```

`IMAP_PASSWORD` is **not** your real Gmail password. It's a
**Google App Password** specifically for this tool:

1. Go to https://myaccount.google.com/security and turn on
   2-Step Verification.
2. Go to https://myaccount.google.com/apppasswords, generate one
   labeled "OpenClaw" or similar.
3. Paste the 16-character password (no spaces) into `.env`.

For other email providers, set `IMAP_HOST` and `IMAP_PORT` too — defaults
are `imap.gmail.com` / `993`.

## Managing rules in the browser

A "rule" is one line of logic: **"if an email contains any of these
phrases, do these things."**

### Add a rule

1. Click **+ New rule**.
2. **Status code** — any short identifier (e.g. `01`, `urgent`,
   `invoice`). It's how this rule shows up in logs and as a Gmail
   label (`openclaw/status/<code>`).
3. **Description** — a one-sentence note for your future self.
4. **Phrases** — one per line. Matching is case-insensitive and
   substring (so `"urgent"` matches `"This is URGENT please respond"`).
5. **Match mode** — usually leave on "Any of these phrases".
6. **Look in fields** — Subject + Body is the safe default. Tick
   "From" if you want to match on the sender (e.g. anything from a
   specific domain).
7. **What to do** — one action per line, in the order they should
   run. The available actions are listed under the box.
8. **Enabled** — uncheck to keep the rule in the list but stop it
   from running, e.g. while testing.
9. **Save.**

### What the actions mean

| Action | What it does |
|---|---|
| `mark` | Adds the Gmail label `openclaw/status/<code>` to the email. |
| `archive` | Removes the email from the Inbox (Gmail-style — it stays in All Mail). |
| `log` | Writes a structured "rule matched" line to the Activity feed. |
| `trigger:<name>` | Runs a custom side-effect (notification, ticket, webhook, etc.). The names of available triggers are listed under the actions box. Adding new triggers requires a developer (one small file). |

The default action set, if you leave the box blank, is
`mark`, `archive`, `log`.

### Edit / delete a rule

Use the **Edit** and **Delete** buttons next to each rule. Edits and
deletes save immediately and take effect on the very next poll.

### Test a phrase before going live

Use the **Test a phrase** card. Paste a sample subject and/or body,
press Test. The page shows which rules would match and what they
would do — without actually sending or storing anything.

This is the safest way to confirm a new rule before letting the
monitor act on real mail.

## Knowing it's working

The header shows a green dot when the monitor is running, plus the
time of the last poll and how many emails have been processed since
startup.

The **Recent activity** card shows the last 80 things the system did,
auto-refreshing every 5 seconds. You'll see lines like:

```
14:02:11 [01] marked status 01    {"matchedPhrases":["URGENT"]}
14:02:11 [01] archived email
14:02:11 [01] rule matched (status 01)    {"from":"…","subject":"…"}
```

If something fails, those same lines turn red.

To force a poll right now (don't wait for the next minute), press
**Check now** in the header.

## Verifying in Gmail

After a rule fires on a real email:

- Open Gmail.
- The email is **not** in the INBOX anymore.
- Open **All Mail** — the email is there with a label like
  `openclaw/status/01` (look in the left sidebar under Labels).
- Click the label to see every email this rule has acted on.

## Day-to-day playbook

| I want to … | Do this |
|---|---|
| Add a rule for a new keyword | Browser → **+ New rule** |
| Stop a rule temporarily | Browser → Edit rule → uncheck **Enabled** → Save |
| Permanently remove a rule | Browser → Delete |
| See what would have matched a sample email | Browser → **Test a phrase** card |
| Force a poll right now | Browser → **Check now** in header |
| See the last 80 events | Browser → **Recent activity** card |
| Pause the whole system | Press `Ctrl-C` in the terminal |
| Restart after a crash | `npm run serve` |
| Re-process the entire current inbox | `npm run monitor:reset` then restart |

## Troubleshooting

**"server unreachable" in the page header**
The server stopped. Restart with `npm run serve`.

**The monitor dot is grey, not green**
You started with `--no-monitor`, or `IMAP_USER` / `IMAP_PASSWORD`
aren't set. Check `.env` and restart.

**A rule won't save — "trigger ... is not registered"**
You typed `trigger:something` but no trigger by that name exists.
The list of available triggers is shown under the actions box.
Either pick one of those, or ask a developer to add a new trigger
file in `src/handlers/triggers.ts`.

**Rule saved but not matching a real email**
Use the **Test a phrase** card with the actual subject + body of the
email to confirm the phrase is really in there. Common gotchas:
hidden Unicode characters in the subject, the phrase only appearing in
the HTML body part, or the email arriving before the rule was saved
(use **Check now** to re-poll).

**Two rules matched the same email**
That's allowed — both fire, in the order they appear in the rules list.
If you don't want that, narrow one rule's phrases to be more specific.

## Asking for help

If something the system can't do today comes up — a new kind of
side-effect, a new email account, a new dashboard view — tell the
person who installed this for you. The whole project is one folder;
they can see exactly what's there.

## Glossary

- **Rule** — one "if these phrases, then these actions" mapping.
- **Status code** — the short label that names a rule (`01`, `urgent`, etc.).
- **Action** — one of `mark`, `archive`, `log`, or `trigger:<name>`.
- **Trigger** — a named custom side-effect a developer has wired up.
- **Monitor** — the background loop that polls the inbox.
- **Tick** — one polling pass.
