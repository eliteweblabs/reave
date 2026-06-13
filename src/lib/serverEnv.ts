/**
 * Read a runtime env var on the Node SSR server.
 *
 * Astro/Vite inlines `import.meta.env.X` at build time, so platform variables
 * that are only present at runtime (e.g. Railway service variables) come back
 * empty. The Node adapter exposes them via `process.env` at runtime, so prefer
 * that and fall back to `import.meta.env` for local/dev `.env` values.
 */
export function serverEnv(name: string): string | undefined {
  const fromProcess =
    typeof process !== 'undefined' && process.env ? process.env[name] : undefined;
  if (fromProcess != null && fromProcess !== '') return fromProcess;
  const meta = import.meta.env as unknown as Record<string, unknown>;
  const v = meta?.[name];
  return typeof v === 'string' && v !== '' ? v : undefined;
}
