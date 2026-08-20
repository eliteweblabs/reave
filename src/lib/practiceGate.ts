import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPgPool } from './pgPool';
import { serverEnv } from './serverEnv';

export const PRACTICE_AREAS = [
  { id: 'bankruptcy', label: 'Bankruptcy / debtor' },
  { id: 'tax', label: 'Tax controversy' },
  { id: 'foreclosure', label: 'Foreclosure / housing' },
  { id: 'general', label: 'General practice' },
] as const;

export type PracticeAreaId = (typeof PRACTICE_AREAS)[number]['id'];
export type PracticeGateMode = 'radius' | 'counties' | 'state' | 'both';

export const PRACTICE_GATE_MODES = [
  { id: 'radius', label: 'Distance from office' },
  { id: 'counties', label: 'County' },
  { id: 'state', label: 'State' },
] as const;

export const US_STATES = [
  { id: 'AL', label: 'Alabama' },
  { id: 'AK', label: 'Alaska' },
  { id: 'AZ', label: 'Arizona' },
  { id: 'AR', label: 'Arkansas' },
  { id: 'CA', label: 'California' },
  { id: 'CO', label: 'Colorado' },
  { id: 'CT', label: 'Connecticut' },
  { id: 'DE', label: 'Delaware' },
  { id: 'DC', label: 'District of Columbia' },
  { id: 'FL', label: 'Florida' },
  { id: 'GA', label: 'Georgia' },
  { id: 'HI', label: 'Hawaii' },
  { id: 'ID', label: 'Idaho' },
  { id: 'IL', label: 'Illinois' },
  { id: 'IN', label: 'Indiana' },
  { id: 'IA', label: 'Iowa' },
  { id: 'KS', label: 'Kansas' },
  { id: 'KY', label: 'Kentucky' },
  { id: 'LA', label: 'Louisiana' },
  { id: 'ME', label: 'Maine' },
  { id: 'MD', label: 'Maryland' },
  { id: 'MA', label: 'Massachusetts' },
  { id: 'MI', label: 'Michigan' },
  { id: 'MN', label: 'Minnesota' },
  { id: 'MS', label: 'Mississippi' },
  { id: 'MO', label: 'Missouri' },
  { id: 'MT', label: 'Montana' },
  { id: 'NE', label: 'Nebraska' },
  { id: 'NV', label: 'Nevada' },
  { id: 'NH', label: 'New Hampshire' },
  { id: 'NJ', label: 'New Jersey' },
  { id: 'NM', label: 'New Mexico' },
  { id: 'NY', label: 'New York' },
  { id: 'NC', label: 'North Carolina' },
  { id: 'ND', label: 'North Dakota' },
  { id: 'OH', label: 'Ohio' },
  { id: 'OK', label: 'Oklahoma' },
  { id: 'OR', label: 'Oregon' },
  { id: 'PA', label: 'Pennsylvania' },
  { id: 'RI', label: 'Rhode Island' },
  { id: 'SC', label: 'South Carolina' },
  { id: 'SD', label: 'South Dakota' },
  { id: 'TN', label: 'Tennessee' },
  { id: 'TX', label: 'Texas' },
  { id: 'UT', label: 'Utah' },
  { id: 'VT', label: 'Vermont' },
  { id: 'VA', label: 'Virginia' },
  { id: 'WA', label: 'Washington' },
  { id: 'WV', label: 'West Virginia' },
  { id: 'WI', label: 'Wisconsin' },
  { id: 'WY', label: 'Wyoming' },
] as const;

const US_STATE_IDS = new Set<string>(US_STATES.map((row) => row.id));

export type PracticeGate = {
  radiusMi: number;
  counties: string[];
  states: string[];
  /** First selected department — kept for tags and older installs. */
  practiceArea: PracticeAreaId;
  practiceAreas: PracticeAreaId[];
  gateMode: PracticeGateMode;
};

const SCHEMA = `
CREATE TABLE IF NOT EXISTS practice_gate (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  radius_mi DOUBLE PRECISION NOT NULL DEFAULT 60,
  counties TEXT[] NOT NULL DEFAULT '{}',
  practice_area TEXT NOT NULL DEFAULT 'bankruptcy',
  gate_mode TEXT NOT NULL DEFAULT 'radius',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO practice_gate (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
`;

const SCHEMA_STATES = `ALTER TABLE practice_gate ADD COLUMN IF NOT EXISTS states TEXT[] NOT NULL DEFAULT '{}';`;

async function ensurePracticeGateSchema(pool: NonNullable<ReturnType<typeof getPgPool>>): Promise<void> {
  await pool.query(SCHEMA);
  await pool.query(SCHEMA_STATES);
}

export function isPracticeArea(value: string): value is PracticeAreaId {
  return PRACTICE_AREAS.some((row) => row.id === value);
}

