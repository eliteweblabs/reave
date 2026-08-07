export type ChatAgentSseEvent =
  | {
      type: 'progress';
      phase: 'thinking' | 'tool';
      round?: number;
      tool?: string;
      toolLabel?: string;
      concurrent?: number;
    }
  | { type: 'text'; text: string }
  | {
      type: 'done';
      ok: boolean;
      title?: string;
      userMessage?: { role: 'user'; content: string };
      assistantMessage?: {
        role: 'assistant';
        content: string;
        agent_usage?: import('./agentUsage').AgentUsageSummary | null;
      };
      agent_usage?: import('./agentUsage').AgentUsageSummary | null;
      error?: string;
      /** True when the reply is a partial/failure notice rather than a real answer. */
      interrupted?: boolean;
    }
  | { type: 'error'; error: string }
  /**
   * Liveness only. Long tool calls (a two-strategy Lighthouse run takes a
   * minute) produce no output, and an idle HTTP response gets dropped by mobile
   * radios and reverse proxies. A heartbeat keeps bytes flowing and lets the
   * client tell "still working" apart from "socket is dead".
   */
  | { type: 'heartbeat'; t: number; elapsedMs: number };

const TERMINAL_EVENT_TYPES = new Set(['done', 'error']);

export const CHAT_SSE_HEARTBEAT_MS = 10_000;

export function encodeChatAgentSseEvent(event: ChatAgentSseEvent): Uint8Array {
  const payload = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
  return new TextEncoder().encode(payload);
}

/**
 * Runs `run` to completion and streams its events over SSE while a client is
 * listening. Deliberately does NOT tie the agent run to the HTTP connection's
 * lifetime: a dropped network connection, a closed tab, browser navigation,
 * or a mobile browser suspending the page mid-task must not kill a multi-step
 * agent run. `run` keeps executing on the server even after the client goes
 * away — `emit` becomes a no-op once the stream can no longer be written to,
 * but the caller is still responsible for persisting the final result (e.g.
 * to the chat thread) so the user gets their answer/report when they come
 * back, instead of the run silently vanishing with nothing saved. The only
 * way to actually stop the run early is an explicit cancellation signal
 * passed by the caller (e.g. from a "Stop" button), not client disconnect.
 *
 * Two invariants this wrapper enforces on behalf of every caller:
 *  - the stream emits a heartbeat at least every `CHAT_SSE_HEARTBEAT_MS`, so it
 *    is never idle long enough for an intermediary to hang up on it;
 *  - the stream never closes without a terminal (`done`/`error`) event, so the
 *    client is never left holding an open spinner with nothing to resolve it.
 */
export function createChatAgentSseResponse(
  run: (emit: (event: ChatAgentSseEvent) => void) => Promise<void>,
  opts: { heartbeatMs?: number } = {},
): Response {
  const heartbeatMs = opts.heartbeatMs ?? CHAT_SSE_HEARTBEAT_MS;
  let clientGone = false;
  let sentTerminal = false;
  const startedAt = Date.now();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: ChatAgentSseEvent) => {
        if (clientGone) return;
        if (TERMINAL_EVENT_TYPES.has(event.type)) {
          // Exactly one terminal event per stream: a second one would make the
          // client resolve a turn it has already finished.
          if (sentTerminal) return;
          sentTerminal = true;
        }
        try {
          controller.enqueue(encodeChatAgentSseEvent(event));
        } catch {
          // Client disconnected mid-stream (tab closed, navigation, network
          // drop, phone locked). Stop trying to write to it, but let `run`
          // keep going in the background so it can still finish and persist.
          clientGone = true;
        }
      };

      // Flush immediately so the browser sees headers + first bytes without
      // waiting on the first real event (proxies buffer until something lands).
      emit({ type: 'heartbeat', t: Date.now(), elapsedMs: 0 });
      const heartbeat = setInterval(() => {
        if (clientGone || sentTerminal) return;
        emit({ type: 'heartbeat', t: Date.now(), elapsedMs: Date.now() - startedAt });
      }, heartbeatMs);
      (heartbeat as unknown as { unref?: () => void }).unref?.();

      try {
        await run(emit);
        if (!sentTerminal) {
          // `run` returned without resolving the turn. Rather than closing on a
          // spinner, tell the client the turn is over so it can fall back to
          // reading the persisted thread.
          emit({
            type: 'done',
            ok: true,
            interrupted: true,
            error: 'The response ended without a result.',
          });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Agent run failed';
        emit({ type: 'error', error: message });
      } finally {
        clearInterval(heartbeat);
        if (!clientGone) {
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        }
      }
    },
    cancel() {
      // The reader (client) went away. `run` above is still executing and
      // will finish + persist on its own; we just stop trying to stream to it.
      clientGone = true;
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Tell nginx-style proxies (and Railway's edge) not to buffer the body:
      // buffering would swallow the heartbeats this design depends on.
      'X-Accel-Buffering': 'no',
    },
  });
}

