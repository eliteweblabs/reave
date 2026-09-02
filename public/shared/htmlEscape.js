/**
 * HTML escape — keep in sync with src/lib/htmlEscape.ts and public/admin/shared.js escHtml.
 */
export function escHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
