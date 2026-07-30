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
  let heroInView = true;

  const update = () => {
    // Match mobile: reveal only once the hero has fully left the viewport.
    setVisible(!heroInView);
  };

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.target === hero) heroInView = entry.isIntersecting;
      });
      update();
    },
    {
      root: null,
      threshold: 0,
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
