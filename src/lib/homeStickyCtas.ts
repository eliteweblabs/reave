/**
 * Homepage hero CTAs — size the CSS sticky track, or hide at #contact.
 */
import { initFloatingWidgetSectionHide } from "./floatingWidgetSectionHide";

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
