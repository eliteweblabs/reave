/**
 * Verifies the invariants that keep a chat turn from hanging. Run with:
 *   node --experimental-strip-types scripts/verify-chat-resilience.ts
 *
 * These are the failure modes that produced a permanent "Running Lighthouse
 * audit…" spinner with no reply, so each one is asserted directly rather than
 * left to manual testing.
 */
import assert from 'node:assert/strict';
import {
  AgentTimeoutError,
  agentToolTimeoutMs,
  canRunToolsConcurrently,
  createAgentDeadline,
  fetchWithDeadline,
  guardToolCall,
  isAgentTimeoutError,
  withDeadline,
  withDeadlineFallback,
} from '../src/lib/agentWatchdog.ts';
import {
  createChatAgentSseResponse,
  isSseStalledError,
  readSseStream,
  type ChatAgentSseEvent,
} from '../src/lib/chatAgentSse.ts';
import {
  pumpAgentStream,
  type AgentProgressEvent,
  type AgentTextEvent,
  type PumpableAgentStream,
} from '../src/lib/chatAgentPump.ts';

const results: string[] = [];
let failures = 0;

async function test(name: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
    results.push(`  ok   ${name}`);
  } catch (err) {
    failures++;
    results.push(`  FAIL ${name}\n         ${err instanceof Error ? err.message : String(err)}`);
  }
}

const never = () => new Promise<string>(() => {});
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function collectSse(res: Response, limitMs: number): Promise<ChatAgentSseEvent[]> {
  const events: ChatAgentSseEvent[] = [];
  const stopAt = Date.now() + limitMs;
  for await (const { data } of readSseStream(res.body!, undefined, { idleTimeoutMs: limitMs })) {
    events.push(data as ChatAgentSseEvent);
    if (Date.now() > stopAt) break;
  }
  return events;
}

// ---------------------------------------------------------------- deadlines

await test('withDeadline rejects a promise that never settles', async () => {
  const err = await withDeadline(never(), 60, 'Tool x').catch((e) => e);
  assert.ok(isAgentTimeoutError(err), 'expected an AgentTimeoutError');
  assert.match((err as AgentTimeoutError).message, /Tool x timed out/);
});

await test('withDeadline passes through a value that arrives in time', async () => {
  assert.equal(await withDeadline(Promise.resolve('ok'), 1_000, 'x'), 'ok');
});

await test('withDeadline propagates the original rejection, not a timeout', async () => {
  const err = await withDeadline(Promise.reject(new Error('boom')), 1_000, 'x').catch((e) => e);
  assert.equal((err as Error).message, 'boom');
});

await test('a late rejection after a timeout does not become an unhandled rejection', async () => {
  let unhandled: unknown;
  const onUnhandled = (e: unknown) => {
    unhandled = e;
  };
  process.on('unhandledRejection', onUnhandled);
  const slowFailure = new Promise<string>((_r, reject) => setTimeout(() => reject(new Error('late')), 40));
  await withDeadline(slowFailure, 10, 'x').catch(() => {});
  await sleep(120);
  process.off('unhandledRejection', onUnhandled);
  assert.equal(unhandled, undefined, 'a wedged promise must not crash the process later');
});

await test('withDeadlineFallback substitutes a value instead of throwing', async () => {
  const out = await withDeadlineFallback(never(), 40, 'Tool y', () => 'fallback');
  assert.equal(out, 'fallback');
});

await test('a run deadline reports expiry and clamps child budgets', async () => {
  const deadline = createAgentDeadline(120);
  assert.equal(deadline.expired(), false);
  assert.ok(deadline.clamp(60_000) <= 120, 'clamp must not exceed the remaining run budget');
  await sleep(160);
  assert.equal(deadline.expired(), true);
  assert.equal(deadline.remainingMs(), 0);
  assert.equal(deadline.clamp(60_000), 0);
});

