#!/usr/bin/env node
/**
 * Remove extracted work-panel ranges from os-map-loader.js (reverse order).
 */
import fs from 'node:fs';

const SRC = '/workspace/public/admin/os-map-loader.js';
const lines = fs.readFileSync(SRC, 'utf8').split('\n');

const ranges = [
  [20162, 20193],
  [20094, 20109],
  [19056, 19479],
  [18900, 19024],
  [17363, 17376],
  [10942, 13417],
];

let out = [...lines];
for (const [start, end] of ranges) {
  out.splice(start - 1, end - start + 1);
}

fs.writeFileSync(SRC, out.join('\n'));
console.log('Removed', lines.length - out.length, 'lines. New length:', out.length);
