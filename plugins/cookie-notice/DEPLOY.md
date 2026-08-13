---
feature: cookie_notice
defaultStatus: deployed
stage: 1
---

# Cookie notice deployment

## Sibling services

- None

## Required env vars

- None

## External setup

- Enable `cookie_notice` in install config `features[]`
- Add `/cookies` to the install’s site-content `pages` list if it is not already there

## Checklist

- [ ] Add `cookie_notice` to install `features[]`
- [ ] Confirm `/cookies` loads (Cookie Policy)
- [ ] Confirm the public site shows: “You agree to our cookie policy by continuing on this website.”
- [ ] Dismiss with X — notice stays gone after reload
- [ ] Reload, then scroll — notice stays gone after reload
- [ ] Footer includes a Cookies link
