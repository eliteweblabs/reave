/** Shared copy for turns that died without a normal assistant reply. */

export const CHAT_INTERRUPTED_NOTE =
  '_(This response was interrupted before it finished — the run ended without saving a reply ' +
  '(often a deploy restart or dropped connection, not necessarily something you did). ' +
  "Send the message again and I'll redo the work.)_";

export const CHAT_CONNECTION_LOST_NOTE =
  '_(The connection dropped before this reply could finish. The agent may still have completed ' +
  'the work server-side — refresh this thread or check your message history. If nothing new ' +
  "appears, send the message again.)_";

/** Shorter inline note while streaming recovery fails (matches persisted intent). */
export const CHAT_CONNECTION_LOST_STREAM_HINT =
  'The connection to the server dropped and I could not recover this reply. The work may ' +
  'have finished server-side — reopen this session to check, or send the message again.';

export type ChatTurnReconcileVariant = 'interrupted' | 'connection_lost';

export function reconcileNoteForVariant(variant: ChatTurnReconcileVariant): string {
  return variant === 'connection_lost' ? CHAT_CONNECTION_LOST_NOTE : CHAT_INTERRUPTED_NOTE;
}

/** Client → POST /api/chats/:id/telemetry */
export const CHAT_TURN_CLIENT_EVENTS = [
  'stream_stalled',
  'stream_idle_abort',
  'recovery_started',
  'recovery_success',
  'recovery_partial',
  'recovery_reconciled',
  'recovery_connection_lost',
  'recovery_auth_fail',
  'recovery_adopt',
  'recovery_abandoned',
] as const;

export type ChatTurnClientEvent = (typeof CHAT_TURN_CLIENT_EVENTS)[number];

export function isChatTurnClientEvent(value: string): value is ChatTurnClientEvent {
  return (CHAT_TURN_CLIENT_EVENTS as readonly string[]).includes(value);
}

/** Server-emitted lifecycle events (also stored in chat_turn_events). */
export const CHAT_TURN_SERVER_EVENTS = [
  'run_start',
  'run_end',
  'persist_ok',
  'persist_fail',
  'reconcile',
] as const;

export type ChatTurnServerEvent = (typeof CHAT_TURN_SERVER_EVENTS)[number];

export type ChatTurnEventName = ChatTurnClientEvent | ChatTurnServerEvent;