export type ParsedSseEvent = { event: string; data: Record<string, unknown> };

/** Parse one SSE block (event + data lines). */
export function parseSseBlock(block: string): ParsedSseEvent | null {
  const lines = block.split('\n');
  let event = 'message';
  const dataLines: string[] = [];
  for (const line of lines) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
  }
  if (!dataLines.length) return null;
  try {
    const data = JSON.parse(dataLines.join('\n')) as Record<string, unknown>;
    return { event, data };
  } catch {
    return null;
  }
}

/**
 * The stream went quiet for longer than the server's heartbeat interval allows,
 * which means the connection is dead even though nothing reported an error.
 * Callers should stop reading and recover from the server's persisted state.
 */
export class SseStalledError extends Error {
  constructor(idleMs: number) {
    super(`No data from the server for ${Math.round(idleMs / 1000)}s`);
    this.name = 'SseStalledError';
  }
}

export function isSseStalledError(err: unknown): err is SseStalledError {
  return (err as { name?: string })?.name === 'SseStalledError';
}

/**
 * Consume a fetch SSE body; yields parsed { event, data } blocks.
 *
 * With `idleTimeoutMs` set, a connection that stops delivering bytes (mobile
 * network handoff, proxy hang-up, laptop sleep) raises `SseStalledError`
 * instead of blocking forever on a read that will never resolve.
 */
export async function* readSseStream(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
  opts: { idleTimeoutMs?: number } = {},
): AsyncGenerator<ParsedSseEvent, void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const idleTimeoutMs = opts.idleTimeoutMs ?? 0;
  let buffer = '';
  let abandoned = false;

  // A read already in flight cannot be interrupted by checking the signal on the
  // next pass, so both the idle deadline and cancellation race the read itself.
  const read = async (): Promise<ReadableStreamReadResult<Uint8Array>> => {
    const racers: Promise<ReadableStreamReadResult<Uint8Array>>[] = [reader.read()];
    let timer: ReturnType<typeof setTimeout> | undefined;
    let onAbort: (() => void) | undefined;

    if (idleTimeoutMs > 0) {
      racers.push(
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new SseStalledError(idleTimeoutMs)), idleTimeoutMs);
        }),
      );
    }
    if (signal) {
      racers.push(
        new Promise<never>((_resolve, reject) => {
          onAbort = () => reject(new DOMException('Aborted', 'AbortError'));
          if (signal.aborted) onAbort();
          else signal.addEventListener('abort', onAbort, { once: true });
        }),
      );
    }

    try {
      return await Promise.race(racers);
    } finally {
      if (timer) clearTimeout(timer);
      if (onAbort) signal?.removeEventListener('abort', onAbort);
    }
  };

  try {
    while (true) {
      throwIfClientAborted(signal);
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try {
        chunk = await read();
      } catch (err) {
        // We are walking away from an in-flight read, so the reader has to be
        // cancelled rather than merely released.
        abandoned = true;
        throw err;
      }
      const { done, value } = chunk;
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split('\n\n');
      buffer = blocks.pop() ?? '';
      for (const block of blocks) {
        const trimmed = block.trim();
        if (!trimmed) continue;
        const parsed = parseSseBlock(trimmed);
        if (parsed) yield parsed;
      }
    }
    const tail = buffer.trim();
    if (tail) {
      const parsed = parseSseBlock(tail);
      if (parsed) yield parsed;
    }
  } finally {
    if (abandoned) {
      // Leaving a pending read would keep the socket and its lock alive.
      void reader.cancel().catch(() => {});
    } else {
      reader.releaseLock();
    }
  }
}

function throwIfClientAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
}
