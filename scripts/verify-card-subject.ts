import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const cardPage = readFileSync('src/pages/card.astro', 'utf8');
const vcf = readFileSync('src/pages/contact.vcf.ts', 'utf8');
const lib = readFileSync('src/lib/cardSubject.ts', 'utf8');
const teamApi = readFileSync('src/pages/api/admin/team/index.ts', 'utf8');
const loader = readFileSync('public/admin/os-map-loader.js', 'utf8');

assert.match(cardPage, /resolveCardSubject/);
assert.match(cardPage, /showSmsButton/);
assert.match(readFileSync('src/lib/cardPhoneAuth.ts', 'utf8'), /resolveCardPhone/);
assert.match(cardPage, /parseCardUserParam/);
assert.match(cardPage, /vcardHref/);
assert.match(vcf, /resolveCardSubject/);
assert.match(lib, /cardPathForUserId/);
assert.match(teamApi, /cardPath/);
assert.match(loader, /team-card-link/);

console.log('ok — /card ?user= staff cards + Team panel links');
