/**
 * Shared client helpers for /c/ portal pages.
 * Import as ES module: import { escHtml } from '/portal-shared.js';
 */

/** Escape text for safe interpolation into HTML (matches src/lib/escHtml.ts). */
export function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
