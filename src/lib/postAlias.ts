/**
 * User-facing label for work records ("posts") — configurable per installation.
 * Internal code still uses work/job slugs; POST_ALIAS only changes displayed text.
 *
 * Railway: POST_ALIAS=project | deal | lead | job | …
 */
import { serverEnv } from './serverEnv.ts';

export type PostAliasLabels = {
  /** Lowercase singular — e.g. "project", "deal" */
  singular: string;
  /** Lowercase plural — e.g. "projects", "deals" */
  plural: string;
  /** Title-case singular — e.g. "Project", "Deal" */
  singularTitle: string;
  /** Title-case plural — e.g. "Projects", "Deals" */
  pluralTitle: string;
};

const DEFAULT_SINGULAR = 'project';

function titleCase(word: string): string {
  if (!word) return '';
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

/** Simple English plural — sufficient for industry aliases (deal→deals, job→jobs). */
export function pluralizePostAlias(singular: string): string {
  const s = singular.trim().toLowerCase();
  if (!s) return `${DEFAULT_SINGULAR}s`;
  if (s.endsWith('s') || s.endsWith('x') || s.endsWith('z') || s.endsWith('ch') || s.endsWith('sh')) {
    return `${s}es`;
  }
  if (s.endsWith('y') && s.length > 1 && !/[aeiou]y$/i.test(s)) {
    return `${s.slice(0, -1)}ies`;
  }
  return `${s}s`;
}

export function normalizePostAlias(raw: string | null | undefined): string {
  const t = (raw ?? '').trim().toLowerCase();
  if (!t || !/^[a-z][a-z0-9-]*$/.test(t)) return DEFAULT_SINGULAR;
  return t;
}

export function resolvePostAlias(raw?: string | null): PostAliasLabels {
  const singular = normalizePostAlias(raw);
  const plural = pluralizePostAlias(singular);
  return {
    singular,
    plural,
    singularTitle: titleCase(singular),
    pluralTitle: titleCase(plural),
  };
}

/** Resolved labels for the current deployment (POST_ALIAS env, default "project"). */
export function getPostAlias(): PostAliasLabels {
  return resolvePostAlias(serverEnv('POST_ALIAS'));
}
