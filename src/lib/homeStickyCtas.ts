/**
 * Homepage hero CTAs — dock into the features closing section, or hide at #contact.
 */
import { initFloatingWidgetSectionHide } from "./floatingWidgetSectionHide";

function initStickyCtaDock(el: HTMLElement, dock: HTMLElement): void {
  const row = el.querySelector<HTMLElement>(".home-sticky-ctas__row");
  let undockedHeight = 0;
  let rowOffset = 0;
  let ticking = false;

  const measureUndocked = () => {
    if (el.classList.contains("is-docked")) return;
    undockedHeight = el.offsetHeight;
    if (row) {
      rowOffset = row.getBoundingClientRect().top - el.getBoundingClientRect().top;
      dock.style.minHeight = `${Math.round(row.getBoundingClientRect().height)}px`;
    }
  };

  const floatingRowTop = () => window.innerHeight - undockedHeight + rowOffset;

  const sync = () => {
    ticking = false;
    if (!document.contains(el) || !document.contains(dock)) return;

    if (!el.classList.contains("is-docked")) measureUndocked();

    const dockTop = dock.getBoundingClientRect().top;
    const meetAt = el.classList.contains("is-docked")
      ? floatingRowTop()
      : (row ?? el).getBoundingClientRect().top;

    if (dockTop <= meetAt) {
      el.classList.add("is-docked");
      el.style.setProperty("--sticky-cta-dock-top", `${dockTop}px`);
    } else {
      el.classList.remove("is-docked");
      el.style.removeProperty("--sticky-cta-dock-top");
      measureUndocked();
    }
  };

  const onScrollOrResize = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(sync);
  };

  measureUndocked();
  sync();
  window.addEventListener("scroll", onScrollOrResize, { passive: true });
  window.addEventListener("resize", onScrollOrResize);
  window.visualViewport?.addEventListener("resize", onScrollOrResize);
}

export function initHomeStickyCtas(root?: HTMLElement | null): void {
  const el =
    root ??
    document.querySelector<HTMLElement>("[data-home-sticky-ctas]");
  if (!el || el.dataset.stickyCtasBound === "1") return;
  el.dataset.stickyCtasBound = "1";

  const dock = document.querySelector<HTMLElement>("[data-home-sticky-ctas-dock]");
  if (dock) {
    initStickyCtaDock(el, dock);
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
