export function initHomepageLogoReveal() {
  const header = document.querySelector<HTMLElement>(".app-header--homepage-logo-reveal");
  const logo = header?.querySelector<HTMLAnchorElement>(".app-header-logo");
  const hero = document.getElementById("home");

  if (!header || !logo || !hero) return false;
  if (header.dataset.logoRevealBound === "1") return true;
  header.dataset.logoRevealBound = "1";

  const partCount = header.querySelectorAll(".app-header-logo-part").length;
  const animMs = 550 + Math.max(0, partCount - 1) * 100;
  let hideTimer: ReturnType<typeof setTimeout> | null = null;
  let logoVisible = false;

  const setVisible = (visible: boolean) => {
    if (visible === logoVisible) return;

    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }

    if (visible) {
      header.classList.remove("app-header--logo-hiding");
      // Force keyframe animations to re-run when scrolling back down.
      header.classList.remove("app-header--logo-visible");
      void header.offsetWidth;
      header.classList.add("app-header--logo-visible");
      logo.setAttribute("aria-hidden", "false");
      logo.removeAttribute("tabindex");
      logoVisible = true;
      return;
    }

    header.classList.remove("app-header--logo-visible");
    header.classList.add("app-header--logo-hiding");
    logo.setAttribute("aria-hidden", "true");
    logo.setAttribute("tabindex", "-1");
    logoVisible = false;
    hideTimer = setTimeout(() => {
      header.classList.remove("app-header--logo-hiding");
    }, animMs);
  };

  // Default to hidden until the observer reports; avoids a flash on first paint.
  let heroInView = true;

  const measureHeroInView = () => {
    const rect = hero.getBoundingClientRect();
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
    return rect.bottom > 0 && rect.top < viewportHeight;
  };

  const syncHeroInView = () => {
    const next = measureHeroInView();
    if (next === heroInView) return;
    heroInView = next;
    setVisible(!heroInView);
  };

  let scrollTick = 0;
  const scheduleSync = () => {
    if (scrollTick) return;
    scrollTick = window.requestAnimationFrame(() => {
      scrollTick = 0;
      syncHeroInView();
    });
  };

  const observer = new IntersectionObserver(() => scheduleSync(), {
    root: null,
    threshold: 0,
  });

  observer.observe(hero);

  // visualViewport scroll/resize tracks the mobile URL bar; IO alone can lag on iOS.
  window.addEventListener("scroll", scheduleSync, { passive: true });
  window.visualViewport?.addEventListener("scroll", scheduleSync, { passive: true });
  window.visualViewport?.addEventListener("resize", scheduleSync, { passive: true });

  // Deep links: `/#about` or `/?section=about`
  const params = new URLSearchParams(location.search);
  const deepLink = (params.get("section") || location.hash.replace(/^#/, "") || "").trim();
  if (deepLink && deepLink !== "home") {
    setVisible(true);
  } else {
    syncHeroInView();
  }
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
