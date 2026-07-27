/**
 * Lets `node --experimental-strip-types` run scripts that import project files
 * with TypeScript's extensionless specifiers (`./serverEnv`), which Node's ESM
 * resolver rejects. Register with:
 *   node --import ./scripts/ts-extensionless-resolve.mjs --experimental-strip-types <script>
 */
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

register(
  new URL(
    'data:text/javascript,' +
      encodeURIComponent(`
        import { existsSync } from 'node:fs';
        import { fileURLToPath } from 'node:url';
        export async function resolve(specifier, context, nextResolve) {
          try {
            return await nextResolve(specifier, context);
          } catch (err) {
            if (!specifier.startsWith('.') && !specifier.startsWith('/')) throw err;
            for (const suffix of ['.ts', '/index.ts', '.tsx']) {
              const candidate = new URL(specifier + suffix, context.parentURL);
              if (existsSync(fileURLToPath(candidate))) {
                return nextResolve(specifier + suffix, context);
              }
            }
            throw err;
          }
        }
      `),
  ),
  pathToFileURL('./'),
);
