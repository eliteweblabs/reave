/**
 * Homepage hero CTAs — size the CSS sticky track, or hide at #contact.
 */
import { initFloatingWidgetSectionHide } from "./floatingWidgetSectionHide";

/**
 * Bands that paint against the page canvas (the inverted chip marquee), so a
 * frosted pill scrolling over one loses its edge. Marked in markup with
 * `data-cta-backdrop`; the value lands on the CTA row as `data-cta-over`.
 */
const BACKDROP_SELECTOR = "[data-cta-backdrop]";

function initStickyCtaBackdrop(el: HTMLElement): void {
  const backdrops = Array.from(
    document.querySelectorAll<HTMLElement>(BACKDROP_SELECTOR),
  );
  if (!backdrops.length || !("IntersectionObserver" in window)) return;

  const row = el.querySelector<HTMLElement>(".home-sticky-ctas__row") ?? el;
  /* Only backdrops on screen are worth measuring on every scroll frame. */
  const onScreen = new Set<HTMLElement>();
  let frame = 0;

  const sync = () => {
    frame = 0;
    const pill = row.getBoundingClientRect();
    let over: string | null = null;
    for (const backdrop of onScreen) {
      const band = backdrop.getBoundingClientRect();
      const overlaps =
        band.bottom > pill.top &&
        band.top < pill.bottom &&
        band.right > pill.left &&
        band.left < pill.right;
      if (!overlaps) continue;
      over = backdrop.dataset.ctaBackdrop || "invert";
      break;
    }
    if (over) el.dataset.ctaOver = over;
    else delete el.dataset.ctaOver;
  };

  const schedule = () => {
    if (frame) return;
    frame = requestAnimationFrame(sync);
  };

  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const target = entry.target as HTMLElement;
      if (entry.isIntersecting) onScreen.add(target);
      else onScreen.delete(target);
    }
    schedule();
  });
  for (const backdrop of backdrops) observer.observe(backdrop);

  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule);
  schedule();
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
}

export function initHomeStickyCtas(root?: HTMLElement | null): void {
  const el =
    root ??
    document.querySelector<HTMLElement>("[data-home-sticky-ctas]");
  if (!el || el.dataset.stickyCtasBound === "1") return;
  el.dataset.stickyCtasBound = "1";
  initStickyCtaBackdrop(el);

  const track = el.closest<HTMLElement>("[data-home-sticky-ctas-track]");
  if (track) {
    initStickyCtaTrack(el, track);
    return;
  }

  initFloatingWidgetSectionHide(
    el,
    "is-contact-occluding",
    '#contact, [data-home-section="contact"]',
  );
}

export function bootHomeStickyCtas(): void {
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
