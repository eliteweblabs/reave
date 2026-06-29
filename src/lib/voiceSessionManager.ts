/**
 * Voice session manager — in-memory state for active Telnyx calls.
 *
 * Each inbound/outbound call gets a VoiceSession keyed by call_control_id.
 * On a Railway server restart sessions are lost (calls in progress will just
 * not get AI responses and will time out). For production you could persist
 * sessions to Redis/Postgres.
 *
 * Env vars:
 *   VOICE_AGENT_ENABLED   — "1" enables AI on inbound calls (default: off).
 *   AGENT_ALERT_USER_ID   — Clerk user id; call alerts post to System alerts chat.
 *   VOICE_GREETING         — Custom greeting prompt (optional).
 */
import { serverEnv } from './serverEnv';
import { hasFeature } from './features';

export type VoiceMode = 'ai' | 'forwarding' | 'paused';

export type VoiceTurn = { role: 'user' | 'assistant'; content: string };

export interface VoiceSession {
  callControlId: string;
  from: string;
  to: string;
  mode: VoiceMode;
  history: VoiceTurn[];
  startedAt: number;
  /** Human-readable duration */
  durationSecs(): number;
}

// ─── Global state ─────────────────────────────────────────────────────────────

/** Reads VOICE_AGENT_ENABLED at startup; may be toggled at runtime via env/API. */
let voiceAgentEnabled: boolean = serverEnv('VOICE_AGENT_ENABLED') === '1';

const sessions = new Map<string, VoiceSession>();

// ─── Enable / disable ──────────────────────────────────────────────────────

export function isVoiceAgentEnabled(): boolean {
  return hasFeature('voice') && voiceAgentEnabled;
}

export function setVoiceAgentEnabled(enabled: boolean): void {
  voiceAgentEnabled = enabled;
  console.info('[voice] agent', enabled ? 'ENABLED' : 'DISABLED');
}

// ─── Session CRUD ──────────────────────────────────────────────────────────

export function createVoiceSession(callControlId: string, from: string, to: string): VoiceSession {
  const startedAt = Date.now();
  const session: VoiceSession = {
    callControlId,
    from,
    to,
    mode: 'ai',
    history: [],
    startedAt,
    durationSecs() { return Math.floor((Date.now() - startedAt) / 1000); },
  };
  sessions.set(callControlId, session);
  console.info('[voice] session created', { callControlId, from, to });
  return session;
}

export function getVoiceSession(callControlId: string): VoiceSession | undefined {
  return sessions.get(callControlId);
}

export function getVoiceSessionByPhone(from: string): VoiceSession | undefined {
  for (const s of sessions.values()) {
    if (s.from === from) return s;
  }
  return undefined;
}

export function updateVoiceSession(
  callControlId: string,
  updates: Partial<Pick<VoiceSession, 'mode'>>,
): void {
  const s = sessions.get(callControlId);
  if (!s) return;
  if (updates.mode) s.mode = updates.mode;
}

export function appendVoiceHistory(callControlId: string, turns: VoiceTurn[]): void {
  const s = sessions.get(callControlId);
  if (!s) return;
  s.history.push(...turns);
  // Keep last 20 turns to avoid very long contexts on long calls
  if (s.history.length > 20) s.history = s.history.slice(-20);
}

export function deleteVoiceSession(callControlId: string): void {
  sessions.delete(callControlId);
  console.info('[voice] session removed', { callControlId });
}

export function listActiveSessions(): VoiceSession[] {
  return Array.from(sessions.values());
}

// ─── Claude voice agent ───────────────────────────────────────────────────

function voiceSystemPrompt(): string {
  const base = serverEnv('VOICE_GREETING') || '';
  return [
    'You are a helpful AI phone assistant. Respond in 1–3 short sentences suitable for being spoken aloud.',
    'Never use markdown, bullet points, code blocks, or special characters.',
    'Be warm, concise, and professional. If you cannot help, offer to take a message or suggest another way to reach the team.',
    base ? `Additional context: ${base}` : '',
  ]
    .filter(Boolean)
    .join(' ');
}

/**
 * Run one turn of the voice AI agent.
 * Returns the assistant's response text (to be spoken via Telnyx TTS),
 * or null if the AI call failed.
 */
export async function runVoiceAgent(
  callControlId: string,
  userText: string,
): Promise<string | null> {
  const key = serverEnv('ANTHROPIC_API_KEY')?.trim();
  if (!key) {
    console.warn('[voice] ANTHROPIC_API_KEY not set, cannot run AI agent');
    return null;
  }

  const session = getVoiceSession(callControlId);
  if (!session) return null;

  const priorMessages = session.history.map((t) => ({ role: t.role, content: t.content }));
  const model = serverEnv('ANTHROPIC_MODEL')?.trim() || 'claude-sonnet-4-6';

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 300,
        system: voiceSystemPrompt(),
        messages: [...priorMessages, { role: 'user', content: userText }],
      }),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => res.statusText);
      console.error('[voice] Anthropic error', res.status, err.slice(0, 200));
      return null;
    }

    const j = (await res.json()) as { content?: Array<{ type: string; text: string }> };
    const block = j.content?.find((b) => b.type === 'text');
    const reply = block?.text?.trim() || null;

    if (reply) {
      appendVoiceHistory(callControlId, [
        { role: 'user', content: userText },
        { role: 'assistant', content: reply },
      ]);
    }

    return reply;
  } catch (e) {
    console.error('[voice] AI error:', e);
    return null;
  }
}

// ─── Operator notifications ───────────────────────────────────────────────

export function formatCallAlert(session: VoiceSession, event: string): string {
  const dur = session.durationSecs();
  const lines = [
    `📞 ${event}`,
    `From: ${session.from}`,
    `To: ${session.to}`,
    `Mode: ${session.mode}`,
    dur > 0 ? `Duration: ${dur}s` : '',
  ];
  return lines.filter(Boolean).join('\n');
}
