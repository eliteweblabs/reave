/** Browser-only beacons for chat turn recovery (see chatTurnEvents.ts on the server). */

import type { ChatTurnClientEvent } from './chatTurnRecovery';
import { composeTrace } from './chatComposeTrace';

export function postChatTurnTelemetry(
  threadId: string,
  event: ChatTurnClientEvent,
  detail?: Record<string, unknown>,
): void {
  composeTrace(`react.turn.${event}`, { threadId, ...detail }, 'warn', { snap: true });
  if (typeof fetch === 'undefined') return;
  void fetch(`/api/chats/${encodeURIComponent(threadId)}/telemetry`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event, detail: detail ?? undefined }),
  })
    .then((res) => {
      if (res.status === 401 && event !== 'recovery_auth_fail') {
        composeTrace('react.turn.recovery_auth_fail', { threadId, phase: event }, 'error', {
          snap: true,
        });
      }
    })
    .catch(() => {
      /* offline — local ring buffer still has composeTrace */
    });
}
