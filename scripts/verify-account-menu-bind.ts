/**
 * Account drawer must bind on special admin pages that reuse footer nav
 * without the map SPA (e.g. /admin/sales-sheet), and share OverlayMenu
 * chrome (including the close X) with the marketing hamburger.
 * Run: npm run check:account-menu
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const header = readFileSync('src/components/Header.astro', 'utf8');
const marketing = readFileSync('src/components/MarketingMenu.astro', 'utf8');
const overlay = readFileSync('src/components/OverlayMenu.astro', 'utf8');
const overlayCss = readFileSync('src/styles/overlay-menu.css', 'utf8');
const toggle = readFileSync('src/components/OverlayMenuToggle.astro', 'utf8');
const index = readFileSync('src/pages/admin/index.astro', 'utf8');
const sales = readFileSync('src/pages/admin/sales-sheet.astro', 'utf8');

assert.equal(
  header.includes('if (document.getElementById("admin-footer-nav")) return;'),
  false,
  'Header must not treat footer nav as the map SPA — sales-sheet has the pill without os-map-loader',
);
assert.match(header, /dataset\.adminSpa/);
assert.match(header, /getElementById\("wrap"\)/);
assert.match(header, /headerCloseBound/);
assert.match(header, /import OverlayMenu /);
assert.match(header, /import OverlayMenuToggle/);
assert.match(header, /mode="dismiss"/);
assert.match(header, /mode="nav"/);
assert.match(header, /brand-btn brand-btn-glass overlay-menu-action overlay-menu-action--danger/);
assert.match(marketing, /brand-btn brand-btn-glass overlay-menu-action/);
assert.equal(
  overlayCss.includes('border-radius: 10px'),
  false,
  'Overlay actions must use pill/circle styles — no 10px rounded squares',
);
assert.match(marketing, /import OverlayMenu /);
assert.match(overlay, /data-overlay-menu/);
assert.match(overlay, /overlay-menu-backdrop/);
assert.match(overlay, /overlay-menu-panel/);
assert.match(overlay, /slot name="footer"/);
assert.match(toggle, /IOS_ICONS\.x/);
assert.match(toggle, /data-overlay-menu-toggle/);
assert.match(toggle, /hidden=\{mode === "dismiss"/);
assert.match(index, /data-admin-spa/);
assert.match(sales, /showFooterNav/);
assert.equal(/id=["']wrap["']/.test(sales), false);

console.log('account menu bind contract ok');
