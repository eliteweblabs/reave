export type ChatAgentSseEvent =
  | {
      type: 'progress';
      phase: 'thinking' | 'tool';
      round?: number;
      tool?: string;
      toolLabel?: string;
    }
  | { type: 'text'; text: string }
  | {
      type: 'done';
      ok: boolean;
      title?: string;
      userMessage?: { role: 'user'; content: string };
      assistantMessage?: { role: 'assistant'; content: string };
      error?: string;
    }
  | { type: 'error'; error: string };

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
 */
export function createChatAgentSseResponse(
  run: (emit: (event: ChatAgentSseEvent) => void) => Promise<void>,
): Response {
  let clientGone = false;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: ChatAgentSseEvent) => {
        if (clientGone) return;
        try {
          controller.enqueue(encodeChatAgentSseEvent(event));
        } catch {
          // Client disconnected mid-stream (tab closed, navigation, network
          // drop, phone locked). Stop trying to write to it, but let `run`
          // keep going in the background so it can still finish and persist.
          clientGone = true;
        }
      };
      try {
        await run(emit);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Agent run failed';
        emit({ type: 'error', error: message });
      } finally {
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

/** Consume a fetch SSE body; yields parsed { event, data } blocks. */
export async function* readSseStream(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<ParsedSseEvent, void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      throwIfClientAborted(signal);
      const { done, value } = await reader.read();
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
    reader.releaseLock();
  }
}

function throwIfClientAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
}
