/**
 * Standing internet-presence copy for audit one-pagers.
 * Always on — not a scored finding — so clients see that reviews and
 * anything else the web says about the business are in scope.
 */

export const AUDIT_INTERNET_PRESENCE_KICKER = 'Internet presence';

export const AUDIT_INTERNET_PRESENCE_STATEMENT =
  'We look at everything that turns up about this business online — listings, articles, forums, and especially reviews that are not endearing. When something negative shows up, we help take it down if the platform allows, or write a public response so a bad note is not the last word customers see.';

function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Compact band for the sales one-pager, between findings and the brand strip. */
export function renderInternetPresenceHtml(
  statement = AUDIT_INTERNET_PRESENCE_STATEMENT,
  kicker = AUDIT_INTERNET_PRESENCE_KICKER,
): string {
  if (!statement.trim()) return '';
  return `<div class="doc-presence" role="note"><p class="doc-presence-kicker">${escHtml(kicker)}</p><p class="doc-presence-copy">${escHtml(statement)}</p></div>`;
}

export const DOCUMENT_INTERNET_PRESENCE_CSS = `
.doc-presence {
  display: flex;
  flex-direction: column;
  gap: 0.28em;
}
.doc-presence-kicker {
  margin: 0;
  font-size: 0.85em;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--doc-ink, #141414);
}
.doc-presence-copy {
  margin: 0;
  line-height: 1.4;
  color: #2a2a2a;
}
`.trim();
