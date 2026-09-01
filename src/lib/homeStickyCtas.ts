/**
 * Homepage hero CTAs — size the CSS sticky track, or hide at #contact.
 */
import { initBrowserUiBottomInset } from "./browserUiBottomInset";
import { initFloatingWidgetSectionHide } from "./floatingWidgetSectionHide";

/**
 * Bands that paint against the page canvas (the inverted chip marquee), so a
 * frosted pill scrolling over one loses its edge. Marked in markup with
 * `data-cta-backdrop`; the value lands on the CTA row as `data-cta-over`.
 */
const BACKDROP_SELECTOR = "[data-cta-backdrop]";

/**
 * The pill is docked to the viewport, so "is it over a band" is just "does the
 * band reach the strip the pill sits in". Shrink one observer's root down to
 * that strip and the band's own crossings are the only events needed — the flag
 * flips twice per band instead of once per scroll frame. Re-deriving it from
 * fresh rects while scrolling is what made the pill flash: a sticky element's
 * rect lags a scroll handler under momentum scroll, so around a band edge the
 * flag chattered on and off, restyling and re-rasterising the pill each time.
 */
function initStickyCtaBackdrop(el: HTMLElement): void {
  const bands = Array.from(
    document.querySelectorAll<HTMLElement>(BACKDROP_SELECTOR),
  );
  if (!bands.length || !("IntersectionObserver" in window)) return;

  const row = el.querySelector<HTMLElement>(".home-sticky-ctas__row") ?? el;
  const overlapping = new Set<HTMLElement>();
  let observer: IntersectionObserver | null = null;
  let strip = "";

  const paint = () => {
    let over: string | null = null;
    for (const band of overlapping) {
      over = band.dataset.ctaBackdrop || "invert";
      break;
    }
    if (over) el.dataset.ctaOver = over;
    else delete el.dataset.ctaOver;
  };

  const observe = () => {
    const pill = row.getBoundingClientRect();
    const viewport = window.visualViewport?.height ?? window.innerHeight;
    if (pill.height <= 0 || viewport <= 0) return;

    const pillTop = pill.top;
    const pillBottom = pillTop + pill.height;
    if (pillBottom <= 0 || pillTop >= viewport) return;

    /* Negative margins shrink the root to the pill's own strip. */
    const top = Math.max(0, Math.round(pillTop));
    const bottom = Math.max(0, Math.round(viewport - pillBottom));
    const rootMargin = `${-top}px 0px ${-bottom}px`;
    if (rootMargin === strip) return;
    strip = rootMargin;

    observer?.disconnect();
    overlapping.clear();
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const band = entry.target as HTMLElement;
          if (entry.isIntersecting) overlapping.add(band);
          else overlapping.delete(band);
        }
        paint();
      },
      { rootMargin },
    );
    for (const band of bands) observer.observe(band);
  };

  /* A mobile toolbar collapsing fires a burst of resizes — one remeasure will do. */
  let queued = 0;
  const remeasure = () => {
    if (queued) return;
    queued = requestAnimationFrame(() => {
      queued = 0;
      observe();
    });
  };

  observe();
  window.addEventListener("resize", remeasure);
  window.visualViewport?.addEventListener("resize", remeasure);
  document.fonts?.ready?.then(remeasure);
}

function syncStickyCtaHeight(el: HTMLElement, track: HTMLElement): void {
  const row = el.querySelector<HTMLElement>(".home-sticky-ctas__row");
  const dock = track.querySelector<HTMLElement>("[data-home-sticky-ctas-dock]");
  const height = Math.round((row ?? el).getBoundingClientRect().height);
  if (height > 0) {
    track.style.setProperty("--home-sticky-cta-h", `${height}px`);
    if (dock) dock.style.minHeight = `${height}px`;
  }
}

function initStickyCtaTrack(el: HTMLElement, track: HTMLElement): void {
  const measure = () => syncStickyCtaHeight(el, track);
  measure();
  window.addEventListener("resize", measure);
  window.visualViewport?.addEventListener("resize", measure);
  document.fonts?.ready?.then(() => measure());
}

export function initHomeStickyCtas(root?: HTMLElement | null): void {
  const el =
    root ??
    document.querySelector<HTMLElement>("[data-home-sticky-ctas]");
  if (!el || el.dataset.stickyCtasBound === "1") return;
  el.dataset.stickyCtasBound = "1";

  /* Size the track first — the pill's parked `top` is derived from that height. */
  const track = el.closest<HTMLElement>("[data-home-sticky-ctas-track]");
  if (track) {
    initStickyCtaTrack(el, track);
    initStickyCtaBackdrop(el);
    return;
  }

  initStickyCtaBackdrop(el);
  initFloatingWidgetSectionHide(
    el,
    "is-contact-occluding",
    '#contact, [data-home-section="contact"]',
  );
}

export function bootHomeStickyCtas(): void {
  initBrowserUiBottomInset();
  document
    .querySelectorAll<HTMLElement>("[data-home-sticky-ctas]")
    .forEach((el) => initHomeStickyCtas(el));
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootHomeStickyCtas, {
      once: true,
    });
  } else {
    bootHomeStickyCtas();
  }
  document.addEventListener("astro:page-load", bootHomeStickyCtas);
}
