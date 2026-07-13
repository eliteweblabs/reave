/**
 * Scroll-sales deck script types.
 * Source of truth for `/deck` — edit JSON scripts; player runs actions per beat.
 */

/** Bezel / surface size hint (legacy + layout). */
export type DeckSurface = 'phone' | 'desktop';

/**
 * Real-world placement for the recorded GIF.
 * GIF is mapped into the device screen — no finger tracking.
 */
export type DeckDevice =
  | 'phone-hand'
  | 'phone-desk'
  | 'laptop'
  | 'tablet';

export type DeckAction =
  | {
      type: 'stage.set';
      surface: DeckSurface;
      /** Real-world device situation (defaults from surface). */
      device?: DeckDevice;
      /** Recorded screen GIF mapped into the device. */
      gif?: string;
      /** Legacy interactive surface (iframe). Prefer gif. */
      url?: string;
      html?: string;
    }
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

/** Scroll-enter direction for full-bleed section video backgrounds. */
export type DeckVideoEnter = 'left' | 'right' | 'up' | 'down';

export type DeckSection = {
  id: string;
  title: string;
  summary?: string;
  /** Full-bleed background video (defaults to `/deck/videos/{id}.mp4`). */
  video?: string;
  /** Overflow transition direction when entering this section (auto-assigned if omitted). */
  videoEnter?: DeckVideoEnter;
  /**
   * When true, the prospect can toggle this section off (still on by default).
   * Hardcode per section in the JSON script.
   */
  optional?: boolean;
  /**
   * Short line used in the quote package description (defaults to title).
   * Hardcode when the quote wording should differ from the section title.
   */
  quoteLabel?: string;
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
  gif: HTMLImageElement | null;
  placeholder: HTMLElement | null;
  setSurface: (surface: DeckSurface) => void;
  setDevice: (device: DeckDevice) => void;
  clearHighlight: () => void;
};
