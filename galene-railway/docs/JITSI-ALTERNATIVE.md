# Jitsi Meet on Railway (alternative)

This repository ships **Galene** because it matches Railway’s constraints with one container and one extra TCP proxy.

## Why Jitsi is not bundled here

Jitsi Meet typically needs:

| Component | Role | Railway friction |
|-----------|------|------------------|
| `web` | UI + nginx | OK (HTTP) |
| `prosody` | XMPP | Internal network + secrets |
| `jicofo` | Conference focus | Depends on Prosody |
| `jvb` | Video bridge | **Inbound UDP** for media |
| TURN (`coturn`) | NAT traversal | UDP/TCP ports |

Railway **does not expose inbound UDP**. Jitsi’s video bridge (`jvb`) expects UDP port ranges (default 10000–20000). Running Jitsi in TCP-only mode is possible but requires custom `jvb` flags, TURN everywhere, and a **multi-service** `railway.toml` with private networking — far beyond “click Deploy.”

## If you still want Jitsi

1. Use a **VPS or bare metal** with [docker-jitsi-meet](https://github.com/jitsi/docker-jitsi-meet) (upstream’s supported path).
2. Or split stack: Jitsi on a UDP-capable host, only static assets on Railway (not recommended).
3. For Railway-native WebRTC with more features than Galene, consider [LiveKit’s Railway template](https://railway.com/deploy/livekit) (TCP-only mode + manual TCP proxy).

## Multi-service `railway.toml` sketch (advanced)

Not maintained in this repo — for reference only:

```toml
[[services]]
name = "jitsi-web"
source = "docker-jitsi-meet/web"

[[services]]
name = "prosody"
source = "docker-jitsi-meet/prosody"

[[services]]
name = "jicofo"
source = "docker-jitsi-meet/jicofo"

[[services]]
name = "jvb"
source = "docker-jitsi-meet/jvb"
# Still blocked without UDP — needs external JVB or TURN-only relay setup
```

You would still need shared `.env` secrets (`JICOFO_AUTH_PASSWORD`, `JVB_AUTH_PASSWORD`, `JIGASI_XMPP_PASSWORD`, …), service discovery URLs, and UDP-capable hosting for production media.

**Recommendation:** use this Galene template on Railway; use docker-jitsi-meet on a VPS if you need full Jitsi.
