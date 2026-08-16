/**
 * Print-sheet client mark (uploaded / scraped / missing).
 * Kept free of contact-api imports so sales-sheet checks can load it in Node.
 */
export type ClientLogoSource = 'upload' | 'website' | 'missing';

export type ClientLogoMark = {
  src: string;
  source: ClientLogoSource;
  note: string;
};

export const CLIENT_LOGO_MISSING_NOTE = 'No logo on the website';
export const CLIENT_LOGO_SCRAPED_NOTE = 'From the website';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function clientLogoStatusLabel(mark: ClientLogoMark): string {
  if (mark.source === 'upload') return 'Uploaded';
  if (mark.source === 'website') return CLIENT_LOGO_SCRAPED_NOTE;
  return CLIENT_LOGO_MISSING_NOTE;
}

export function renderClientLogoMarkHtml(mark: ClientLogoMark, name = 'Client'): string {
  const label = (name || 'Client').trim() || 'Client';
  if (mark.src) {
    const note = mark.note
      ? `<span class="doc-client-mark-note">${esc(mark.note)}</span>`
      : '';
    return `<div class="doc-client-mark" data-source="${esc(mark.source)}"><img class="doc-client-mark-img" src="${esc(mark.src)}" alt="${esc(label)}" />${note}</div>`;
  }
  return `<div class="doc-client-mark doc-client-mark--missing" role="img" aria-label="${esc(CLIENT_LOGO_MISSING_NOTE)}"><span class="doc-client-mark-x" aria-hidden="true"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></span><span class="doc-client-mark-note">${esc(CLIENT_LOGO_MISSING_NOTE)}</span></div>`;
}

export const DOCUMENT_CLIENT_MARK_CSS = `
.doc-onepager-client {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  max-width: 26%;
}
.doc-client-mark {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.2em;
  min-width: 0;
  text-align: center;
}
.doc-client-mark-img {
  display: block;
  height: clamp(26px, 7.2cqh, 48px);
  width: auto;
  max-width: 140px;
  object-fit: contain;
}
.doc-client-mark-note {
  font-size: clamp(7px, 1.05cqi, 9px);
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--doc-muted, #6b6b6b);
}
.doc-client-mark--missing .doc-client-mark-note {
  color: #c01515;
}
.doc-client-mark-x {
  display: flex;
  align-items: center;
  justify-content: center;
  width: clamp(26px, 6.5cqh, 40px);
  height: clamp(26px, 6.5cqh, 40px);
  border: 2px solid #c01515;
  color: #c01515;
  background: #fff5f5;
}
`.trim();
