#!/usr/bin/env node
/** Build lib/violations/data/us-places.json from GeoNames cities5000 (US places, pop ≥ 5000). */
import { execSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outPath = join(root, 'lib/violations/data/us-places.json');
mkdirSync(dirname(outPath), { recursive: true });

const byKey = new Map();

function add(name, state, lat, lng, pop) {
  const n = name.trim();
  const s = state.trim().toUpperCase();
  if (!n || !s || !Number.isFinite(lat) || !Number.isFinite(lng)) return;
  const p = Math.max(0, Number(pop) || 0);
  const key = `${n.toLowerCase()},${s}`;
  const prev = byKey.get(key);
  if (!prev || p > prev.p) byKey.set(key, { n, s, lat: +lat, lng: +lng, p });
}

execSync('curl -sf "https://download.geonames.org/export/dump/cities5000.zip" -o /tmp/cities5000.zip');
const citiesRaw = execSync('unzip -p /tmp/cities5000.zip', { maxBuffer: 25 * 1024 * 1024 }).toString();
for (const line of citiesRaw.split('\n')) {
  if (!line) continue;
  const c = line.split('\t');
  if (c[8] !== 'US') continue;
  add(c[1], c[10], +c[4], +c[5], +c[14]);
}

const places = [...byKey.values()].sort((a, b) => b.p - a.p);
writeFileSync(outPath, JSON.stringify(places));
console.log(`Wrote ${places.length} places → ${outPath}`);
