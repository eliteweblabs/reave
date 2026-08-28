/**
 * Shared request parsing + rate limiting for public assistant chat endpoints
 * (`/api/site/assistant`, `/api/c/:slug/assistant`).
 */
import { parseAssistantHistory, type AssistantHistoryTurn } from './assistantHistory';
import { jsonResponse, readJsonBody } from './apiResponse';
import { checkPortalAssistantRateLimit } from './portalAssistantRateLimit';

export const ASSISTANT_MAX_MESSAGE_CHARS = 2_000;
export const ASSISTANT_MAX_HISTORY_TURNS = 20;
export const ASSISTANT_MAX_HISTORY_TURN_CHARS = 4_000;

export type ParsedAssistantPost<T extends AssistantHistoryTurn = AssistantHistoryTurn> =
  | { ok: true; message: string; history: T[]; body: Record<string, unknown> }
  | { ok: false; response: Response };

export async function parseAssistantPostRequest<T extends AssistantHistoryTurn = AssistantHistoryTurn>(
  request: Request,
): Promise<ParsedAssistantPost<T>> {
  const parsed = await readJsonBody(request);
  if (parsed instanceof Response) return { ok: false, response: parsed };
  const { body } = parsed;

  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!message) {
    return { ok: false, response: jsonResponse({ ok: false, error: 'message is required' }, 400) };
  }
  if (message.length > ASSISTANT_MAX_MESSAGE_CHARS) {
    return { ok: false, response: jsonResponse({ ok: false, error: 'Message is too long.' }, 400) };
  }

  const history = parseAssistantHistory<T>(
    body.history,
    ASSISTANT_MAX_HISTORY_TURNS,
    ASSISTANT_MAX_HISTORY_TURN_CHARS,
  );

  return { ok: true, message, history, body };
}

/** Returns a 429 response when rate-limited; otherwise null. */
export function assistantRateLimitResponse(rateKey: string): Response | null {
  const rate = checkPortalAssistantRateLimit(rateKey);
  if (!rate.ok) {
    return jsonResponse(
      {
        ok: false,
        error: "You're sending messages a bit fast — please wait a moment and try again.",
      },
      429,
    );
  }
  return null;
}
