import { dirname, join } from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';

/** Walk up from a module URL until package.json is found (repo root). */
export function projectRoot(fromUrl = import.meta.url): string {
  let dir = dirname(fileURLToPath(fromUrl));
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, 'package.json'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}
