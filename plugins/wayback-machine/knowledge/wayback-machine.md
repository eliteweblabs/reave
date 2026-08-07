# Wayback Machine (Internet Archive)

Query historical snapshots of public websites via the Internet Archive Wayback Machine. No API key or env vars — read-only public APIs.

## Enable

1. Add `wayback_machine` to install config `features[]`.
2. No credentials required.

## What it is (and is not)

- **Is:** A time machine for public web pages — browse when a site was captured, open archived HTML, compare eras.
- **Is not:** Live change monitoring. For ongoing diffs use **site_monitoring** (ChangeDetection.io) or **uptime_monitoring**.

## Agent tools

| Tool | Use when |
|------|----------|
| `wayback_list_snapshots` | "When was this site archived?" · list captures in a year/month |
| `wayback_snapshot_at` | "What did [url] look like in February 2018?" · get closest capture + optional page text |

### Timestamp format

Pass compact digits — the agent should normalize natural language:

| User says | Pass as |
|-----------|---------|
| 2018 | `2018` |
| February 2018 | `201802` |
| Feb 15, 2018 | `20180215` |

### Example flows

**Historical site review**

1. `wayback_snapshot_at` with `fetch_content=true`, `timestamp=201802`
2. Summarize headline, nav, offers, branding vs today (`fetch_url` on live site if needed)

**Before/after rebrand**

1. `wayback_snapshot_at` for old date with `fetch_content=true`
2. Second call for newer date
3. Compare copy, layout, CTAs in the reply; link both `viewUrl`s

**No captures**

If `available: false`, run `wayback_list_snapshots` without a date filter to see whether any history exists.

## Slash command

`/wayback` — "What did [url] look like in [month/year]?"

## APIs used (public)

- Availability: `https://archive.org/wayback/available`
- CDX index: `https://web.archive.org/cdx/search/cdx`

Implementation: `src/lib/waybackClient.ts`
