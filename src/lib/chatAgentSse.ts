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

export function createChatAgentSseResponse(
  run: (
    emit: (event: ChatAgentSseEvent) => void,
    signal: AbortSignal,
  ) => Promise<void>,
  requestSignal?: AbortSignal,
): Response {
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: ChatAgentSseEvent) => {
        controller.enqueue(encodeChatAgentSseEvent(event));
      };
      const abort = new AbortController();
      if (requestSignal) {
        if (requestSignal.aborted) abort.abort();
        else requestSignal.addEventListener('abort', () => abort.abort(), { once: true });
      }
      try {
        await run(emit, abort.signal);
      } catch (err) {
        if (abort.signal.aborted) return;
        const message = err instanceof Error ? err.message : 'Agent run failed';
        emit({ type: 'error', error: message });
      } finally {
        controller.close();
      }
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
