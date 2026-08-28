# DSCR Calculator

Lender-grade Debt Service Coverage Ratio for 1–8 unit residential rentals. Same FICO / LTV rate matrix, cash-out and 5–8 unit add-ons, and beginning-of-period P&I used by the major residential DSCR programs.

## Where it lives

- Admin: dashboard tile **DSCR Calculator**, footer tab, `/admin/?tab=dscr`
- Public: `/dscr` (no sign-up, no email gate)
- Agent: `calculate_dscr`

## Formula

**DSCR = monthly rent ÷ PITIA**

PITIA is Principal + Interest + Taxes + Insurance + HOA.

- **1.00** — most lenders’ floor (rent covers the payment)
- **1.25+** — strong; better rates and terms
- **Under 1.00** — fail unless FICO and LTV allow it, or a **no-ratio** product (typically **25%+ equity**)

## Pricing rules

- Minimum FICO **660** (cash-out under 1.00 DSCR needs **680**; rate-and-term / purchase under 1.00 needs **700**)
- Maximum LTV **80%**
- Under 1.00 DSCR, LTV must be ≤ **75%** (purchase / rate-and-term) or ≤ **70%** (cash-out)
- **5–8 units** add **0.25%** to the rate
- **Cash-out** adds **0.25%** to the rate
- 30-year fixed, monthly P&I, payment at the beginning of the period
- Property state is collected for the file; it does not change the math

## Agent

Call `calculate_dscr` with `fico`, `units` (`1-4` or `5-8`), `purpose` (`Purchase`, `RateAndTerm`, `Cashout`), `propertyValue`, `loanAmount`, `monthlyRent`, `monthlyInsurance`, `monthlyTaxes`, and optional `monthlyHoa` / `state`.

Tell the user the DSCR ratio, whether they passed, LTV, estimated rate, P&I, and PITI. If they failed with 25%+ equity, mention the no-ratio path.
