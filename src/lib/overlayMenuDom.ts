/**
 * Shared right-drawer chrome — marketing hamburger and account menu.
 * One open overlay at a time; the header toggle is the close control.
 */

export type OverlayMenuOpenFn = (root: HTMLElement | null, open: boolean) => void;

function anyOverlayOpen(): boolean {
  return Boolean(document.querySelector(".overlay-menu:not([hidden])"));
}

function syncOverlayMenuToggle() {
  const open = anyOverlayOpen();
  document.querySelectorAll<HTMLButtonElement>("[data-overlay-menu-toggle]").forEach((toggle) => {
    const mode = toggle.dataset.overlayMenuToggleMode;
    toggle.classList.toggle("is-open", open);
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    toggle.setAttribute("aria-label", open || mode === "dismiss" ? "Close menu" : "Open menu");
    if (mode === "dismiss") toggle.hidden = !open;
  });
  const account = document.getElementById("topbar-profile-menu");
  const profile = document.getElementById("topbar-profile-toggle");
  profile?.setAttribute("aria-expanded", account && !account.hidden ? "true" : "false");
  document.documentElement.classList.toggle("overlay-menu-open", open);
  (
    window as Window & { __syncOverlayMenuScrollLock?: () => void }
  ).__syncOverlayMenuScrollLock?.();
}

function closeOverlay(root: HTMLElement) {
  if (root.hidden) return;
  root.hidden = true;
  const htmlClass = root.dataset.overlayHtmlClass;
  if (htmlClass) document.documentElement.classList.remove(htmlClass);
  root.dispatchEvent(new CustomEvent("overlay-menu:close", { bubbles: true }));
}

export function setOverlayMenuOpen(root: HTMLElement | null, open: boolean) {
  if (!root) return;

  if (open) {
    document.querySelectorAll<HTMLElement>("[data-overlay-menu]").forEach((el) => {
      if (el !== root) closeOverlay(el);
    });
    root.hidden = false;
    const htmlClass = root.dataset.overlayHtmlClass;
    if (htmlClass) document.documentElement.classList.add(htmlClass);
    root.dispatchEvent(new CustomEvent("overlay-menu:open", { bubbles: true }));
  } else {
    closeOverlay(root);
  }

  syncOverlayMenuToggle();
}

export function getAccountOverlay(): HTMLElement | null {
  return document.getElementById("topbar-profile-menu");
}

export function getMarketingOverlay(): HTMLElement | null {
  return document.querySelector("[data-marketing-menu]");
}

function openOverlayFromToggle(toggle: HTMLButtonElement) {
  const account = getAccountOverlay();
  const marketing = getMarketingOverlay();
  if (account && !account.hidden) {
    setOverlayMenuOpen(account, false);
    return;
  }
  if (marketing && !marketing.hidden) {
    setOverlayMenuOpen(marketing, false);
    return;
  }
  if (toggle.dataset.overlayMenuToggleMode === "nav" && marketing) {
    setOverlayMenuOpen(marketing, true);
  }
}

export function bindOverlayMenuChrome() {
  if (typeof document === "undefined") return;
  if (document.documentElement.dataset.overlayMenuChromeBound === "1") return;
  document.documentElement.dataset.overlayMenuChromeBound = "1";

  document.addEventListener("click", (ev) => {
    const target = ev.target;
    if (!(target instanceof Element)) return;

    const toggle = target.closest<HTMLButtonElement>("[data-overlay-menu-toggle]");
    if (toggle) {
      ev.stopPropagation();
      openOverlayFromToggle(toggle);
      return;
    }

    const dismiss = target.closest("[data-overlay-menu-backdrop], [data-overlay-menu-close]");
    if (!dismiss) return;
    const root = dismiss.closest<HTMLElement>("[data-overlay-menu]");
    if (root) setOverlayMenuOpen(root, false);
  });

  document.addEventListener("keydown", (ev) => {
    if (ev.key !== "Escape") return;
    document.querySelectorAll<HTMLElement>("[data-overlay-menu]").forEach((el) => {
      if (!el.hidden) setOverlayMenuOpen(el, false);
    });
  });
}

export function installOverlayMenuGlobals() {
  const w = window as Window & { __setOverlayMenuOpen?: OverlayMenuOpenFn };
  w.__setOverlayMenuOpen = setOverlayMenuOpen;
}
