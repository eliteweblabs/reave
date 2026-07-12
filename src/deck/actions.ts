/**
 * Deck action handlers — map action type → async runner.
 */
import type { DeckAction, DeckActionContext, DeckActionType } from './types';

type ActionHandler = (
  action: DeckAction,
  ctx: DeckActionContext,
) => void | Promise<void>;

function asSet(action: DeckAction): Extract<DeckAction, { type: 'stage.set' }> {
  return action as Extract<DeckAction, { type: 'stage.set' }>;
}

function asHighlight(
  action: DeckAction,
): Extract<DeckAction, { type: 'stage.highlight' }> {
  return action as Extract<DeckAction, { type: 'stage.highlight' }>;
}

function asCaption(
  action: DeckAction,
): Extract<DeckAction, { type: 'stage.caption' }> {
  return action as Extract<DeckAction, { type: 'stage.caption' }>;
}

function asNavPulse(
  action: DeckAction,
): Extract<DeckAction, { type: 'nav.pulse' }> {
  return action as Extract<DeckAction, { type: 'nav.pulse' }>;
}

function asWait(action: DeckAction): Extract<DeckAction, { type: 'wait' }> {
  return action as Extract<DeckAction, { type: 'wait' }>;
}

function wait(ms: number): Promise<void> {
  const reduced =
    typeof matchMedia !== 'undefined' &&
    matchMedia('(prefers-reduced-motion: reduce)').matches;
  const duration = reduced ? Math.min(ms, 80) : ms;
  return new Promise((resolve) => window.setTimeout(resolve, duration));
}

/** Clear iframe / inject HTML into the stage viewport. */
async function loadStageContent(
  ctx: DeckActionContext,
  opts: { url?: string; html?: string },
): Promise<void> {
  const { viewport, frame } = ctx;
  ctx.clearHighlight();

  if (opts.url) {
    viewport.querySelectorAll('[data-deck-html]').forEach((el) => el.remove());
    if (frame) {
      frame.hidden = false;
      if (frame.getAttribute('src') !== opts.url) {
        await new Promise<void>((resolve) => {
          const onLoad = () => {
            frame.removeEventListener('load', onLoad);
            resolve();
          };
          frame.addEventListener('load', onLoad);
          frame.src = opts.url!;
          // Same-origin instant loads may not fire load if already cached with same src
          window.setTimeout(() => resolve(), 800);
        });
      }
    }
    return;
  }

  if (opts.html !== undefined) {
    if (frame) {
      frame.hidden = true;
      frame.removeAttribute('src');
    }
    let host = viewport.querySelector<HTMLElement>('[data-deck-html]');
    if (!host) {
      host = document.createElement('div');
      host.dataset.deckHtml = '1';
      host.className = 'deck-stage-html';
      viewport.appendChild(host);
    }
    host.innerHTML = opts.html;
  }
}

function highlightInStage(ctx: DeckActionContext, selector: string): void {
  ctx.clearHighlight();
  const { viewport, frame } = ctx;

  const tryMark = (root: Document | Element): boolean => {
    let el: Element | null = null;
    try {
      el = root.querySelector(selector);
    } catch {
      return false;
    }
    if (!el) return false;
    el.classList.add('deck-highlight');
    el.setAttribute('data-deck-highlighted', '1');
    return true;
  };

  if (frame && !frame.hidden && frame.contentDocument) {
    if (tryMark(frame.contentDocument)) return;
  }
  tryMark(viewport);
}

async function highlightInStageAsync(
  ctx: DeckActionContext,
  selector: string,
): Promise<void> {
  highlightInStage(ctx, selector);
  // Iframe paint can lag one frame after src set
  if (ctx.frame && !ctx.frame.hidden) {
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
    highlightInStage(ctx, selector);
  }
}

export const ACTION_HANDLERS: Record<DeckActionType, ActionHandler> = {
  'stage.set': async (action, ctx) => {
    const a = asSet(action);
    ctx.setSurface(a.surface);
    await loadStageContent(ctx, { url: a.url, html: a.html });
  },

  'stage.highlight': async (action, ctx) => {
    await highlightInStageAsync(ctx, asHighlight(action).selector);
  },

  'stage.caption': (action, ctx) => {
    const text = asCaption(action).text;
    ctx.caption.textContent = text;
    ctx.caption.hidden = !text.trim();
  },

  'nav.pulse': (action, ctx) => {
    const tab = asNavPulse(action).tab;
    const root = ctx.frame?.contentDocument ?? ctx.viewport;
    root.querySelectorAll('[data-deck-nav]').forEach((el) => {
      el.classList.toggle('deck-nav-pulse', el.getAttribute('data-deck-nav') === tab);
    });
  },

  wait: async (action) => {
    await wait(asWait(action).ms);
  },
};

export async function runActions(
  actions: DeckAction[],
  ctx: DeckActionContext,
  signal?: AbortSignal,
): Promise<void> {
  for (const action of actions) {
    if (signal?.aborted) return;
    const handler = ACTION_HANDLERS[action.type];
    if (!handler) continue;
    await handler(action, ctx);
  }
}
