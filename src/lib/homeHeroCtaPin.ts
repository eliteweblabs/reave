/**
 * Keep homepage hero CTAs ("How's it Work?", "Demo") fixed to the viewport
 * footer while scrolling, and slide them away at Contact like the live chat FAB.
 *
 * Body-reparent so hero overflow cannot trap position:fixed. Do not chase the
 * URL bar via visualViewport — that bounce is worse than a stable layout-fixed
 * footer. The shared pin only lifts for keyboard-sized viewport shrinks.
 */
import { initFixedVisualViewportPin } from "./fixedVisualViewportPin";
import { initFloatingWidgetSectionHide } from "./floatingWidgetSectionHide";

export function initHomeHeroCtaPin(copy?: HTMLElement | null): void {
  const el =
    copy ??
    document.querySelector<HTMLElement>("[data-hero-copy]");
  if (!el || el.dataset.ctaPinBound === "1") return;
  el.dataset.ctaPinBound = "1";

  // Escape hero overflow/transform so position:fixed stays viewport-relative.
  if (el.parentElement !== document.body) {
    document.body.appendChild(el);
  }

  // Safe-area is already in .home-hero-copy padding — pin is keyboard-only.
  initFixedVisualViewportPin(el, {
    axis: "bottom",
    includeSafeArea: false,
    insetPx: 0,
  });

  initFloatingWidgetSectionHide(
    el,
    "is-contact-occluding",
    '#contact, [data-home-section="contact"]',
  );
}

export function bootHomeHeroCtaPin(): void {
  document.querySelectorAll<HTMLElement>("[data-hero-copy]").forEach((el) => {
    initHomeHeroCtaPin(el);
  });
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootHomeHeroCtaPin, { once: true });
  } else {
    bootHomeHeroCtaPin();
  }
  document.addEventListener("astro:page-load", bootHomeHeroCtaPin);
}
