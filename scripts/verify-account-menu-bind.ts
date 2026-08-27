/**
 * Account drawer must bind on special admin pages that reuse footer nav
 * without the map SPA (e.g. /admin/sales-sheet), and share OverlayMenu
 * chrome. Account close is the profile icon (becomes X in place).
 * Run: npm run check:account-menu
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const header = readFileSync('src/components/Header.astro', 'utf8');
const marketing = readFileSync('src/components/MarketingMenu.astro', 'utf8');
const overlay = readFileSync('src/components/OverlayMenu.astro', 'utf8');
const overlayCss = readFileSync('src/styles/overlay-menu.css', 'utf8');
const overlayDom = readFileSync('src/lib/overlayMenuDom.ts', 'utf8');
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
assert.equal(
  header.includes('mode="dismiss"'),
  false,
  'Account close must replace the profile icon — do not add a second X that shifts the header',
);
assert.match(header, /topbar-profile-close/);
assert.match(header, /IOS_ICONS\.x/);
assert.match(header, /mode="nav"/);
assert.match(header, /brand-btn brand-btn-glass overlay-menu-action overlay-menu-action--danger/);
assert.match(header, /app-header-website-entry/);
assert.match(header, /account-menu-website-item/);
assert.match(
  header,
  /@media \(max-width: 639px\)[\s\S]*\.app-header-website-entry[\s\S]*display: none/,
  'Header Website pill must hide on mobile so the account drawer owns that CTA',
);
assert.match(
  header,
  /@media \(max-width: 639px\)[\s\S]*\.account-menu-website-item[\s\S]*display: list-item/,
  'Account drawer must show Website on mobile',
);
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
assert.match(overlayDom, /ACCOUNT_MENU_DOCK_MQ/);
assert.match(overlayDom, /account-menu-docked/);
assert.match(overlayCss, /html\.account-menu-docked/);
assert.match(overlayCss, /--account-col-w/);
assert.match(
  overlayCss,
  /html\.account-menu-docked \[data-account-menu\] \.overlay-menu-panel \{[\s\S]*position: relative/,
  'Docked account panel must sit in the column, not position:absolute over the page',
);
assert.match(overlayCss, /--account-col-duration/);
assert.match(overlayDom, /account-menu-opening/);
assert.match(overlayDom, /account-menu-closing/);
assert.match(toggle, /IOS_ICONS\.x/);
assert.match(toggle, /data-overlay-menu-toggle/);
assert.match(toggle, /hidden=\{mode === "dismiss"/);
assert.match(index, /data-admin-spa/);
assert.match(sales, /showFooterNav/);
assert.equal(/id=["']wrap["']/.test(sales), false);

console.log('account menu bind contract ok');
