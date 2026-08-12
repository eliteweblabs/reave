import { getStoredAgentModel } from './agentModelStore';
import { serverEnv } from './serverEnv';

export const DEFAULT_AGENT_MODEL = 'claude-sonnet-4-6';

/** Preference id — not an Anthropic model; resolved per turn via pickAutoAgentModel. */
export const AGENT_MODEL_AUTO = 'auto';

/** Concrete Claude tiers Auto mode routes between. */
export const AUTO_AGENT_MODELS = {
  light: 'claude-haiku-4-5',
  default: 'claude-sonnet-4-6',
  heavy: 'claude-opus-4-8',
} as const;

/** Curated picker labels — ordered most → least capable (Auto first). Update when Anthropic ships new Claude tiers. */
export type AgentModelOption = { id: string; label: string };

export const AGENT_MODEL_OPTIONS: AgentModelOption[] = [
  { id: AGENT_MODEL_AUTO, label: 'Auto' },
  { id: 'claude-fable-5', label: 'Fable 5' },
  { id: 'claude-opus-5', label: 'Opus 5' },
  { id: 'claude-sonnet-5', label: 'Sonnet 5' },
  { id: 'claude-opus-4-8', label: 'Opus 4.8' },
  { id: 'claude-opus-4-6', label: 'Opus 4.6' },
  { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6' },
  { id: 'claude-haiku-4-5', label: 'Haiku 4.5' },
];

const ALIASES: Record<string, string> = {
  auto: AGENT_MODEL_AUTO,
  'claude-auto': AGENT_MODEL_AUTO,
  fable: 'claude-fable-5',
  'fable-5': 'claude-fable-5',
  fable5: 'claude-fable-5',
  opus: 'claude-opus-5',
  'opus-5': 'claude-opus-5',
  opus5: 'claude-opus-5',
  'opus-4-8': 'claude-opus-4-8',
  opus4: 'claude-opus-4-8',
  'opus4.8': 'claude-opus-4-8',
  'opus-4-6': 'claude-opus-4-6',
  'opus4.6': 'claude-opus-4-6',
  sonnet: 'claude-sonnet-5',
  'sonnet-5': 'claude-sonnet-5',
  sonnet5: 'claude-sonnet-5',
  'sonnet-4-6': 'claude-sonnet-4-6',
  sonnet4: 'claude-sonnet-4-6',
  'sonnet4.6': 'claude-sonnet-4-6',
  haiku: 'claude-haiku-4-5',
  'haiku-4-5': 'claude-haiku-4-5',
  haiku4: 'claude-haiku-4-5',
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

export type ResolveAgentModelOpts = {
  userText?: string | null;
  hasImages?: boolean;
  hasDocs?: boolean;
};

export function isAgentModelAuto(model?: string | null): boolean {
  return normalizeAgentModelInput(model) === AGENT_MODEL_AUTO;
}

/** Accept full ids, aliases (auto/fable/opus/sonnet/haiku), or other claude-* ids from env. */
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

/**
 * Cost-aware router for Auto mode.
 * Prefer Haiku for short lookups/acks, Sonnet for normal work, Opus only for
 * clearly heavy design/debug asks (or an explicit "use opus" / "think hard").
 */
export function pickAutoAgentModel(ctx: ResolveAgentModelOpts = {}): string {
  const text = (ctx.userText ?? '').trim();
  const lower = text.toLowerCase();
  const lineCount = text ? text.split(/\n/).length : 0;

  if (/\b(use\s+)?opus\b/.test(lower) || /\bthink\s+hard\b/.test(lower) || /\bbe\s+thorough\b/.test(lower)) {
    return AUTO_AGENT_MODELS.heavy;
  }
  if (/\b(use\s+)?haiku\b/.test(lower) || /\bquick\s+(answer|check|look)\b/.test(lower)) {
    return AUTO_AGENT_MODELS.light;
  }
  if (/\b(use\s+)?sonnet\b/.test(lower)) {
    return AUTO_AGENT_MODELS.default;
  }

  if (
    text.length > 2500 ||
    lineCount >= 12 ||
    /\b(architect(?:ure|ing)?|refactor|redesign|root\s+cause|trade-?offs?|multi-?step\s+plan|production\s+incident|deep\s+dive)\b/i.test(
      text,
    )
  ) {
    return AUTO_AGENT_MODELS.heavy;
  }

  // Vision / docs need Sonnet+; never route attachment turns to Haiku.
  if (ctx.hasImages || ctx.hasDocs) {
    return AUTO_AGENT_MODELS.default;
  }

  if (
    text.length === 0 ||
    (text.length <= 160 &&
      (/^(hi|hello|hey|thanks|thank you|ty|ok|okay|yes|yep|no|nope|sure|please wait)\b/i.test(text) ||
        /^(list|show|status|ping|who is|what's|whats|mark |delete |complete |done)\b/i.test(text) ||
        /^(junk|spam|archive)\b/i.test(text))) ||
    (text.length <= 80 && /^(list |show |get |read |check |find )/i.test(text))
  ) {
    return AUTO_AGENT_MODELS.light;
  }

  return AUTO_AGENT_MODELS.default;
}

function expandIfAuto(model: string, opts?: ResolveAgentModelOpts): string {
  if (!isAgentModelAuto(model)) return model;
  return pickAutoAgentModel(opts);
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

/**
 * Per-request override → stored preference → ANTHROPIC_MODEL env → default.
 * Always returns a concrete Anthropic model id (Auto is expanded using opts).
 */
export async function resolveAgentModel(
  override?: string | null,
  opts?: ResolveAgentModelOpts,
): Promise<string> {
  const normalizedOverride = normalizeAgentModelInput(override);
  if (normalizedOverride) return expandIfAuto(normalizedOverride, opts);
  const settings = await getAgentModelSettings();
  return expandIfAuto(settings.model, opts);
}

export function formatAgentModelHelp(settings: AgentModelSettings): string {
  const lines = [
    `Current model: ${settings.model} (${labelForAgentModel(settings.model)})`,
    `Source: ${settings.source}${settings.envModel && settings.source !== 'env' ? ` · env fallback ${settings.envModel}` : ''}`,
    '',
    'Switch:',
    ...settings.options.map((o) =>
      o.id === AGENT_MODEL_AUTO
        ? `/model auto  — Auto (Haiku / Sonnet / Opus by task)`
        : `/model ${o.id.replace(/^claude-/, '')}  — ${o.label}`,
    ),
    '/model reset  — clear saved choice (use env/default)',
  ];
  return lines.join('\n');
}
