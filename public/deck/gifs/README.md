# Deck screen recordings

Drop one animated GIF per section. The deck maps each GIF into a device frame
(phone in hand, phone on desk, or laptop) — no finger overlays.

| File | Device situation | Section |
|------|------------------|---------|
| `homepage.gif` | phone-hand | Homepage |
| `pwa.gif` | phone-desk | PWA alerts |
| `scheduling.gif` | phone-hand | Scheduling |
| `voice.gif` | phone-hand | Voice |
| `clients.gif` | laptop | Clients |
| `inbox.gif` | laptop | Inbox |
| `work.gif` | laptop | Work |
| `documents.gif` | laptop | Documents |
| `knowledge.gif` | laptop | Knowledge |
| `monitoring.gif` | laptop | Monitoring |
| `billing.gif` | laptop | Billing |

Tips:

- Record the screen only (portrait for phone sections, landscape for laptop).
- Keep loops short (4–12s) and under ~5–8 MB when possible.
- Until a file exists, the stage shows a labeled placeholder in the device.
- Paths are set in `src/deck/scripts/everything.json` (`stage.set` → `gif` + `device`).
