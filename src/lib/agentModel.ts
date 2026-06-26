import { getStoredAgentModel } from './agentModelStore';
import { serverEnv } from './serverEnv';

export const DEFAULT_AGENT_MODEL = 'claude-sonnet-4-6';

export type AgentModelOption = { id: string; label: string };

export const AGENT_MODEL_OPTIONS: AgentModelOption[] = [
  { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6' },
  { id: 'claude-opus-4-6', label: 'Opus 4.6' },
  { id: 'claude-haiku-4-5', label: 'Haiku 4.5' },
];

const ALIASES: Record<string, string> = {
  sonnet: 'claude-sonnet-4-6',
  'sonnet-4-6': 'claude-sonnet-4-6',
  'sonnet4': 'claude-sonnet-4-6',
  'sonnet4.6': 'claude-sonnet-4-6',
  opus: 'claude-opus-4-6',
  'opus-4-6': 'claude-opus-4-6',
  'opus4': 'claude-opus-4-6',
  'opus4.6': 'claude-opus-4-6',
  haiku: 'claude-haiku-4-5',
  'haiku-4-5': 'claude-haiku-4-5',
  'haiku4': 'claude-haiku-4-5',
  'haiku4.5': 'claude-haiku-4-5',
};

const OPTION_IDS = new Set(AGENT_MODEL_OPTIONS.map((o) => o.id));

export type AgentModelSource = 'stored' | 'env' | 'default';

export type AgentModelSettings = {
  model: string;
  source: AgentModelSource;
  defaultModel: string;
  envModel: string | null;
  storedModel: string | null;
  options: AgentModelOption[];
};

/** Accept full ids, aliases (sonnet/opus/haiku), or other claude-* ids from env. */
export function normalizeAgentModelInput(raw?: string | null): string | null {
  const t = raw?.trim().toLowerCase();
  if (!t) return null;
  if (t === 'default' || t === 'reset') return null;
  if (ALIASES[t]) return ALIASES[t];
  if (OPTION_IDS.has(t)) return t;
  if (/^claude-[a-z0-9.-]+$/.test(t)) return t;
  return null;
}

export function labelForAgentModel(model: string): string {
  const hit = AGENT_MODEL_OPTIONS.find((o) => o.id === model);
  if (hit) return hit.label;
  return model;
}

export async function getAgentModelSettings(): Promise<AgentModelSettings> {
  const storedModel = await getStoredAgentModel();
  const envModel = serverEnv('ANTHROPIC_MODEL')?.trim() || null;
  const normalizedStored = storedModel ? normalizeAgentModelInput(storedModel) : null;
  const normalizedEnv = envModel ? normalizeAgentModelInput(envModel) : null;

  if (normalizedStored) {
    return {
      model: normalizedStored,
      source: 'stored',
      defaultModel: DEFAULT_AGENT_MODEL,
      envModel: normalizedEnv,
      storedModel: normalizedStored,
      options: AGENT_MODEL_OPTIONS,
    };
  }
  if (normalizedEnv) {
    return {
      model: normalizedEnv,
      source: 'env',
      defaultModel: DEFAULT_AGENT_MODEL,
      envModel: normalizedEnv,
      storedModel: null,
      options: AGENT_MODEL_OPTIONS,
    };
  }
  return {
    model: DEFAULT_AGENT_MODEL,
    source: 'default',
    defaultModel: DEFAULT_AGENT_MODEL,
    envModel: null,
    storedModel: null,
    options: AGENT_MODEL_OPTIONS,
  };
}

/** Per-request override → stored preference → ANTHROPIC_MODEL env → default. */
export async function resolveAgentModel(override?: string | null): Promise<string> {
  const normalizedOverride = normalizeAgentModelInput(override);
  if (normalizedOverride) return normalizedOverride;
  const settings = await getAgentModelSettings();
  return settings.model;
}

export function formatAgentModelHelp(settings: AgentModelSettings): string {
  const lines = [
    `Current model: ${settings.model} (${labelForAgentModel(settings.model)})`,
    `Source: ${settings.source}${settings.envModel && settings.source !== 'env' ? ` · env fallback ${settings.envModel}` : ''}`,
    '',
    'Switch:',
    ...settings.options.map((o) => `/model ${o.id.split('-')[1] ?? o.id}  — ${o.label}`),
    '/model reset  — clear saved choice (use env/default)',
  ];
  return lines.join('\n');
}
