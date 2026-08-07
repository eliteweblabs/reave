# Pexels stock photos

Royalty-free photo search for marketing pages, decks, and newsletters via the
`search_stock_photos` agent tool and `GET /api/pexels/search`.

## Requirements

1. `stock_photos` in install config `features[]`
2. `PEXELS_API_KEY` on the Reave App service (never `PUBLIC_`)

## Agent tool

| Tool | Use when |
|------|----------|
| `search_stock_photos` | Need imagery for a page, deck, proposal, or newsletter |

Parameters: `query` (required), optional `per_page` (1–80), `page`, `orientation`
(`landscape` | `portrait` | `square`).

## Attribution (required)

Pexels API terms require:

- Link each photo to its Pexels page (`photo.url`)
- Credit the photographer (name + profile link when shown)

See https://www.pexels.com/api/documentation/#guidelines

## API

`GET /api/pexels/search?q=…&page=1&per_page=10&orientation=landscape` — auth-gated
server proxy; keeps the API key off the browser.
