/**
 * Guard: Massachusetts bankruptcy document pack is gated by industry / region.
 * Run: node --import ./scripts/ts-extensionless-resolve.mjs --experimental-strip-types scripts/verify-document-packs.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { documentMatchesInstall, parseDocumentPackMeta } from '../src/lib/documentPacks.ts';

const here = dirname(fileURLToPath(import.meta.url));
const engagement = readFileSync(join(here, '../src/documents/law/ma/ma-bk-engagement.md'), 'utf8');
const nda = readFileSync(join(here, '../src/documents/nda.md'), 'utf8');
const contract = readFileSync(join(here, '../src/documents/contract.md'), 'utf8');

const bk = parseDocumentPackMeta(engagement);
assert.equal(bk.industry, 'law');
assert.deepEqual(bk.states, ['MA']);
assert.ok(bk.departments.includes('bankruptcy'));

const lawMaBk = { industry: 'law', states: ['MA'], departments: ['bankruptcy'] };
assert.equal(documentMatchesInstall(bk, lawMaBk), true);
assert.equal(documentMatchesInstall(bk, { industry: 'law', counties: ['Essex'], departments: ['bankruptcy'] }), true);
assert.equal(documentMatchesInstall(bk, { industry: 'law', counties: ['Essex, MA'], departments: ['bankruptcy'] }), true);
assert.equal(documentMatchesInstall(bk, { industry: 'law', counties: ['Essex, VT'], departments: ['bankruptcy'] }), false);
assert.equal(documentMatchesInstall(bk, { industry: 'law', departments: ['bankruptcy'] }), true);
assert.equal(documentMatchesInstall(bk, { industry: 'law', states: ['NH'], departments: ['bankruptcy'] }), false);
assert.equal(documentMatchesInstall(bk, { industry: 'law', states: ['MA'], departments: ['tax'] }), false);
assert.equal(documentMatchesInstall(bk, { industry: 'plumbing', states: ['MA'], departments: ['bankruptcy'] }), false);

const agency = parseDocumentPackMeta(nda);
assert.equal(agency.industry, 'agency');
assert.equal(documentMatchesInstall(agency, lawMaBk), false);
assert.equal(documentMatchesInstall(agency, { industry: null }), true);
assert.equal(documentMatchesInstall(parseDocumentPackMeta(contract), lawMaBk), false);

const untitled = parseDocumentPackMeta('# Custom letter\n\nHello.');
assert.equal(untitled.industry, undefined);
assert.equal(documentMatchesInstall(untitled, lawMaBk), true);

console.log('verify-document-packs: ok');
