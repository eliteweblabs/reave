/**
 * Scroll-driven deck player — activates feature beats via IntersectionObserver
 * and runs their action lists against the sticky stage.
 */
import { runActions } from './actions';
import type {
  DeckActionContext,
  DeckDevice,
  DeckFeature,
  DeckScript,
  DeckSurface,
} from './types';

export type DeckPlayerOptions = {
  script: DeckScript;
  root: HTMLElement;
  stage: HTMLElement;
  viewport: HTMLElement;
  frame: HTMLIFrameElement | null;
  caption: HTMLElement;
  gif?: HTMLImageElement | null;
  placeholder?: HTMLElement | null;
  onBeatChange?: (feature: DeckFeature | null, sectionId: string | null) => void;
};

const DEVICE_CLASSES = [
  'deck-stage--phone-hand',
  'deck-stage--phone-desk',
  'deck-stage--laptop',
  'deck-stage--tablet',
  'deck-stage--phone',
  'deck-stage--desktop',
] as const;

function createContext(opts: DeckPlayerOptions): DeckActionContext {
  return {
    stage: opts.stage,
    frame: opts.frame,
    viewport: opts.viewport,
    caption: opts.caption,
    gif: opts.gif ?? null,
    placeholder: opts.placeholder ?? null,
    setSurface(surface: DeckSurface) {
      opts.stage.dataset.surface = surface;
    },
    setDevice(device: DeckDevice) {
      opts.stage.dataset.device = device;
      for (const c of DEVICE_CLASSES) opts.stage.classList.remove(c);
      opts.stage.classList.add(`deck-stage--${device}`);
      if (device === 'laptop') {
        opts.stage.classList.add('deck-stage--desktop');
      } else {
        opts.stage.classList.add('deck-stage--phone');
      }
    },
    clearHighlight() {
      const roots: Array<Document | Element> = [opts.viewport];
      if (opts.frame?.contentDocument) roots.push(opts.frame.contentDocument);
      for (const root of roots) {
        root.querySelectorAll('[data-deck-highlighted]').forEach((el) => {
          el.classList.remove('deck-highlight');
          el.removeAttribute('data-deck-highlighted');
        });
      }
    },
  };
}

export function attachDeckPlayer(opts: DeckPlayerOptions): () => void {
  const ctx = createContext(opts);
  const beats = Array.from(
    opts.root.querySelectorAll<HTMLElement>('[data-deck-feature]'),
  );

  let activeId: string | null = null;
  let runToken = 0;
  let abort: AbortController | null = null;

  const featureIndex = new Map<string, DeckFeature>();
  const sectionByFeature = new Map<string, string>();
  for (const section of opts.script.sections) {
    for (const feature of section.features) {
      featureIndex.set(feature.id, feature);
      sectionByFeature.set(feature.id, section.id);
    }
  }

  async function activate(featureId: string): Promise<void> {
    if (featureId === activeId) return;
    activeId = featureId;
    const feature = featureIndex.get(featureId) ?? null;
    const sectionId = sectionByFeature.get(featureId) ?? null;

    beats.forEach((el) => {
      el.classList.toggle('is-active', el.dataset.deckFeature === featureId);
    });
    opts.root
      .querySelectorAll('[data-deck-section]')
      .forEach((el) => {
        el.classList.toggle(
          'is-active',
          el.getAttribute('data-deck-section') === sectionId,
        );
      });

    opts.onBeatChange?.(feature, sectionId);

    abort?.abort();
    abort = new AbortController();
    const token = ++runToken;
    if (!feature) return;

    // Use feature title on the placeholder while a GIF is missing / loading.
    if (ctx.placeholder) {
      const labelEl = ctx.placeholder.querySelector<HTMLElement>(
        '[data-deck-placeholder-label]',
      );
      if (labelEl) labelEl.textContent = feature.title;
    }

    await runActions(feature.actions, ctx, abort.signal);
    if (token !== runToken) return;
  }

  const ratios = new Map<Element, number>();

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        ratios.set(entry.target, entry.intersectionRatio);
      }
      let best: HTMLElement | null = null;
      let bestRatio = 0;
      for (const beat of beats) {
        const r = ratios.get(beat) ?? 0;
        if (r > bestRatio) {
          bestRatio = r;
          best = beat;
        }
      }
      if (best && bestRatio > 0.15) {
        const id = best.dataset.deckFeature;
        if (id) void activate(id);
      }
    },
    {
      root: null,
      threshold: [0, 0.15, 0.25, 0.4, 0.55, 0.7, 0.85, 1],
      rootMargin: '-10% 0px -35% 0px',
    },
  );

  beats.forEach((b) => observer.observe(b));

  // Kick first beat if already in view
  const first = beats[0];
  if (first?.dataset.deckFeature) {
    void activate(first.dataset.deckFeature);
  }

  return () => {
    observer.disconnect();
    abort?.abort();
  };
}
