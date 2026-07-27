/**
 * Pumps an agent run's events out to an SSE emitter under a hard deadline.
 *
 * Split out of the chat route because this loop is the last thing standing
 * between a wedged run and a chat that never answers: whatever the agent does —
 * finish, throw, get cancelled, or stop responding entirely — this always
 * returns, and the caller always knows which of those happened so it can write
 * the turn's reply. Deliberately typed structurally so it stays cheap to import
 * and to test.
 */
import { isAgentTimeoutError, withDeadline } from './agentWatchdog';

export type AgentProgressEvent = {
  type: 'progress';
  phase: 'thinking' | 'tool';
  round?: number;
  tool?: string;
  toolLabel?: string;
  concurrent?: number;
};

export type AgentTextEvent = { type: 'text'; text: string };

export type PumpableAgentStream = {
  next(): Promise<{ done?: boolean; value: AgentProgressEvent | AgentTextEvent | string }>;
};

export type PumpOutcome =
  /** The run finished normally; `reply` is its answer. */
  | { status: 'complete'; reply: string }
  /** The run stopped responding and was abandoned. */
  | { status: 'timeout' }
  /** The run was cancelled (Stop). */
  | { status: 'cancelled' }
  /** The run threw; `error` is the message. */
  | { status: 'failed'; error: string };

export async function pumpAgentStream(opts: {
  stream: PumpableAgentStream;
  emit: (event: AgentProgressEvent | AgentTextEvent) => void;
  /** Absolute time (epoch ms) after which the run is abandoned. */
  hardDeadlineAt: number;
  /** Whether the run has been cancelled, checked when the stream throws. */
  isCancelled?: () => boolean;
}): Promise<PumpOutcome> {
  const { stream, emit, hardDeadlineAt, isCancelled } = opts;

  while (true) {
    let next: Awaited<ReturnType<PumpableAgentStream['next']>>;
    try {
      next = await withDeadline(
        stream.next(),
        Math.max(1_000, hardDeadlineAt - Date.now()),
        'Agent run',
      );
    } catch (err) {
      if (isAgentTimeoutError(err)) return { status: 'timeout' };
      if (isCancelled?.()) return { status: 'cancelled' };
      return { status: 'failed', error: err instanceof Error ? err.message : 'Agent run failed' };
    }

    if (next.done) {
      return { status: 'complete', reply: typeof next.value === 'string' ? next.value : '' };
    }

    const event = next.value;
    if (typeof event === 'string') continue;
    if (event.type === 'progress' || event.type === 'text') emit(event);
  }
}
