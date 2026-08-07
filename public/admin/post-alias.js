/**
 * Client-side post alias — mirrors src/lib/postAlias.ts via window.__postAlias.
 */

const DEFAULT = {
  singular: 'project',
  plural: 'projects',
  singularTitle: 'Project',
  pluralTitle: 'Projects',
};

export function postAlias() {
  const raw = window.__postAlias;
  return raw && typeof raw === 'object' ? { ...DEFAULT, ...raw } : DEFAULT;
}

export function postTitle(count = 1) {
  const a = postAlias();
  return count === 1 ? a.singularTitle : a.pluralTitle;
}

export function postLower(count = 1) {
  const a = postAlias();
  return count === 1 ? a.singular : a.plural;
}

/** "3 projects" / "1 project" */
export function postCount(n) {
  const num = Math.max(0, Number(n) || 0);
  const a = postAlias();
  return `${num} ${num === 1 ? a.singular : a.plural}`;
}

export function postNew() {
  return `New ${postLower(1)}`;
}

export function postSave() {
  return `Save ${postLower(1)}`;
}

export function postTitleLabel() {
  return `${postTitle(1)} title`;
}

/** Footer / tooltip count — "3 projects" */
export function postCountLabel(n) {
  const num = Math.max(0, Number(n) || 0);
  const a = postAlias();
  const word = num === 1 ? a.singular : a.plural;
  return `${num} ${word}`;
}
