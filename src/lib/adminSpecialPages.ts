/**
 * Special admin pages — node canvases and dashboard-grid destinations.
 *
 * They share one chrome template: header back chevron instead of the wordmark.
 * Edit styles in `src/styles/admin/special-page.css`. Standalone routes use
 * `src/layouts/AdminSpecialLayout.astro`. SPA maps use the same class via
 * `isSpecialAdminPage` in `public/admin/os-map-data.js` (keep these key lists
 * in sync).
 */

/** Footer / home tabs keep the wordmark. */
export const ADMIN_PRIMARY_PAGE_KEYS = [
  'dashboard',
  'chats',
  'email',
  'work',
  'schedule',
  'clients',
  'todo',
  'home',
] as const;

/** Account pages keep the wordmark + their own pane back. */
export const ADMIN_SETTINGS_PAGE_KEYS = [
  'profile',
  'company',
  'settings',
  'socials',
  'industries',
  'vapi',
  'lead-scanner',
] as const;

const PRIMARY = new Set<string>(ADMIN_PRIMARY_PAGE_KEYS);
const SETTINGS = new Set<string>(ADMIN_SETTINGS_PAGE_KEYS);

/** True when `?tab=` / `?map=` should render special-page chrome on first paint. */
export function isSpecialAdminPageKey(key: string | null | undefined): boolean {
  const k = (key || '').trim();
  if (!k || k === 'finance') return false;
  if (PRIMARY.has(k) || SETTINGS.has(k)) return false;
  return true;
}
