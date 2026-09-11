/**
 * Sync homepage Vapi assistant branding from admin Company details.
 * Used by scripts/sync-vapi-assistant.ts (runs before astro build on deploy).
 */
import type { BuildBrandContext } from './vapiBuildBrand.ts';

const VAPI_API = 'https://api.vapi.ai';

export type VapiSyncResult =
  | {
      ok: true;
      assistantId: string;
      companyName: string;
      firstMessage: string;
      created?: boolean;
      phoneAttached?: boolean;
      phoneNumber?: string;
    }
  | { ok: false; error: string; skipped?: boolean };

type VapiPhoneNumber = {
  id?: string;
  number?: string;
  assistantId?: string | null;
};

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
  if (!env('VAPI_API_KEY')) return false;
  if (resolveVapiAssistantId(templates)) return true;
  return env('VAPI_CREATE_IF_MISSING') !== '0';
}

/** Default POST body for a new Vapi assistant (voice + phone + web widget). */
export function buildVapiAssistantCreateBody(
  brand: BuildBrandContext,
  templates?: VapiTemplateConfig,
): Record<string, unknown> {
  const firstMessage = vapiFirstMessageTemplate(templates);
  const systemContent = vapiSystemPromptTemplate(templates);
  const modelProvider = env('VAPI_MODEL_PROVIDER') || 'openai';
  const modelName = env('VAPI_MODEL') || 'gpt-4o-mini';
  const voiceProvider = env('VAPI_VOICE_PROVIDER') || '11labs';
  const voiceId = env('VAPI_VOICE_ID') || 'sarah';

  return {
    name: brand.name,
    firstMessage,
    model: {
      provider: modelProvider,
      model: modelName,
      messages: [{ role: 'system', content: systemContent }],
    },
    voice: { provider: voiceProvider, voiceId },
    transcriber: {
      provider: env('VAPI_TRANSCRIBER_PROVIDER') || 'deepgram',
      model: env('VAPI_TRANSCRIBER_MODEL') || 'nova-2',
      language: 'en',
    },
  };
}

async function resolveOrCreateAssistantId(
  brand: BuildBrandContext,
  templates?: VapiTemplateConfig,
): Promise<{ ok: true; assistantId: string; created: boolean } | { ok: false; error: string }> {
  const existingId = resolveVapiAssistantId(templates);
  if (existingId) return { ok: true, assistantId: existingId, created: false };

  if (env('VAPI_CREATE_IF_MISSING') === '0') {
    return {
      ok: false,
      error: 'Vapi assistant ID not set (Admin → Vapi or PUBLIC_VAPI_ASSISTANT_ID)',
    };
  }

  const listed = await vapiRequest<VapiAssistant[]>('/assistant');
  if (listed.ok && Array.isArray(listed.data)) {
    const target = brand.name.trim().toLowerCase();
    const match = listed.data.find((row) => (row.name ?? '').trim().toLowerCase() === target);
    if (match?.id) return { ok: true, assistantId: match.id, created: false };
  }

  const created = await vapiRequest<VapiAssistant>('/assistant', {
    method: 'POST',
    body: JSON.stringify(buildVapiAssistantCreateBody(brand, templates)),
  });
  if (!created.ok) return { ok: false, error: created.error };
  if (!created.data.id) {
    return { ok: false, error: 'Vapi create assistant returned no id' };
  }
  return { ok: true, assistantId: created.data.id, created: true };
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

function normalizeVapiPhone(raw: string): string {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return trimmed.startsWith('+') ? trimmed : `+${digits}`;
}

/** Attach a Vapi phone number to the configured assistant (inbound voice). */
export async function attachVapiPhoneToAssistant(
  assistantId: string,
  opts?: { phoneNumber?: string; phoneNumberId?: string },
): Promise<{ ok: true; phoneNumberId: string; phoneNumber?: string } | { ok: false; error: string; skipped?: boolean }> {
  if (!env('VAPI_API_KEY')) {
    return { ok: false, error: 'VAPI_API_KEY not set', skipped: true };
  }

  const phoneNumberId = opts?.phoneNumberId?.trim() || env('VAPI_PHONE_NUMBER_ID');
  const phoneTarget = opts?.phoneNumber?.trim() || env('VAPI_PHONE_NUMBER');
  if (!phoneNumberId && !phoneTarget) {
    return { ok: false, error: 'VAPI_PHONE_NUMBER or VAPI_PHONE_NUMBER_ID not set', skipped: true };
  }

  let resolvedId = phoneNumberId;
  let resolvedNumber = phoneTarget ? normalizeVapiPhone(phoneTarget) : undefined;

  if (!resolvedId) {
    const listed = await vapiRequest<VapiPhoneNumber[]>('/phone-number');
    if (!listed.ok) return { ok: false, error: listed.error };
    const rows = Array.isArray(listed.data) ? listed.data : [];
    const targetDigits = resolvedNumber?.replace(/\D/g, '') ?? '';
    const match = rows.find((row) => {
      const rowDigits = String(row.number ?? '').replace(/\D/g, '');
      return rowDigits === targetDigits || rowDigits.endsWith(targetDigits.slice(-10));
    });
    if (!match?.id) {
      return {
        ok: false,
        error: `Vapi phone number not found for ${resolvedNumber ?? phoneTarget}`,
      };
    }
    resolvedId = match.id;
    resolvedNumber = match.number ?? resolvedNumber;
  }

  const patch = await vapiRequest<VapiPhoneNumber>(`/phone-number/${resolvedId}`, {
    method: 'PATCH',
    body: JSON.stringify({ assistantId }),
  });
  if (!patch.ok) return { ok: false, error: patch.error };

  return { ok: true, phoneNumberId: resolvedId, phoneNumber: patch.data.number ?? resolvedNumber };
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
  if (!env('VAPI_API_KEY')) {
    return { ok: false, error: 'VAPI_API_KEY not set', skipped: true };
  }

  const resolved = await resolveOrCreateAssistantId(brand, templates);
  if (!resolved.ok) {
    return { ok: false, error: resolved.error, skipped: true };
  }
  const { assistantId, created } = resolved;

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

  const phone = await attachVapiPhoneToAssistant(assistantId);

  if (created) {
    const { persistVapiAssistantIdToPostgres } = await import('./vapiBuildBrand.ts');
    const persisted = await persistVapiAssistantIdToPostgres(assistantId);
    if (persisted) {
      console.log(`[vapi-sync] saved assistant id to company_config`);
    }
  }

  return {
    ok: true,
    assistantId,
    companyName: brand.name,
    firstMessage,
    created,
    phoneAttached: phone.ok,
    phoneNumber: phone.ok ? phone.phoneNumber : undefined,
  };
}

/** Create (or reuse by name) a Vapi assistant — for provisioning before Railway env is set. */
export async function provisionVapiAssistant(
  brand: BuildBrandContext,
  templates?: VapiTemplateConfig,
): Promise<VapiSyncResult> {
  if (!env('VAPI_API_KEY')) {
    return { ok: false, error: 'VAPI_API_KEY not set' };
  }
  return syncVapiAssistantBrand(brand, { requirePlugin: false, templates });
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
