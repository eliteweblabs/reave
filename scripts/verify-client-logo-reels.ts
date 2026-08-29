/**
 * Visible client-logo wall must never show the same mark twice.
 * Run: npm run check:client-logo-reels
 */
import assert from 'node:assert/strict';
import {
  clientLogoReelsAreDisjoint,
  dealClientLogoReels,
} from '../src/lib/clientLogoReels.ts';

const NAMES = [
  'Porsche',
  'The New York Times',
  'Red Bull',
  'Chase Bank',
  'Acura',
  'Bombay Sapphire',
  'Live Nation',
  'Johnnie Walker',
  'Worcester Polytechnic Institute',
  'Kingdom Trails',
  'UC Law San Francisco',
  'Mohegan Sun',
  'Sharpie',
  'The Overlook',
  'Coinbase',
];

const logos = NAMES.map((name) => ({ name }));
const reels = dealClientLogoReels(logos);

assert.equal(reels.length, 8);
assert.equal(reels.flat().length, NAMES.length);
assert.ok(clientLogoReelsAreDisjoint(reels));
assert.deepEqual(
  [...reels.flat().map((logo) => logo.name)].sort(),
  [...NAMES].sort(),
);
assert.ok(reels.filter((reel) => reel.length === 2).length === 7);
assert.ok(reels.filter((reel) => reel.length === 1).length === 1);

const short = dealClientLogoReels(logos.slice(0, 6));
assert.equal(short.length, 6);
assert.ok(short.every((reel) => reel.length === 1));
assert.ok(clientLogoReelsAreDisjoint(short));

console.log('client logo reel uniqueness checks passed');