await test('fetchWithDeadline gives up on a server that never responds', async () => {
  const { createServer } = await import('node:http');
  const server = createServer(() => {
    /* accept the connection and never answer — exactly what PSI can do */
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const port = (server.address() as { port: number }).port;
  try {
    const err = await fetchWithDeadline(`http://127.0.0.1:${port}/`, { timeoutMs: 150 }).catch(
      (e) => e,
    );
    assert.ok(err instanceof Error, 'expected the fetch to reject');
  } finally {
    server.closeAllConnections?.();
    server.close();
  }
});

// ------------------------------------------------------------- SSE contract

await test('the stream flushes a heartbeat immediately and keeps beating', async () => {
  const res = createChatAgentSseResponse(
    async (emit) => {
      await sleep(140); // a long tool call: no output of its own
      emit({ type: 'done', ok: true });
    },
    { heartbeatMs: 40 },
  );
  const events = await collectSse(res, 2_000);
  const heartbeats = events.filter((e) => e.type === 'heartbeat');
  assert.ok(heartbeats.length >= 2, `expected repeated heartbeats, got ${heartbeats.length}`);
  assert.equal(events[0]?.type, 'heartbeat', 'first byte must arrive without waiting for the agent');
  assert.equal(events.at(-1)?.type, 'done');
});

await test('a run that emits nothing still terminates the turn', async () => {
  const res = createChatAgentSseResponse(async () => {
    // The bug this guards: returning without ever resolving the turn.
  });
  const events = await collectSse(res, 2_000);
  const terminal = events.at(-1);
  assert.equal(terminal?.type, 'done', 'the stream must not close on a spinner');
  assert.equal((terminal as { interrupted?: boolean }).interrupted, true);
});

await test('a throwing run terminates the turn with an error event', async () => {
  const res = createChatAgentSseResponse(async () => {
    throw new Error('agent exploded');
  });
  const events = await collectSse(res, 2_000);
  const terminal = events.at(-1) as { type: string; error?: string };
  assert.equal(terminal.type, 'error');
  assert.equal(terminal.error, 'agent exploded');
});

await test('only the first terminal event is delivered', async () => {
  const res = createChatAgentSseResponse(async (emit) => {
    emit({ type: 'done', ok: true, title: 'first' });
    emit({ type: 'done', ok: true, title: 'second' });
    emit({ type: 'error', error: 'nope' });
  });
  const events = await collectSse(res, 2_000);
  const terminals = events.filter((e) => e.type === 'done' || e.type === 'error');
  assert.equal(terminals.length, 1);
  assert.equal((terminals[0] as { title?: string }).title, 'first');
});

await test('text and progress events survive the round trip in order', async () => {
  const res = createChatAgentSseResponse(async (emit) => {
    emit({ type: 'progress', phase: 'tool', round: 2, tool: 'lighthouse_audit', toolLabel: 'Running Lighthouse audit' });
    emit({ type: 'text', text: 'partial answer' });
    emit({ type: 'done', ok: true });
  });
  const events = (await collectSse(res, 2_000)).filter((e) => e.type !== 'heartbeat');
  assert.deepEqual(
    events.map((e) => e.type),
    ['progress', 'text', 'done'],
  );
  assert.equal((events[0] as { toolLabel?: string }).toolLabel, 'Running Lighthouse audit');
  assert.equal((events[1] as { text?: string }).text, 'partial answer');
});

await test('a stream that goes quiet raises SseStalledError instead of blocking', async () => {
  // A stream that is opened and then abandoned, i.e. a dropped connection that
  // was never closed: reads would otherwise never resolve.
  const body = new ReadableStream<Uint8Array>({ start() {} });
  const err = await (async () => {
    try {
      for await (const _ of readSseStream(body, undefined, { idleTimeoutMs: 80 })) {
        /* nothing will ever arrive */
      }
      return null;
    } catch (e) {
      return e;
    }
  })();
  assert.ok(isSseStalledError(err), 'expected SseStalledError');
});

await test('an aborted reader stops promptly', async () => {
  const body = new ReadableStream<Uint8Array>({ start() {} });
  const controller = new AbortController();
  setTimeout(() => controller.abort(), 40);
  const err = await (async () => {
    try {
      for await (const _ of readSseStream(body, controller.signal, { idleTimeoutMs: 5_000 })) {
        /* nothing */
      }
      return null;
    } catch (e) {
      return e;
    }
  })();
  assert.equal((err as Error)?.name, 'AbortError');
});

// --------------------------------------------------------------- run pumping

/** An agent stream stub: replays `events`, then finishes/throws/hangs. */
function fakeStream(
  events: (AgentProgressEvent | AgentTextEvent)[],
  ending: { reply: string } | { throws: unknown } | 'hang',
): PumpableAgentStream {
  let i = 0;
  return {
    async next() {
      if (i < events.length) return { done: false, value: events[i++] };
      if (ending === 'hang') return never() as never;
      if ('throws' in ending) throw ending.throws;
      return { done: true, value: ending.reply };
    },
  };
}

await test('a normal run returns its reply and forwards its events', async () => {
  const seen: (AgentProgressEvent | AgentTextEvent)[] = [];
  const outcome = await pumpAgentStream({
    stream: fakeStream(
      [
        { type: 'progress', phase: 'tool', tool: 'lighthouse_audit', toolLabel: 'Running Lighthouse audit' },
        { type: 'text', text: 'Here are the scores' },
      ],
      { reply: 'Here are the scores, in full.' },
    ),
    emit: (e) => seen.push(e),
    hardDeadlineAt: Date.now() + 5_000,
  });
  assert.deepEqual(outcome, { status: 'complete', reply: 'Here are the scores, in full.' });
  assert.deepEqual(seen.map((e) => e.type), ['progress', 'text']);
});

await test('a run that stops responding is abandoned, not waited on forever', async () => {
  const started = Date.now();
  const outcome = await pumpAgentStream({
    stream: fakeStream([{ type: 'progress', phase: 'tool', tool: 'lighthouse_audit' }], 'hang'),
    emit: () => {},
    hardDeadlineAt: Date.now() + 1_100,
    isCancelled: () => false,
  });
  assert.deepEqual(outcome, { status: 'timeout' });
  assert.ok(Date.now() - started < 4_000, 'must not outlast its deadline');
});

await test('a thrown agent error is reported rather than escaping the turn', async () => {
  const outcome = await pumpAgentStream({
    stream: fakeStream([], { throws: new Error('Anthropic 529') }),
    emit: () => {},
    hardDeadlineAt: Date.now() + 5_000,
    isCancelled: () => false,
  });
  assert.deepEqual(outcome, { status: 'failed', error: 'Anthropic 529' });
});

await test('a cancelled run is distinguished from a failed one', async () => {
  const outcome = await pumpAgentStream({
    stream: fakeStream([], { throws: new DOMException('Agent run aborted', 'AbortError') }),
    emit: () => {},
    hardDeadlineAt: Date.now() + 5_000,
    isCancelled: () => true,
  });
  assert.deepEqual(outcome, { status: 'cancelled' });
});

await test('an empty reply is still a completion the caller can substitute for', async () => {
  const outcome = await pumpAgentStream({
    stream: fakeStream([], { reply: '' }),
    emit: () => {},
    hardDeadlineAt: Date.now() + 5_000,
  });
  assert.deepEqual(outcome, { status: 'complete', reply: '' });
});

await test('the pump plus the SSE wrapper always deliver a terminal event', async () => {
  // The end-to-end shape of the route, with the worst-case agent: one that hangs.
  for (const ending of [{ reply: 'answer' }, { throws: new Error('nope') }, 'hang' as const]) {
    const res = createChatAgentSseResponse(
      async (emit) => {
        const outcome = await pumpAgentStream({
          stream: fakeStream([{ type: 'text', text: 'partial' }], ending),
          emit,
          hardDeadlineAt: Date.now() + 300,
          isCancelled: () => false,
        });
        emit({
          type: 'done',
          ok: true,
          assistantMessage: {
            role: 'assistant',
            content: outcome.status === 'complete' ? outcome.reply : `interrupted: ${outcome.status}`,
          },
          ...(outcome.status === 'complete' ? {} : { interrupted: true }),
        });
      },
      { heartbeatMs: 50 },
    );
    const events = await collectSse(res, 3_000);
    const terminal = events.at(-1) as { type: string; assistantMessage?: { content: string } };
    assert.equal(terminal.type, 'done', `no terminal event for ending ${JSON.stringify(ending)}`);
    assert.ok(
      terminal.assistantMessage?.content,
      'the turn must always carry a non-empty assistant message',
    );
  }
});

// ------------------------------------------------------------ tool contract

await test('a tool whose upstream never answers resolves as a readable timeout', async () => {
  const started = Date.now();
  const out = await guardToolCall('lighthouse_audit', 80, never);
  const parsed = JSON.parse(out) as { timed_out?: boolean; tool?: string; error?: string };
  assert.equal(parsed.timed_out, true);
  assert.equal(parsed.tool, 'lighthouse_audit');
  assert.match(parsed.error!, /timed out/);
  assert.ok(Date.now() - started < 2_000, 'the ceiling must be honoured promptly');
});

await test('a tool that throws resolves to an error result, not a failed run', async () => {
  const out = await guardToolCall('ssl_check', 1_000, async () => {
    throw new Error('socket hang up');
  });
  assert.deepEqual(JSON.parse(out), { error: 'socket hang up', tool: 'ssl_check' });
});

await test('a tool that rejects asynchronously is still caught', async () => {
  const out = await guardToolCall('dns_check', 1_000, () =>
    sleep(20).then(() => Promise.reject(new Error('ENOTFOUND'))),
  );
  assert.equal(JSON.parse(out).error, 'ENOTFOUND');
});

await test('a successful tool result passes through untouched', async () => {
  const payload = JSON.stringify({ ok: true, scores: { performance: 91 } });
  assert.equal(await guardToolCall('lighthouse_audit', 1_000, async () => payload), payload);
});

await test('user cancellation is not swallowed as a tool error', async () => {
  const err = await guardToolCall('fetch_url', 1_000, async () => {
    throw new DOMException('Agent run aborted', 'AbortError');
  }).catch((e) => e);
  assert.equal((err as Error).name, 'AbortError', 'Stop must abort the run, not continue it');
});

await test('per-tool ceilings exist and slow tools get more room', () => {
  assert.ok(agentToolTimeoutMs('lighthouse_audit') >= agentToolTimeoutMs('list_todos'));
  assert.ok(agentToolTimeoutMs('some_future_tool') > 0, 'unknown tools must still be bounded');
});

// ------------------------------------------------------- tool concurrency gate

await test('a batch of read-only audit tools may run concurrently', () => {
  assert.equal(
    canRunToolsConcurrently(['lighthouse_audit', 'ssl_check', 'check_links', 'dns_check']),
    true,
  );
  assert.equal(canRunToolsConcurrently(['fetch_url', 'brave_search']), true);
  assert.equal(canRunToolsConcurrently(['read_work', 'list_contacts', 'read_knowledge']), true);
});

await test('any writing tool in the batch forces sequential execution', () => {
  for (const writer of [
    'write_github_file',
    'write_file',
    'exec_command',
    'create_invoice',
    'delete_work',
    'send_email',
    'mark_email_junk',
    'sync_resend_dns',
    'set_client_portal',
    'delete_kinsta_site',
    'update_contact',
    'reset_invoices',
  ]) {
    assert.equal(
      canRunToolsConcurrently(['lighthouse_audit', writer]),
      false,
      `${writer} must never be parallelised`,
    );
  }
});

await test('a single call and unknown tools are never parallelised', () => {
  assert.equal(canRunToolsConcurrently(['lighthouse_audit']), false, 'nothing to parallelise');
  assert.equal(canRunToolsConcurrently([]), false);
  assert.equal(
    canRunToolsConcurrently(['lighthouse_audit', 'some_future_tool']),
    false,
    'unclassified tools must be assumed to write',
  );
});

console.log(`\nchat resilience checks\n${results.join('\n')}\n`);
console.log(failures ? `${failures} check(s) failed` : 'all checks passed');
process.exit(failures ? 1 : 0);
