/**
 * Guard: Mapbox office pin + radius/county gate matches expected MA venues.
 * Run: node --import ./scripts/ts-extensionless-resolve.mjs --experimental-strip-types scripts/verify-court-radius.ts
 */
import assert from 'node:assert/strict';
import { COURT_DIRECTORY } from '../src/lib/courtDirectory.ts';
import { filterCourts, milesBetween } from '../src/lib/courtRadius.ts';
import { normalizePracticeGate } from '../src/lib/practiceGate.ts';

const beverly = { lat: 42.558, lng: -70.88 };
const boston = COURT_DIRECTORY.find((row) => row.id === 'mab-boston');
const worcester = COURT_DIRECTORY.find((row) => row.id === 'mab-worcester');
const springfield = COURT_DIRECTORY.find((row) => row.id === 'mab-springfield');
assert.ok(boston && worcester && springfield);

const toBoston = milesBetween(beverly, boston);
const toWorcester = milesBetween(beverly, worcester);
const toSpringfield = milesBetween(beverly, springfield);
assert.ok(toBoston > 15 && toBoston < 30, `Beverly→Boston should be ~20 mi, got ${toBoston}`);
assert.ok(toWorcester > 45 && toWorcester < 70, `Beverly→Worcester should be ~55 mi, got ${toWorcester}`);
assert.ok(toSpringfield > 85 && toSpringfield < 110, `Beverly→Springfield should be ~95 mi, got ${toSpringfield}`);

const radius60 = filterCourts(beverly, normalizePracticeGate({ radiusMi: 60, gateMode: 'radius' }));
assert.ok(radius60.some((row) => row.id === 'mab-boston'));
assert.ok(radius60.some((row) => row.id === 'mab-worcester'));
assert.ok(!radius60.some((row) => row.id === 'mab-springfield'));

const essexOnly = filterCourts(beverly, normalizePracticeGate({ gateMode: 'counties', counties: ['Essex'] }));
assert.ok(essexOnly.every((row) => row.counties.includes('Essex')));
assert.ok(essexOnly.some((row) => row.id === 'mab-boston'));

const maState = filterCourts(beverly, normalizePracticeGate({ gateMode: 'state', states: ['MA'] }));
assert.ok(maState.some((row) => row.id === 'mab-springfield'));
assert.ok(maState.every((row) => row.state === 'MA' && row.reason === 'state'));

const multiDept = normalizePracticeGate({ practiceAreas: ['tax', 'foreclosure'] });
assert.deepEqual(multiDept.practiceAreas, ['tax', 'foreclosure']);
assert.equal(multiDept.practiceArea, 'tax');
const fromCsv = normalizePracticeGate({ practiceArea: 'tax,general' });
assert.deepEqual(fromCsv.practiceAreas, ['tax', 'general']);

console.log('verify-court-radius: ok');
