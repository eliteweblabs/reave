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
  practiceArea: PracticeAreaId;
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

function isPracticeArea(value: string): value is PracticeAreaId {
  return PRACTICE_AREAS.some((row) => row.id === value);
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

export function normalizePracticeGate(raw?: Partial<PracticeGate> | null): PracticeGate {
  const radius = Number(raw?.radiusMi);
  const area = (raw?.practiceArea || '').trim().toLowerCase();
  const mode = (raw?.gateMode || '').trim().toLowerCase();
  return {
    radiusMi: Number.isFinite(radius) && radius > 0 ? Math.min(250, Math.max(5, radius)) : 60,
    counties: [...new Set((raw?.counties ?? []).map((c) => c.trim()).filter(Boolean))],
    states: normalizeStates(raw?.states),
    practiceArea: isPracticeArea(area) ? area : 'bankruptcy',
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
  return {
    radiusMi: Number.isFinite(radius) ? radius : undefined,
    counties: counties.length ? counties : undefined,
    states: states.length ? states : undefined,
    practiceArea: serverEnv('PRACTICE_AREA')?.trim() as PracticeAreaId | undefined,
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
        practiceArea: row.practice_area as PracticeAreaId,
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
  const next = normalizePracticeGate({ ...current, ...input });
  const pool = getPgPool();
  if (pool) {
    await ensurePracticeGateSchema(pool);
    await pool.query(
      `UPDATE practice_gate
       SET radius_mi = $1, counties = $2, states = $3, practice_area = $4, gate_mode = $5, updated_at = now()
       WHERE id = 1`,
      [next.radiusMi, next.counties, next.states, next.practiceArea, next.gateMode],
    );
  } else {
    writeFileGate(next);
  }
  return next;
}
