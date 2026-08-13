/**
 * Homepage hero CTAs — pinned from the top of the large viewport; hide when
 * #contact scrolls into view.
 */
import { initFloatingWidgetSectionHide } from "./floatingWidgetSectionHide";

export function initHomeStickyCtas(root?: HTMLElement | null): void {
  const el =
    root ??
    document.querySelector<HTMLElement>("[data-home-sticky-ctas]");
  if (!el || el.dataset.stickyCtasBound === "1") return;
  el.dataset.stickyCtasBound = "1";

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
