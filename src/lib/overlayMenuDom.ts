/**
 * Shared right-drawer chrome — marketing hamburger and account menu.
 * One open overlay at a time. Marketing close is the hamburger (becomes X);
 * account close is the profile control (icon becomes X in place).
 */

export type OverlayMenuOpenFn = (root: HTMLElement | null, open: boolean) => void;

/** Admin account menu docks as a column at lg+ (tokens.css). Overlay below that. */
export const ACCOUNT_MENU_DOCK_MQ =
  typeof window !== "undefined" ? window.matchMedia("(min-width: 1024px)") : null;

const ACCOUNT_DOCK_MS = 320;

function prefersReducedMotion() {
  return Boolean(
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
}

function isAdminAccountDock() {
  return Boolean(ACCOUNT_MENU_DOCK_MQ?.matches && document.querySelector(".app-header--admin"));
}

function isDockedAccount(root: HTMLElement) {
  return root.hasAttribute("data-account-menu") && isAdminAccountDock();
}

function syncAccountMenuDock() {
  const account = getAccountOverlay();
  const docked = Boolean(
    account && (!account.hidden || account.dataset.dockClosing === "1") && isAdminAccountDock(),
  );
  document.documentElement.classList.toggle("account-menu-docked", docked);
  const panel = account?.querySelector<HTMLElement>(".overlay-menu-panel");
  if (panel) panel.setAttribute("aria-modal", docked ? "false" : "true");
}

let dockCloseTimer = 0;

function playDockOpen(root: HTMLElement) {
  if (!document.documentElement.classList.contains("account-menu-opening")) return;
  void root.offsetWidth;
  requestAnimationFrame(() => {
    document.documentElement.classList.remove("account-menu-opening");
  });
}

function cancelDockClose(root: HTMLElement) {
  if (root.dataset.dockClosing !== "1") return;
  delete root.dataset.dockClosing;
  document.documentElement.classList.remove("account-menu-closing");
  if (dockCloseTimer) {
    window.clearTimeout(dockCloseTimer);
    dockCloseTimer = 0;
  }
}

function finishCloseOverlay(root: HTMLElement) {
  if (dockCloseTimer) {
    window.clearTimeout(dockCloseTimer);
    dockCloseTimer = 0;
  }
  delete root.dataset.dockClosing;
  document.documentElement.classList.remove("account-menu-closing");
  if (root.hidden) {
    syncAccountMenuDock();
    syncOverlayMenuToggle();
    return;
  }
  root.hidden = true;
  const htmlClass = root.dataset.overlayHtmlClass;
  if (htmlClass) document.documentElement.classList.remove(htmlClass);
  syncAccountMenuDock();
  root.dispatchEvent(new CustomEvent("overlay-menu:close", { bubbles: true }));
  syncOverlayMenuToggle();
}

function syncOverlayMenuToggle() {
  const account = getAccountOverlay();
  const marketing = getMarketingOverlay();
  const accountOpen = Boolean(account && !account.hidden);
  const marketingOpen = Boolean(marketing && !marketing.hidden);
  const open = accountOpen || marketingOpen;
  document.querySelectorAll<HTMLButtonElement>("[data-overlay-menu-toggle]").forEach((toggle) => {
    const mode = toggle.dataset.overlayMenuToggleMode;
    const toggleOpen = mode === "nav" ? marketingOpen : open;
    toggle.classList.toggle("is-open", toggleOpen);
    toggle.setAttribute("aria-expanded", toggleOpen ? "true" : "false");
    toggle.setAttribute("aria-label", toggleOpen || mode === "dismiss" ? "Close menu" : "Open menu");
    if (mode === "dismiss") toggle.hidden = !open;
  });
  const profile = document.getElementById("topbar-profile-toggle");
  if (profile) {
    if (!profile.dataset.accountClosedLabel) {
      profile.dataset.accountClosedLabel = profile.getAttribute("aria-label") || "Account menu";
    }
    profile.setAttribute("aria-expanded", accountOpen ? "true" : "false");
    profile.setAttribute(
      "aria-label",
      accountOpen ? "Close account menu" : profile.dataset.accountClosedLabel || "Account menu",
    );
  }
  document.documentElement.classList.toggle("overlay-menu-open", open);
  syncAccountMenuDock();
  (
    window as Window & { __syncOverlayMenuScrollLock?: () => void }
  ).__syncOverlayMenuScrollLock?.();
}

function closeOverlay(root: HTMLElement) {
  if (root.hidden && root.dataset.dockClosing !== "1") return;
  if (root.dataset.dockClosing === "1") return;

  if (isDockedAccount(root) && !prefersReducedMotion()) {
    root.dataset.dockClosing = "1";
    document.documentElement.classList.add("account-menu-closing");
    const onEnd = (ev: TransitionEvent) => {
      if (ev.target !== root || ev.propertyName !== "transform") return;
      root.removeEventListener("transitionend", onEnd);
      finishCloseOverlay(root);
    };
    root.addEventListener("transitionend", onEnd);
    dockCloseTimer = window.setTimeout(() => finishCloseOverlay(root), ACCOUNT_DOCK_MS + 80);
    return;
  }

  finishCloseOverlay(root);
}

export function setOverlayMenuOpen(root: HTMLElement | null, open: boolean) {
  if (!root) return;

  if (open) {
    document.querySelectorAll<HTMLElement>("[data-overlay-menu]").forEach((el) => {
      if (el !== root) closeOverlay(el);
    });
    const wasClosing = root.dataset.dockClosing === "1";
    cancelDockClose(root);
    root.hidden = false;
    const htmlClass = root.dataset.overlayHtmlClass;
    if (htmlClass) document.documentElement.classList.add(htmlClass);
    if (!wasClosing && isDockedAccount(root) && !prefersReducedMotion()) {
      document.documentElement.classList.add("account-menu-opening");
    }
    syncAccountMenuDock();
    playDockOpen(root);
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

  ACCOUNT_MENU_DOCK_MQ?.addEventListener("change", () => {
    syncAccountMenuDock();
    (
      window as Window & { __syncOverlayMenuScrollLock?: () => void }
    ).__syncOverlayMenuScrollLock?.();
  });
}

export function installOverlayMenuGlobals() {
  const w = window as Window & { __setOverlayMenuOpen?: OverlayMenuOpenFn };
  w.__setOverlayMenuOpen = setOverlayMenuOpen;
}
