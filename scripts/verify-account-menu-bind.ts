/**
 * Account drawer must bind on special admin pages that reuse footer nav
 * without the map SPA (e.g. /admin/sales-sheet).
 * Run: npm run check:account-menu
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const header = readFileSync('src/components/Header.astro', 'utf8');
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
assert.match(index, /data-admin-spa/);
assert.match(sales, /showFooterNav/);
assert.equal(/id=["']wrap["']/.test(sales), false);

console.log('account menu bind contract ok');
