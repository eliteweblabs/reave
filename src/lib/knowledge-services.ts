/**
 * Optional extra plugin-repo mappings via env (supplements PLUGIN_KNOWLEDGE_REPOS in features.ts).
 *
 * Format: `<feature_id>:<owner>/<repo>`, comma-separated, no spaces.
 * Loaded only when that feature module is enabled — see pluginKnowledge.ts.
 *
 * Example:
 *   PLUGIN_KNOWLEDGE_REPOS_ENV="billing:eliteweblabs/crater-invoicing"
 */

export interface KnowledgeService {
  slug: string;
  owner: string;
  repo: string;
  /** Convenience: `${owner}/${repo}` */
  fullName: string;
}

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const OWNER_RE = /^[a-z0-9-]+$/;
const REPO_RE = /^[a-z0-9._-]+$/;

export class KnowledgeServicesError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KnowledgeServicesError';
  }
}

/**
 * Parse and validate a `KNOWLEDGE_SERVICES`-formatted string.
 *
 * Throws `KnowledgeServicesError` on malformed entries, invalid characters,
 * or duplicate slugs. Returns an empty array for empty/undefined input.
 *
 * Inputs are trimmed and lowercased defensively, so values that only differ
 * in case will be detected as duplicates.
 */
export function parseKnowledgeServices(raw: string | undefined | null): KnowledgeService[] {
  if (!raw || !raw.trim()) return [];

  const entries = raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  const services: KnowledgeService[] = [];
  const seenSlugs = new Set<string>();

  for (const entry of entries) {
    const colonIdx = entry.indexOf(':');
    if (colonIdx === -1) {
      throw new KnowledgeServicesError(
        `Invalid entry "${entry}": expected "<slug>:<owner>/<repo>".`
      );
    }

    const slug = entry.slice(0, colonIdx).trim().toLowerCase();
    const path = entry.slice(colonIdx + 1).trim().toLowerCase();

    if (!SLUG_RE.test(slug)) {
      throw new KnowledgeServicesError(
        `Invalid slug "${slug}" in entry "${entry}": must be lowercase kebab-case (a-z, 0-9, hyphens).`
      );
    }

    const slashIdx = path.indexOf('/');
    if (slashIdx === -1 || slashIdx !== path.lastIndexOf('/')) {
      throw new KnowledgeServicesError(
        `Invalid path "${path}" in entry "${entry}": expected exactly one "/" between owner and repo.`
      );
    }

    const owner = path.slice(0, slashIdx);
    const repo = path.slice(slashIdx + 1);

    if (!OWNER_RE.test(owner)) {
      throw new KnowledgeServicesError(
        `Invalid owner "${owner}" in entry "${entry}": must match ${OWNER_RE}.`
      );
    }
    if (!REPO_RE.test(repo)) {
      throw new KnowledgeServicesError(
        `Invalid repo "${repo}" in entry "${entry}": must match ${REPO_RE}.`
      );
    }

    if (seenSlugs.has(slug)) {
      throw new KnowledgeServicesError(`Duplicate slug "${slug}" in KNOWLEDGE_SERVICES.`);
    }
    seenSlugs.add(slug);

    services.push({ slug, owner, repo, fullName: `${owner}/${repo}` });
  }

  return services;
}

/**
 * Convenience helper that reads `import.meta.env.KNOWLEDGE_SERVICES`
 * and returns the parsed list. Cached per process.
 */
let cached: KnowledgeService[] | null = null;
export function getKnowledgeServices(): KnowledgeService[] {
  if (cached) return cached;
  cached = parseKnowledgeServices(import.meta.env.KNOWLEDGE_SERVICES);
  return cached;
}
