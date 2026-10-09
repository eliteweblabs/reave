import { readFileSync } from 'node:fs';

export function fail(msg) {
  console.error(`\n✗ ${msg}`);
  process.exit(1);
}

/**
 * @param {string} path
 * @param {{ strict?: boolean }} [opts] — strict=true for full Railway provision
 */
export function loadBarberConfig(path, opts = {}) {
  const strict = opts.strict !== false;
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (e) {
    fail(`Cannot read config: ${path} (${e.message})`);
  }
  let cfg;
  try {
    cfg = JSON.parse(raw);
  } catch {
    fail(`Invalid JSON in ${path}`);
  }

  const required = strict
    ? ['name', 'slug', 'email', 'github_site_repo', 'github_api_repo', 'railway_workspace_id', 'services']
    : ['name', 'slug', 'services'];

  for (const key of required) {
    if (cfg[key] === undefined || cfg[key] === null || cfg[key] === '') {
      fail(`Config missing required field: ${key}`);
    }
  }
  if (!Array.isArray(cfg.services) || !cfg.services.length) {
    fail('Config.services must be a non-empty array');
  }
  for (const svc of cfg.services) {
    for (const k of ['name', 'slug', 'duration', 'price']) {
      if (svc[k] === undefined || svc[k] === null || svc[k] === '') {
        fail(`Each service needs ${k}`);
      }
    }
  }
  return cfg;
}
