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

  const setVisible = (visible: boolean) => {
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }

    if (visible) {
      header.classList.remove("app-header--logo-hiding");
      header.classList.add("app-header--logo-visible");
      logo.setAttribute("aria-hidden", "false");
      logo.removeAttribute("tabindex");
      return;
    }

    header.classList.remove("app-header--logo-visible");
    header.classList.add("app-header--logo-hiding");
    logo.setAttribute("aria-hidden", "true");
    logo.setAttribute("tabindex", "-1");
    hideTimer = setTimeout(() => {
      header.classList.remove("app-header--logo-hiding");
    }, animMs);
  };

  // Default to hidden until the observer reports; avoids a flash on first paint.
  let heroRatio = 1;

  const update = () => {
    // Show on every section after the hero — not only when a downstream section
    // wins the footer-nav "best ratio" contest (shorter sections often stay ≤0.15).
    setVisible(heroRatio <= 0.15);
  };

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.target === hero) heroRatio = entry.intersectionRatio;
      });
      update();
    },
    {
      root: null,
      // Match SiteFooterNav — section in the upper/mid viewport is "active".
      rootMargin: "-18% 0px -42% 0px",
      threshold: [0, 0.2, 0.4, 0.6, 0.8, 1],
    },
  );

  observer.observe(hero);

  // Deep links: `/#about` or `/?section=about`
  const params = new URLSearchParams(location.search);
  const deepLink = (params.get("section") || location.hash.replace(/^#/, "") || "").trim();
  if (deepLink && deepLink !== "home") {
    setVisible(true);
  } else {
    update();
  }

  window.addEventListener("resize", update, { passive: true });
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
