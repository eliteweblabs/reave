/**
 * Scroll-sales deck script types.
 * Source of truth for `/deck` — edit JSON scripts; player runs actions per beat.
 */

export type DeckSurface = 'phone' | 'desktop';

export type DeckAction =
  | { type: 'stage.set'; surface: DeckSurface; url?: string; html?: string }
  | { type: 'stage.highlight'; selector: string }
  | { type: 'stage.caption'; text: string }
  | { type: 'nav.pulse'; tab: string }
  | { type: 'wait'; ms: number };

export type DeckFeature = {
  id: string;
  title: string;
  body: string;
  /** Viewport-height budget for this beat (default 100). */
  scrollHeight?: number;
  actions: DeckAction[];
};

export type DeckSection = {
  id: string;
  title: string;
  summary?: string;
  features: DeckFeature[];
};

export type DeckScript = {
  id: string;
  title: string;
  /** Reserved for industry packs (`?type=salon`) — unused in phase 1. */
  preset?: string;
  sections: DeckSection[];
};

export type DeckActionType = DeckAction['type'];

export type DeckActionContext = {
  stage: HTMLElement;
  frame: HTMLIFrameElement | null;
  viewport: HTMLElement;
  caption: HTMLElement;
  setSurface: (surface: DeckSurface) => void;
  clearHighlight: () => void;
};
