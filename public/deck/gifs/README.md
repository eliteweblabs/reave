# Deck screen recordings

Drop one animated GIF per section into this folder. The `/deck` page maps each
GIF into a device frame so it reads like someone using the product in context.
Finger movement is not shown — screen recording only.

| File | Device | Section |
|------|--------|---------|
| `homepage.gif` | phone-hand | Homepage |
| `pwa.gif` | phone-desk | PWA alerts & notices |
| `scheduling.gif` | phone-hand | Scheduling |
| `voice.gif` | phone-hand | Voice & call routing |
| `clients.gif` | laptop | Clients |
| `inbox.gif` | laptop | Inbox |
| `work.gif` | laptop | Projects |
| `documents.gif` | laptop | Documents |
| `knowledge.gif` | laptop | Knowledge |
| `monitoring.gif` | laptop | Monitoring |
| `billing.gif` | laptop | Billing |

## Recording tips

- Capture the product UI only (the frame supplies the device chrome).
- Phone sections: portrait. Laptop sections: landscape.
- Prefer short loops (about 4–12 seconds).
- Until a file is present, a placeholder label appears inside the device screen.

Paths are referenced from [`src/deck/scripts/everything.json`](../../src/deck/scripts/everything.json) via `stage.set` → `gif` + `device`.
