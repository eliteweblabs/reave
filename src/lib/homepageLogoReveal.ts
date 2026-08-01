export function initHomepageLogoReveal() {
  const header = document.querySelector<HTMLElement>(".app-header--homepage-logo-reveal");
  const logo = header?.querySelector<HTMLAnchorElement>(".app-header-logo");
  const hero = document.getElementById("home");

  if (!header || !logo || !hero) return false;
  if (header.dataset.logoRevealBound === "1") return true;
  header.dataset.logoRevealBound = "1";

  // `null`, not `false`, so the first sync always applies the measured state: a
  // seeded value that disagrees with the real scroll position would never be
  // corrected, since matching updates are skipped as no-ops.
  let logoVisible: boolean | null = null;

  const setVisible = (visible: boolean) => {
    if (visible === logoVisible) return;
    logoVisible = visible;

    header.classList.toggle("app-header--logo-visible", visible);
    logo.setAttribute("aria-hidden", visible ? "false" : "true");
    if (visible) {
      logo.removeAttribute("tabindex");
    } else {
      logo.setAttribute("tabindex", "-1");
    }
  };

  // Layout viewport only — matches IntersectionObserver (root: null). Comparing
  // getBoundingClientRect to visualViewport.height flips when the mobile URL bar
  // collapses and retriggers the logo cascade even though scroll didn't change.
  const heroInViewport = () => {
    const rect = hero.getBoundingClientRect();
    return rect.bottom > 0 && rect.top < window.innerHeight;
  };

  // Single source of truth: hidden while any part of the hero is on screen,
  // shown once the hero has left. Every trigger below remeasures through here
  // rather than tracking its own idea of where the hero is, so none of them can
  // leave the logo out of sync with the scroll position.
  const sync = () => setVisible(!heroInViewport());

  let scrollTick = 0;
  const scheduleSync = () => {
    if (scrollTick) return;
    scrollTick = window.requestAnimationFrame(() => {
      scrollTick = 0;
      sync();
    });
  };

  // Covers position changes that arrive without a scroll event: anchor jumps,
  // deep links, bfcache restores, and browser scroll restoration on reload.
  const observer = new IntersectionObserver(scheduleSync, {
    root: null,
    threshold: 0,
  });
  observer.observe(hero);

  // iOS can lag IntersectionObserver during momentum scroll; remeasure on scroll too.
  window.addEventListener("scroll", scheduleSync, { passive: true });
  window.addEventListener("resize", scheduleSync, { passive: true });
  window.addEventListener("orientationchange", scheduleSync, { passive: true });
  window.addEventListener("hashchange", scheduleSync);
  window.addEventListener("pageshow", scheduleSync);

  // Deep links (`/#about`, `/?section=about`) and the hash the footer nav's
  // scroll spy writes need no special case — they scroll the page, and that
  // scroll syncs the logo. Forcing the logo visible for them instead strands it
  // visible over the hero once the user scrolls back up.
  sync();

  return true;
}

export function bootHomepageLogoReveal() {
  initHomepageLogoReveal();
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootHomepageLogoReveal, { once: true });
  } else {
    bootHomepageLogoReveal();
  }

  document.addEventListener("astro:page-load", bootHomepageLogoReveal);
}
