---
feature: dscr_calculator
defaultStatus: deployed
stage: 2
---

# DSCR Calculator deployment

## Sibling services

- None

## Required env vars

- None

## External setup

- Enable `dscr_calculator` in install config `features[]`
- Footer tab and dashboard tile inject automatically when the module is on
- Public calculator is at `/dscr`

## Checklist

- [ ] Add `dscr_calculator` to install `features[]`
- [ ] Open dashboard → DSCR Calculator (or `/admin/?tab=dscr`)
- [ ] Run the default California / 800 FICO / $1M / $450k scenario — DSCR should be about 1.19 and pass
- [ ] Confirm `/dscr` loads without an email gate
- [ ] Ask the agent: "What's the DSCR on a $450k loan against a $1M rental at $5,000 rent, $250 insurance, $1,200 taxes?"
- [ ] Set `moduleStatus.dscr_calculator` → `deployed` in install config