function normalizePracticeAreas(raw?: Partial<PracticeGate> | null): PracticeAreaId[] {
  if (Array.isArray(raw?.practiceAreas)) {
    const unique = [
      ...new Set(raw.practiceAreas.map((s) => String(s).trim().toLowerCase()).filter(isPracticeArea)),
    ];
    return unique.length ? unique : ['bankruptcy'];
  }
  const fromSingle = String(raw?.practiceArea || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(isPracticeArea);
  return fromSingle.length ? fromSingle : ['bankruptcy'];
}

export function gateIncludesPracticeArea(gate: Pick<PracticeGate, 'practiceArea' | 'practiceAreas'>, id: PracticeAreaId): boolean {
  return (gate.practiceAreas?.length ? gate.practiceAreas : [gate.practiceArea]).includes(id);
}

function isGateMode(value: string): value is PracticeGateMode {
  return value === 'radius' || value === 'counties' || value === 'state' || value === 'both';
}

function normalizeStates(raw?: string[] | null): string[] {
  return [
    ...new Set(
      (raw ?? [])
        .map((s) => s.trim().toUpperCase())
        .filter((s) => US_STATE_IDS.has(s)),
    ),
  ];
}

/** Gate values are `"Essex"` (legacy) or `"Essex, MA"`. */
export type CountySelection = { name: string; state: string | null };

export function parseCountySelection(raw: string): CountySelection {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return { name: '', state: null };
  const withState = trimmed.match(/^(.*?)(?:,\s*([A-Za-z]{2}))$/);
  const head = (withState ? withState[1] : trimmed).replace(/\s+county$/i, '').trim();
  return { name: head, state: withState ? withState[2].toUpperCase() : null };
}

export function countySelectionMatches(selected: string, venueCounty: string, venueState: string): boolean {
  const parsed = parseCountySelection(selected);
  if (!parsed.name) return false;
  if (parsed.name.toLowerCase() !== venueCounty.trim().toLowerCase()) return false;
  if (!parsed.state) return true;
  return parsed.state === venueState.trim().toUpperCase();
}

export function normalizePracticeGate(raw?: Partial<PracticeGate> | null): PracticeGate {
  const radius = Number(raw?.radiusMi);
  const mode = (raw?.gateMode || '').trim().toLowerCase();
  const areas = normalizePracticeAreas(raw);
  return {
    radiusMi: Number.isFinite(radius) && radius > 0 ? Math.min(250, Math.max(5, radius)) : 60,
    counties: [...new Set((raw?.counties ?? []).map((c) => c.trim()).filter(Boolean))],
    states: normalizeStates(raw?.states),
    practiceArea: areas[0],
    practiceAreas: areas,
    gateMode: isGateMode(mode) ? mode : 'radius',
  };
}

export function gateFromEnv(): Partial<PracticeGate> {
  const counties = (serverEnv('COURT_COUNTIES') || '')
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean);
  const states = (serverEnv('COURT_STATES') || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const radius = Number(serverEnv('COURT_RADIUS_MI'));
  const areas = (serverEnv('PRACTICE_AREA') || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(isPracticeArea);
  return {
    radiusMi: Number.isFinite(radius) ? radius : undefined,
    counties: counties.length ? counties : undefined,
    states: states.length ? states : undefined,
    practiceArea: areas[0],
    practiceAreas: areas.length ? areas : undefined,
    gateMode: serverEnv('COURT_GATE_MODE')?.trim() as PracticeGateMode | undefined,
  };
}

function projectRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, 'package.json'))) return dir;
    dir = dirname(dir);
  }
  return process.cwd();
}

function filePath(): string {
  return join(projectRoot(), 'src', 'knowledge', 'practice-gate.json');
}

function readFileGate(): PracticeGate | null {
  try {
    if (!existsSync(filePath())) return null;
    return normalizePracticeGate(JSON.parse(readFileSync(filePath(), 'utf8')));
  } catch {
    return null;
  }
}

function writeFileGate(gate: PracticeGate): void {
  const dir = dirname(filePath());
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(filePath(), `${JSON.stringify(gate, null, 2)}\n`);
}

export function isDefaultPracticeGate(gate: PracticeGate): boolean {
  return (
    gate.radiusMi === 60 &&
    gate.counties.length === 0 &&
    gate.states.length === 0 &&
    gate.practiceArea === 'bankruptcy' &&
    gate.practiceAreas.length === 1 &&
    gate.practiceAreas[0] === 'bankruptcy' &&
    gate.gateMode === 'radius'
  );
}

export async function getPracticeGate(): Promise<PracticeGate> {
  const env = gateFromEnv();
  const pool = getPgPool();
  if (pool) {
    await ensurePracticeGateSchema(pool);
    const { rows } = await pool.query<{
      radius_mi: number;
      counties: string[] | null;
      states: string[] | null;
      practice_area: string;
      gate_mode: string;
    }>('SELECT radius_mi, counties, states, practice_area, gate_mode FROM practice_gate WHERE id = 1');
    const row = rows[0];
    if (row) {
      return normalizePracticeGate({
        radiusMi: row.radius_mi,
        counties: row.counties ?? [],
        states: row.states ?? [],
        practiceArea: row.practice_area,
        gateMode: row.gate_mode as PracticeGateMode,
      });
    }
  }
  const file = readFileGate();
  if (file) return file;
  return normalizePracticeGate(env);
}

export async function setPracticeGate(input: Partial<PracticeGate>): Promise<PracticeGate> {
  const current = await getPracticeGate();
  const next = normalizePracticeGate({
    radiusMi: input.radiusMi ?? current.radiusMi,
    counties: input.counties ?? current.counties,
    states: input.states ?? current.states,
    gateMode: input.gateMode ?? current.gateMode,
    practiceAreas:
      input.practiceAreas ??
      (input.practiceArea != null ? String(input.practiceArea).split(',') : current.practiceAreas),
  });
  const pool = getPgPool();
  if (pool) {
    await ensurePracticeGateSchema(pool);
    await pool.query(
      `UPDATE practice_gate
       SET radius_mi = $1, counties = $2, states = $3, practice_area = $4, gate_mode = $5, updated_at = now()
       WHERE id = 1`,
      [next.radiusMi, next.counties, next.states, next.practiceAreas.join(','), next.gateMode],
    );
  } else {
    writeFileGate(next);
  }
  return next;
}
