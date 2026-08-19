/**
 * Document library packs — bundled templates can declare industry / state /
 * department so a law install does not show agency sheets, and a tax shop
 * does not get the Massachusetts bankruptcy pack.
 *
 * Untagged templates (user-created) always stay visible.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DIRECTORY_COUNTIES } from './courtDirectory';
import { knowledgeIndustryId } from './knowledgeIndustry';
import {
  gateIncludesPracticeArea,
  getPracticeGate,
  type PracticeAreaId,
  type PracticeGate,
} from './practiceGate';

export type DocumentPackMeta = {
  industry?: 'law' | 'agency';
  states: string[];
  departments: PracticeAreaId[];
};

const MA_COUNTIES = new Set(DIRECTORY_COUNTIES.map((c) => c.toLowerCase()));

function fmBlock(markdown: string): string {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  return match?.[1] ?? '';
}

function fmValue(fm: string, key: string): string {
  const match = fm.match(new RegExp(`^${key}:\\s*(.+)$`, 'im'));
  if (!match) return '';
  return match[1].trim().replace(/^["']|["']$/g, '');
}

function fmList(fm: string, key: string): string[] {
  const raw = fmValue(fm, key);
  if (!raw) return [];
  return raw
    .replace(/^\[|\]$/g, '')
    .split(',')
    .map((s) => s.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean);
}

export function parseDocumentPackMeta(markdown: string): DocumentPackMeta {
  const fm = fmBlock(markdown);
  const industryRaw = fmValue(fm, 'industry').toLowerCase();
  const industry = industryRaw === 'law' || industryRaw === 'agency' ? industryRaw : undefined;
  const states = fmList(fm, 'states').map((s) => s.toUpperCase()).filter((s) => /^[A-Z]{2}$/.test(s));
  const departments = fmList(fm, 'departments')
    .map((s) => s.toLowerCase())
    .filter((s): s is PracticeAreaId =>
      s === 'bankruptcy' || s === 'tax' || s === 'foreclosure' || s === 'general',
    );
  return { industry, states, departments };
}

export function documentMatchesInstall(
  meta: DocumentPackMeta,
  opts: {
    industry?: string | null;
    states?: string[];
    counties?: string[];
    departments?: string[];
  },
): boolean {
  if (!meta.industry) return true;
  const industry = knowledgeIndustryId(opts.industry);
  if (meta.industry === 'agency') return industry !== 'law';
  if (industry !== 'law') return false;

  const departments = (opts.departments ?? []).map((s) => s.toLowerCase());
  if (meta.departments.length) {
    const selected = departments.length ? departments : ['bankruptcy'];
    const gate = {
      practiceArea: (selected[0] || 'bankruptcy') as PracticeAreaId,
      practiceAreas: selected as PracticeAreaId[],
    };
    const ok = meta.departments.some((id) => gateIncludesPracticeArea(gate, id));
    if (!ok) return false;
  }

  if (!meta.states.length) return true;
  const states = (opts.states ?? []).map((s) => s.trim().toUpperCase()).filter(Boolean);
  if (states.length) return meta.states.some((s) => states.includes(s));

  const counties = (opts.counties ?? []).map((c) => c.trim().toLowerCase()).filter(Boolean);
  if (counties.length) {
    if (!meta.states.includes('MA')) return false;
    return counties.some((c) => MA_COUNTIES.has(c));
  }

  // Radius / unset region — show the MA pack while it is the only state we stock.
  return meta.states.includes('MA');
}

export async function documentVisibleOnThisInstall(markdown: string): Promise<boolean> {
  const gate = await getPracticeGate();
  return documentMatchesInstall(parseDocumentPackMeta(markdown), installFromGate(gate));
}

export function installFromGate(gate: PracticeGate): {
  industry: string | null;
  states: string[];
  counties: string[];
  departments: string[];
} {
  return {
    industry: knowledgeIndustryId(),
    states: gate.states,
    counties: gate.counties,
    departments: gate.practiceAreas?.length ? gate.practiceAreas : [gate.practiceArea],
  };
}

export type DocumentFile = {
  slug: string;
  abs: string;
  markdown: string;
};

function projectRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, 'package.json'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

export function documentsDir(): string {
  return join(projectRoot(), 'src', 'documents');
}

function walkMarkdown(dir: string, out: DocumentFile[]): void {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, name.name);
    if (name.isDirectory()) {
      walkMarkdown(abs, out);
      continue;
    }
    if (!name.isFile() || !name.name.endsWith('.md')) continue;
    const slug = name.name.replace(/\.md$/i, '');
    out.push({ slug, abs, markdown: readFileSync(abs, 'utf8') });
  }
}

export function listDocumentFiles(): DocumentFile[] {
  const out: DocumentFile[] = [];
  walkMarkdown(documentsDir(), out);
  const seen = new Set<string>();
  return out.filter((row) => {
    if (seen.has(row.slug)) return false;
    seen.add(row.slug);
    return true;
  });
}

export function findDocumentFile(slug: string): DocumentFile | null {
  return listDocumentFiles().find((row) => row.slug === slug) ?? null;
}
