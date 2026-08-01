export function initHomepageLogoReveal() {
  const header = document.querySelector<HTMLElement>(".app-header--homepage-logo-reveal");
  const logo = header?.querySelector<HTMLAnchorElement>(".app-header-logo");
  const hero = document.getElementById("home");

  if (!header || !logo || !hero) return false;
  if (header.dataset.logoRevealBound === "1") return true;
  header.dataset.logoRevealBound = "1";

  let logoVisible = false;

  const setVisible = (visible: boolean) => {
    if (visible === logoVisible) return;

    header.classList.toggle("app-header--logo-visible", visible);
    logo.setAttribute("aria-hidden", visible ? "false" : "true");
    if (visible) {
      logo.removeAttribute("tabindex");
    } else {
      logo.setAttribute("tabindex", "-1");
    }
    logoVisible = visible;
  };

  // Default to hidden until the observer reports; avoids a flash on first paint.
  let heroInView = true;

  const applyHeroInView = (next: boolean) => {
    if (next === heroInView) return;
    heroInView = next;
    setVisible(!heroInView);
  };

  // Layout viewport only — matches IntersectionObserver (root: null). Comparing
  // getBoundingClientRect to visualViewport.height flips when the mobile URL bar
  // collapses and retriggers the logo cascade even though scroll didn't change.
  const measureHeroInView = () => {
    const rect = hero.getBoundingClientRect();
    return rect.bottom > 0 && rect.top < window.innerHeight;
  };

  let scrollTick = 0;
  const scheduleScrollSync = () => {
    if (scrollTick) return;
    scrollTick = window.requestAnimationFrame(() => {
      scrollTick = 0;
      applyHeroInView(measureHeroInView());
    });
  };

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.target !== hero) continue;
        applyHeroInView(entry.isIntersecting);
      }
    },
    {
      root: null,
      threshold: 0,
    },
  );

  observer.observe(hero);

  // iOS can lag IntersectionObserver during momentum scroll; remeasure on scroll only.
  window.addEventListener("scroll", scheduleScrollSync, { passive: true });

  // Deep links: `/#about` or `/?section=about`
  const params = new URLSearchParams(location.search);
  const deepLink = (params.get("section") || location.hash.replace(/^#/, "") || "").trim();
  if (deepLink && deepLink !== "home") {
    setVisible(true);
  } else {
    applyHeroInView(measureHeroInView());
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
