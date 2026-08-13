# Cookie notice

Public-site implied-consent bar. No env vars, no agent tools.

## Enable

Add `cookie_notice` to install config `features[]`. Add `/cookies` to site-content `pages` if missing.

## What visitors see

A dismissible notice:

> You agree to our cookie policy by continuing on this website.

“cookie policy” links to `/cookies`. Closing with **X** or **scrolling** records agreement in `localStorage` (`reave_cookie_ok`) and hides the bar.

## What it covers

Notice + continued use of the site, pointing at the Cookie Policy. Essential cookies (sign-in, security, demo suite) and cookieless analytics do not need a separate opt-in. Do not add advertising or tracking cookies without replacing this bar with prior opt-in consent.
