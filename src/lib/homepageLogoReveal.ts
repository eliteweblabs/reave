export function initHomepageLogoReveal() {
  const header = document.querySelector<HTMLElement>(".app-header--homepage-logo-reveal");
  const about = document.getElementById("about");
  const logo = header?.querySelector<HTMLAnchorElement>(".app-header-logo");
  if (!header || !about || !logo) return false;
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

  const update = () => {
    const heroBottom = document.getElementById("home")?.getBoundingClientRect().bottom ?? 0;
    const headerBottom = header.getBoundingClientRect().bottom;
    const aboutTop = about.getBoundingClientRect().top;
    const pastHero = heroBottom <= headerBottom + 8;
    const aboutInView = aboutTop < window.innerHeight * 0.85;
    setVisible(pastHero || aboutInView);
  };

  update();
  window.addEventListener("scroll", update, { passive: true });
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
