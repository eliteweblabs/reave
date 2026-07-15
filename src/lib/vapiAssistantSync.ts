/**
 * Sync homepage Vapi assistant branding from admin Company details.
 * Used by scripts/sync-vapi-assistant.ts (runs before astro build on deploy).
 */
import type { BuildBrandContext } from './vapiBuildBrand.ts';

const VAPI_API = 'https://api.vapi.ai';

export type VapiSyncResult =
  | { ok: true; assistantId: string; companyName: string; firstMessage: string }
  | { ok: false; error: string; skipped?: boolean };

export type VapiTemplateConfig = {
  assistantId?: string;
  firstMessage?: string;
  systemPrompt?: string;
};

type VapiAssistant = {
  id?: string;
  name?: string;
  firstMessage?: string;
  model?: {
    provider?: string;
    model?: string;
    messages?: Array<{ role: string; content?: string }>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

function env(name: string): string | undefined {
  const v = process.env[name];
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

export function vapiAssistantIdFromEnv(): string | undefined {
  return env('VAPI_ASSISTANT_ID') || env('PUBLIC_VAPI_ASSISTANT_ID');
}

/** @deprecated Use vapiAssistantIdFromEnv or resolve from admin config. */
export function vapiAssistantId(): string | undefined {
  return vapiAssistantIdFromEnv();
}

export function resolveVapiAssistantId(templates?: VapiTemplateConfig): string | undefined {
  const fromAdmin = templates?.assistantId?.trim();
  if (fromAdmin) return fromAdmin;
  return vapiAssistantIdFromEnv();
}

export function isVapiSyncConfigured(templates?: VapiTemplateConfig): boolean {
  return Boolean(env('VAPI_API_KEY') && resolveVapiAssistantId(templates));
}

/** Spoken greeting — uses Vapi {{companyName}} variable filled at call time. */
export function vapiFirstMessageTemplate(templates?: VapiTemplateConfig): string {
  const fromAdmin = templates?.firstMessage?.trim();
  if (fromAdmin) return fromAdmin;
  return (
    env('VAPI_FIRST_MESSAGE') ||
    'Hi! Thanks for reaching out to {{companyName}}. How can I help you today?'
  );
}

/** System prompt synced to Vapi — {{company*}} filled via assistantOverrides.variableValues. */
export function vapiSystemPromptTemplate(templates?: VapiTemplateConfig): string {
  const fromAdmin = templates?.systemPrompt?.trim();
  if (fromAdmin) return fromAdmin;

  const custom = env('VAPI_SYSTEM_PROMPT');
  if (custom) return custom;

  return `[Identity]
You are the voice assistant for {{companyName}}.

[About]
{{companyDescription}}

[Guidelines]
- Speak naturally and concisely.
- You represent {{companyName}} only. Never introduce yourself as a different brand, product, or company name.
- Website: {{companyDomain}}
- If you do not know an answer, say so and suggest visiting {{companyDomain}} or leaving contact details.

[Channel]
You are on the website voice widget (web call). Keep replies short enough to say aloud in one breath.`;
}

async function vapiRequest<T>(
  path: string,
  init?: RequestInit,
): Promise<{ ok: true; data: T } | { ok: false; error: string; status?: number }> {
  const apiKey = env('VAPI_API_KEY');
  if (!apiKey) return { ok: false, error: 'VAPI_API_KEY not set' };

  const res = await fetch(`${VAPI_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  const raw = await res.text();
  let body: unknown;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = raw;
  }

  if (!res.ok) {
    const msg =
      body && typeof body === 'object' && 'message' in body
        ? String((body as { message: unknown }).message)
        : raw.slice(0, 400) || `HTTP ${res.status}`;
    return { ok: false, error: msg, status: res.status };
  }

  return { ok: true, data: body as T };
}

function mergeSystemMessage(
  existing: VapiAssistant | undefined,
  systemContent: string,
): VapiAssistant['model'] {
  const model = { ...(existing?.model ?? {}) };
  const messages = Array.isArray(model.messages) ? [...model.messages] : [];
  const sysIdx = messages.findIndex((m) => m.role === 'system');
  const systemMsg = { role: 'system', content: systemContent };
  if (sysIdx >= 0) {
    messages[sysIdx] = { ...messages[sysIdx], ...systemMsg };
  } else {
    messages.unshift(systemMsg);
  }
  return { ...model, messages };
}

/** Push Company-details branding into the configured Vapi assistant. */
export async function syncVapiAssistantBrand(
  brand: BuildBrandContext,
  opts?: { requirePlugin?: boolean; templates?: VapiTemplateConfig },
): Promise<VapiSyncResult> {
  if (opts?.requirePlugin !== false) {
    const { isVapiAdminPluginEnabled } = await import('./vapiPlugin.ts');
    if (!isVapiAdminPluginEnabled()) {
      return { ok: false, error: 'vapi not enabled in install config features', skipped: true };
    }
  }

  if (env('VAPI_SYNC_SKIP') === '1') {
    return { ok: false, error: 'VAPI_SYNC_SKIP=1', skipped: true };
  }

  const templates = opts?.templates;
  const assistantId = resolveVapiAssistantId(templates);
  if (!assistantId) {
    return {
      ok: false,
      error: 'Vapi assistant ID not set (Admin → Vapi or PUBLIC_VAPI_ASSISTANT_ID)',
      skipped: true,
    };
  }
  if (!env('VAPI_API_KEY')) {
    return { ok: false, error: 'VAPI_API_KEY not set', skipped: true };
  }

  const existing = await vapiRequest<VapiAssistant>(`/assistant/${assistantId}`);
  const current = existing.ok ? existing.data : undefined;

  const firstMessage = vapiFirstMessageTemplate(templates);
  const systemContent = vapiSystemPromptTemplate(templates);
  const model = mergeSystemMessage(current, systemContent);

  const patch = await vapiRequest<VapiAssistant>(`/assistant/${assistantId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      name: brand.name,
      firstMessage,
      model,
    }),
  });

  if (!patch.ok) {
    return { ok: false, error: patch.error };
  }

  return { ok: true, assistantId, companyName: brand.name, firstMessage };
}

export async function syncVapiAssistantFromConfig(): Promise<VapiSyncResult> {
  const { loadBuildBrandContext, loadBuildEnabledFeatures, loadBuildVapiTemplates } = await import(
    './vapiBuildBrand.ts'
  );
  const enabled = await loadBuildEnabledFeatures();
  if (!enabled.includes('vapi')) {
    return { ok: false, error: 'vapi not enabled in install config features', skipped: true };
  }
  const brand = await loadBuildBrandContext();
  const templates = await loadBuildVapiTemplates();
  return syncVapiAssistantBrand(brand, { requirePlugin: false, templates });
}
