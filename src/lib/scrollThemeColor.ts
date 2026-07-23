type Rgb = readonly [number, number, number];

export type ScrollThemeColorOptions = {
  /** Color at scroll position 0 (top of page). */
  primary: string;
  /** Color at max scroll (bottom of page). */
  secondary: string;
};

function parseHex(hex: string): Rgb {
  const h = hex.trim().replace(/^#/, "");
  if (h.length !== 3 && h.length !== 6) {
    throw new Error(`Expected #rgb or #rrggbb, got "${hex}"`);
  }
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  return [
    Number.parseInt(full.slice(0, 2), 16),
    Number.parseInt(full.slice(2, 4), 16),
    Number.parseInt(full.slice(4, 6), 16),
  ];
}

function rgbToHex([r, g, b]: Rgb): string {
  const clamp = (n: number) => Math.round(Math.min(255, Math.max(0, n)));
  return `#${[clamp(r), clamp(g), clamp(b)]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("")}`;
}

function lerpRgb(a: Rgb, b: Rgb, t: number): string {
  const mix = Math.min(1, Math.max(0, t));
  return rgbToHex([
    a[0] + (b[0] - a[0]) * mix,
    a[1] + (b[1] - a[1]) * mix,
    a[2] + (b[2] - a[2]) * mix,
  ]);
}

function themeColorMeta(): HTMLMetaElement {
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.appendChild(meta);
  }
  return meta;
}

function scrollProgress(): number {
  const scrollTop = window.scrollY || document.documentElement.scrollTop;
  const scrollHeight =
    document.documentElement.scrollHeight -
    document.documentElement.clientHeight;
  if (scrollHeight <= 0) return 0;
  return Math.min(1, Math.max(0, scrollTop / scrollHeight));
}

/** Same nudge used on tomsens.com so iOS Safari re-reads theme-color. */
function refreshIosThemeColorChrome(): void {
  window.scrollBy(0, -1);
  window.scrollBy(0, 1);
}

/**
 * Interpolate `<meta name="theme-color">` between two hex colors as the user
 * scrolls. Useful on iOS Safari / standalone PWAs where theme-color tints the
 * status bar and browser chrome.
 *
 * Ported from the inline script on tomsens.com (scroll percentage × primary→secondary).
 */
export function attachScrollThemeColor(opts: ScrollThemeColorOptions): () => void {
  const primary = parseHex(opts.primary);
  const secondary = parseHex(opts.secondary);
  const meta = themeColorMeta();

  function update() {
    meta.content = lerpRgb(primary, secondary, scrollProgress());
  }

  let ticking = false;
  function onChange() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      update();
      ticking = false;
    });
  }

  function init() {
    update();
    refreshIosThemeColorChrome();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }

  window.addEventListener("scroll", onChange, { passive: true });
  window.addEventListener("resize", onChange);

  return () => {
    document.removeEventListener("DOMContentLoaded", init);
    window.removeEventListener("scroll", onChange);
    window.removeEventListener("resize", onChange);
  };
}
