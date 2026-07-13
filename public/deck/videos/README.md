# Deck section videos

Drop one full-bleed screen recording per section into this folder. Each video
fills the viewport behind the deck copy and transitions into the next section
with horizontal or vertical overflow.

| File | Section |
|------|---------|
| `homepage.mp4` | Homepage |
| `pwa.mp4` | PWA alerts & notices |
| `scheduling.mp4` | Scheduling |
| `voice.mp4` | Voice & call routing |
| `clients.mp4` | Clients |
| `inbox.mp4` | Inbox |
| `work.mp4` | Work |
| `documents.mp4` | Documents |
| `knowledge.mp4` | Knowledge |
| `monitoring.mp4` | Monitoring |
| `billing.mp4` | Billing |

## Recording tips

- Export as `.mp4` (H.264) or `.webm` — keep files tight (aim for under ~5 MB each).
- Full-bleed UI capture works best; the deck scrim keeps copy readable on the left.
- Prefer short loops (about 4–12 seconds).
- Until a file is present, an animated placeholder appears for that section.

Paths default to `/deck/videos/{sectionId}.mp4` in
[`src/deck/scripts/everything.json`](../../src/deck/scripts/everything.json).
Override per section with `"video": "/deck/videos/custom.mp4"` if needed.
