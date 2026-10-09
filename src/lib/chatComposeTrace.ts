/** Client-only — backed by public/admin/chat-compose-trace.js on window. */

type ComposeTraceLevel = 'info' | 'warn' | 'error';

type ComposeTraceWindow = Window & {
  __reaveChatComposeTrace?: {
    log?: (
      event: string,
      detail?: Record<string, unknown>,
      level?: ComposeTraceLevel,
      opts?: { snap?: boolean },
    ) => void;
  };
};

export function composeTrace(
  event: string,
  detail?: Record<string, unknown>,
  level: ComposeTraceLevel = 'info',
  opts?: { snap?: boolean },
): void {
  if (typeof window === 'undefined') return;
  try {
    (window as ComposeTraceWindow).__reaveChatComposeTrace?.log?.(event, detail, level, opts);
  } catch {
    /* ignore */
  }
}
