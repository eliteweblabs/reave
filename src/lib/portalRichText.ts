import { escapeHtml } from './htmlEscape';
import { safeLinkHrefAttr } from './safeLinkUrl';

/** Escape and auto-link http(s) URLs in plain text for portal display. */
export function richText(s: string): string {
  const escaped = escapeHtml(s);
  const linked = escaped.replace(/(https?:\/\/[^\s<]+)/g, (url) => {
    const clean = url.replace(/[.,)]+$/, '');
    const trail = url.slice(clean.length);
    const href = safeLinkHrefAttr(clean);
    if (!href) return url;
    return `<a href="${href}" target="_blank" rel="noopener noreferrer">${clean}</a>${trail}`;
  });
  return linked.replace(/\n/g, '<br />');
}

export function workFileUrlForPortal(url: string, contactUid: string, jobSlug: string): string {
  const m = url.match(/\/api\/work\/([^/]+)\/files\/([^/?#]+)/);
  if (!m || m[1] !== jobSlug) return url;
  return `/api/c/${encodeURIComponent(contactUid)}/work/${encodeURIComponent(jobSlug)}/files/${encodeURIComponent(m[2])}`;
}

/** Render project body markdown-ish text with images and auto-linked URLs. */
export function workBodyHtml(body: string, contactUid: string, jobSlug: string): string {
  const lines = body.split('\n');
  const out: string[] = [];
  const imgRe = /^!\[([^\]]*)\]\(([^)]+)\)\s*$/;
  for (const line of lines) {
    const trimmed = line.trim();
    const m = trimmed.match(imgRe);
    if (m) {
      const src = workFileUrlForPortal(m[2], contactUid, jobSlug);
      out.push(
        `<img class="work-body-img" src="${escapeHtml(src)}" alt="${escapeHtml(m[1])}" loading="lazy" />`,
      );
    } else if (trimmed) {
      out.push(richText(trimmed));
    } else {
      out.push('');
    }
  }
  return out.join('<br />');
}
