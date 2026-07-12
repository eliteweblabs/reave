/**
 * Deck action handlers — map action type → async runner.
 */
import type {
  DeckAction,
  DeckActionContext,
  DeckActionType,
  DeckDevice,
  DeckSurface,
} from './types';

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

function defaultDevice(surface: DeckSurface, device?: DeckDevice): DeckDevice {
  if (device) return device;
  return surface === 'desktop' ? 'laptop' : 'phone-hand';
}

function showPlaceholder(ctx: DeckActionContext, label?: string): void {
  if (ctx.gif) {
    ctx.gif.hidden = true;
    ctx.gif.removeAttribute('src');
  }
  if (ctx.frame) {
    ctx.frame.hidden = true;
    ctx.frame.removeAttribute('src');
  }
  if (ctx.placeholder) {
    ctx.placeholder.hidden = false;
    if (label) {
      const labelEl = ctx.placeholder.querySelector<HTMLElement>(
        '[data-deck-placeholder-label]',
      );
      if (labelEl) labelEl.textContent = label;
    }
  }
}

function loadGif(ctx: DeckActionContext, src: string, label?: string): Promise<void> {
  return new Promise((resolve) => {
    if (!ctx.gif) {
      showPlaceholder(ctx, label);
      resolve();
      return;
    }
    if (ctx.frame) {
      ctx.frame.hidden = true;
      ctx.frame.removeAttribute('src');
    }

    const img = ctx.gif;
    const done = (ok: boolean) => {
      img.onload = null;
      img.onerror = null;
      if (ok) {
        img.hidden = false;
        if (ctx.placeholder) ctx.placeholder.hidden = true;
      } else {
        showPlaceholder(ctx, label ?? 'Recording coming soon');
      }
      resolve();
    };

    if (img.getAttribute('src') === src && img.complete && img.naturalWidth > 0) {
      done(true);
      return;
    }

    img.onload = () => done(true);
    img.onerror = () => done(false);
    img.alt = label ?? '';
    img.src = src;
  });
}

/** Clear iframe / inject HTML / load GIF into the stage viewport. */
async function loadStageContent(
  ctx: DeckActionContext,
  opts: { url?: string; html?: string; gif?: string; label?: string },
): Promise<void> {
  const { viewport, frame } = ctx;
  ctx.clearHighlight();

  if (opts.gif) {
    viewport.querySelectorAll('[data-deck-html]').forEach((el) => el.remove());
    await loadGif(ctx, opts.gif, opts.label);
    return;
  }

  if (ctx.gif) {
    ctx.gif.hidden = true;
    ctx.gif.removeAttribute('src');
  }
  if (ctx.placeholder) ctx.placeholder.hidden = true;

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
  if (ctx.frame && !ctx.frame.hidden) {
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
    highlightInStage(ctx, selector);
  }
}

export const ACTION_HANDLERS: Record<DeckActionType, ActionHandler> = {
  'stage.set': async (action, ctx) => {
    const a = asSet(action);
    const device = defaultDevice(a.surface, a.device);
    ctx.setSurface(a.surface);
    ctx.setDevice(device);
    await loadStageContent(ctx, {
      url: a.url,
      html: a.html,
      gif: a.gif,
      label: undefined,
    });
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
      el.classList.toggle(
        'deck-nav-pulse',
        el.getAttribute('data-deck-nav') === tab,
      );
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
