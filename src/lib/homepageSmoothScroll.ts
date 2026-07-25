const SECTION_IDS = ["home", "about", "services", "portfolio", "contact"] as const;
export type HomepageSectionId = (typeof SECTION_IDS)[number];

export function isHomepageSectionId(value: string): value is HomepageSectionId {
  return (SECTION_IDS as readonly string[]).includes(value);
}

function prefersReducedMotion(): boolean {
  return (
    typeof matchMedia !== "undefined" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** Scrollport + target scroll-margin, matching native scrollIntoView insets. */
export function getHomepageSectionScrollTop(el: HTMLElement): number {
  const rootStyles = getComputedStyle(document.documentElement);
  const padTop = Number.parseFloat(rootStyles.scrollPaddingTop) || 0;
  const marginTop = Number.parseFloat(getComputedStyle(el).scrollMarginTop) || 0;
  const top = el.getBoundingClientRect().top + window.scrollY - padTop - marginTop;
  return Math.max(0, top);
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

/** rAF fallback when native smooth scrolling is unavailable or inconsistent. */
function animateScrollTo(targetY: number, durationMs = 680): () => void {
  const startY = window.scrollY;
  const delta = targetY - startY;
  if (Math.abs(delta) < 1) {
    window.scrollTo(0, targetY);
    return () => {};
  }

  const startTime = performance.now();
  let rafId = 0;

  const step = (now: number) => {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / durationMs, 1);
    window.scrollTo(0, startY + delta * easeInOutCubic(progress));
    if (progress < 1) {
      rafId = requestAnimationFrame(step);
    }
  };

  rafId = requestAnimationFrame(step);
  return () => {
    if (rafId) cancelAnimationFrame(rafId);
  };
}

export function smoothScrollToHomepageSection(
  id: HomepageSectionId,
): boolean {
  const el = document.getElementById(id);
  if (!el) return false;

  const targetY = getHomepageSectionScrollTop(el);
  if (prefersReducedMotion()) {
    window.scrollTo(0, targetY);
    return true;
  }

  // Prefer native smooth scroll (respects scroll-padding); fall back to rAF easing.
  try {
    window.scrollTo({ top: targetY, behavior: "smooth" });
  } catch {
    animateScrollTo(targetY);
    return true;
  }

  const startY = window.scrollY;
  window.requestAnimationFrame(() => {
    if (Math.abs(window.scrollY - startY) < 1 && Math.abs(targetY - startY) > 8) {
      animateScrollTo(targetY);
    }
  });

  return true;
}
