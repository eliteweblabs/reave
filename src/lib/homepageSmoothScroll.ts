const SECTION_IDS = ["home", "addons", "contact"] as const;
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

function setScrollTop(y: number) {
  window.scrollTo(0, y);
}

let activeScrollCancel: (() => void) | null = null;

/** JS-driven smooth scroll — reliable across browsers (native `behavior: smooth` is not). */
function animateScrollTo(targetY: number): () => void {
  const startY = window.scrollY;
  const delta = targetY - startY;
  if (Math.abs(delta) < 1) {
    setScrollTop(targetY);
    return () => {};
  }

  const durationMs = Math.min(950, Math.max(420, Math.abs(delta) * 0.55));
  const startTime = performance.now();
  let rafId = 0;

  const step = (now: number) => {
    const progress = Math.min((now - startTime) / durationMs, 1);
    setScrollTop(startY + delta * easeInOutCubic(progress));
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

  activeScrollCancel?.();
  activeScrollCancel = null;

  if (prefersReducedMotion()) {
    setScrollTop(targetY);
    return true;
  }

  activeScrollCancel = animateScrollTo(targetY);
  return true;
}
