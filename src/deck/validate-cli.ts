/**
 * Validate deck scripts from the command line.
 * Usage: npx tsx src/deck/validate-cli.ts
 *        node --experimental-strip-types src/deck/validate-cli.ts
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateDeckScript } from './validate.ts';

const here = dirname(fileURLToPath(import.meta.url));
const scriptsDir = join(here, 'scripts');
const files = ['everything.json'];

let failed = false;

for (const file of files) {
  const path = join(scriptsDir, file);
  const raw = JSON.parse(readFileSync(path, 'utf8')) as unknown;
  const result = validateDeckScript(raw);
  if (result.ok) {
    const beats = result.script.sections.reduce(
      (n, s) => n + s.features.length,
      0,
    );
    console.log(
      `✓ ${file} — ${result.script.sections.length} sections, ${beats} features`,
    );
  } else {
    failed = true;
    console.error(`✗ ${file}`);
    for (const err of result.errors) console.error(`  - ${err}`);
  }
}

if (failed) process.exit(1);
