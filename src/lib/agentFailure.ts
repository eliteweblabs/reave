/**
 * Turn whatever the agent loop threw into a non-empty string for the chat
 * transcript. An Error with a blank message used to surface as the useless
 * "unknown error" note, which is how a crashed turn looked like a mystery.
 */
export const AGENT_EMPTY_REPLY_NOTE = 'the run finished without producing a reply';

export function describeAgentFailure(err: unknown): string {
  if (err instanceof Error) {
    const msg = err.message?.trim();
    if (msg) return msg;
    const name = err.name?.trim();
    if (name && name !== 'Error') return name;
    return 'Agent run failed';
  }
  if (typeof err === 'string' && err.trim()) return err.trim();
  if (err != null && typeof err === 'object' && 'message' in err) {
    const msg = String((err as { message?: unknown }).message ?? '').trim();
    if (msg) return msg;
  }
  return 'Agent run failed';
}
