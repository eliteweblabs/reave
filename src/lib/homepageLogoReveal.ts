export function initHomepageLogoReveal() {
  const header = document.querySelector<HTMLElement>(".app-header--homepage-logo-reveal");
  const logo = header?.querySelector<HTMLAnchorElement>(".app-header-logo");
  const sections = Array.from(
    document.querySelectorAll<HTMLElement>("[data-home-section]"),
  );
  const hero = document.getElementById("home");

  if (!header || !logo || !hero || sections.length === 0) return false;
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

  const ratios = new Map<Element, number>();

  const activeSectionId = () => {
    let bestSection: HTMLElement | null = null;
    let bestRatio = 0;

    for (const section of sections) {
      const ratio = ratios.get(section) ?? 0;
      if (ratio > bestRatio) {
        bestRatio = ratio;
        bestSection = section;
      }
    }

    if (!bestSection || bestRatio <= 0.15) {
      return "home";
    }

    return bestSection.dataset.homeSection ?? "home";
  };

  const update = () => {
    setVisible(activeSectionId() !== "home");
  };

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        ratios.set(entry.target, entry.intersectionRatio);
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

  sections.forEach((section) => observer.observe(section));

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
