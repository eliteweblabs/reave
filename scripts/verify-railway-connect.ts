#!/usr/bin/env node
/** Guard: serviceConnect must use ServiceConnectInput (Railway schema), not ServiceSourceInput. */
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const client = readFileSync('src/lib/railwayClient.ts', 'utf8');
assert.match(client, /ServiceConnectInput/, 'railwayConnectServiceSource must use ServiceConnectInput');
assert.doesNotMatch(
  client,
  /serviceConnect\(\$id: String!, \$input: ServiceSourceInput!/,
  'serviceConnect must not reference deprecated ServiceSourceInput',
);

const barber = readFileSync('scripts/provision-barber.js', 'utf8');
assert.match(barber, /ServiceConnectInput/);

console.log('verify-railway-connect: ok');
