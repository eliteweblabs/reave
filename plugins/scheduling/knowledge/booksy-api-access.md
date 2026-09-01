# Booksy API access

Booksy does **not** give shop owners a self-serve API key. The Booksy Public API is partner-only. Docs at `https://docs.booksy.com/` return HTTP 401 to anonymous visitors.

Client-facing walkthrough to send the shop owner: `docs/booksy-api-client-walkthrough.md`.

## What Booksy issues (if they approve)

- Partner UUID
- Partner name
- RSA private key per environment (sandbox and production)
- Optional HTTP Basic credentials for the docs host
- Business / venue ID

Auth model: the partner signs a short-lived RS256 JWT assertion and POSTs it to `{base}/token/` with `partner_name`. That returns a ~5-minute access token and a ~3-day refresh token. Requests use `Authorization: Bearer` and `Accept: application/json; version=0.3`. US base URL is `https://us.booksy.com/public-api/us/`.

## What to ask the client for

Never ask for their Booksy Biz **password**.

**Today**

- Public profile URL (Booksy Biz → Profile → Share)
- Business name as shown in Booksy
- Country
- Owner email on the account

**When Booksy replies**

- The full Support email or chat transcript
- Partner UUID, partner name, RSA keys, docs login, business ID, webhook notes

## How the owner requests access

1. Sign in as the **owner** at [biz.booksy.com](https://biz.booksy.com/) or in the Booksy Biz app.
2. Open Support chat:
   - Web/tablet: question-mark icon → Support
   - Mobile: Profile → Settings → Help Center → Help Chat
3. Paste the request in the walkthrough. Official contact article: [How do I contact support?](https://support.booksy.com/hc/en-us/articles/16540029346962-How-do-I-contact-support)
4. US email fallback: `info.us@booksy.com`. Other regions: [biz.booksy.com/contact](https://biz.booksy.com/contact)

## If Booksy declines

Use the public booking URL only. Do not scrape Booksy, reuse the owner password, or invent unofficial API access.
