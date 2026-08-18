const DISPLAY_MS = 5000;
const SETTLE_MS = 140;

function initTestimonialsMobile(viewport: HTMLElement) {
  if (viewport.dataset.testimonialsMobileInit === "true") return;
  viewport.dataset.testimonialsMobileInit = "true";

  const slides = Array.from(viewport.querySelectorAll<HTMLElement>("[data-testimonial-slide]"));
  if (slides.length <= 1) return;

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let activeIndex = 0;
  let timerId = 0;
  let settleId = 0;
  let visible = false;
  let interacting = false;
  let autoScrolling = false;

  function slideCenterLeft(index: number) {
    const slide = slides[index];
    if (!slide) return viewport.scrollLeft;
    const viewportRect = viewport.getBoundingClientRect();
    const slideRect = slide.getBoundingClientRect();
    const delta =
      slideRect.left + slideRect.width / 2 - (viewportRect.left + viewportRect.width / 2);
    return viewport.scrollLeft + delta;
  }

  function nearestIndex() {
    const viewportRect = viewport.getBoundingClientRect();
    const center = viewportRect.left + viewportRect.width / 2;
    let best = 0;
    let bestDist = Number.POSITIVE_INFINITY;
    slides.forEach((slide, index) => {
      const slideRect = slide.getBoundingClientRect();
      const slideCenter = slideRect.left + slideRect.width / 2;
      const dist = Math.abs(slideCenter - center);
      if (dist < bestDist) {
        bestDist = dist;
        best = index;
      }
    });
    return best;
  }

  function syncAria(index: number) {
    slides.forEach((slide, i) => {
      slide.setAttribute("aria-hidden", i === index ? "false" : "true");
    });
    viewport.setAttribute(
      "aria-label",
      `Client testimonial ${index + 1} of ${slides.length}. Swipe to change.`,
    );
  }

  function goTo(index: number, behavior: ScrollBehavior = "smooth") {
    const count = slides.length;
    const next = ((index % count) + count) % count;
    const reduced = prefersReducedMotion || behavior === "auto";
    autoScrolling = !reduced;
    viewport.scrollTo({
      left: slideCenterLeft(next),
      behavior: reduced ? "auto" : "smooth",
    });
    activeIndex = next;
    syncAria(next);
    if (reduced) autoScrolling = false;
  }

  function scheduleNext() {
    window.clearTimeout(timerId);
    if (!visible || prefersReducedMotion || interacting) return;
    timerId = window.setTimeout(() => {
      if (!visible || interacting) return;
      goTo(activeIndex + 1);
      scheduleNext();
    }, DISPLAY_MS);
  }

  function onSettled() {
    autoScrolling = false;
    activeIndex = nearestIndex();
    syncAria(activeIndex);
    scheduleNext();
  }

  function onScroll() {
    window.clearTimeout(settleId);
    if (!autoScrolling) {
      window.clearTimeout(timerId);
    }
    settleId = window.setTimeout(onSettled, SETTLE_MS);
  }

  function onInteractStart() {
    interacting = true;
    autoScrolling = false;
    window.clearTimeout(timerId);
  }

  function onInteractEnd() {
    interacting = false;
    activeIndex = nearestIndex();
    syncAria(activeIndex);
    scheduleNext();
  }

  viewport.addEventListener("scroll", onScroll, { passive: true });
  viewport.addEventListener("pointerdown", onInteractStart);
  viewport.addEventListener("touchstart", onInteractStart, { passive: true });
  viewport.addEventListener("pointerup", onInteractEnd);
  viewport.addEventListener("pointercancel", onInteractEnd);
  viewport.addEventListener("touchend", onInteractEnd, { passive: true });
  viewport.addEventListener("touchcancel", onInteractEnd, { passive: true });

  viewport.addEventListener("keydown", (event) => {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      goTo(activeIndex + 1);
      scheduleNext();
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      goTo(activeIndex - 1);
      scheduleNext();
    }
  });

  let lastWidth = viewport.clientWidth;
  const resizeObs = new ResizeObserver(() => {
    const width = viewport.clientWidth;
    if (width === lastWidth) return;
    lastWidth = width;
    goTo(activeIndex, "auto");
  });
  resizeObs.observe(viewport);

  const visibilityObs =
    "IntersectionObserver" in window
      ? new IntersectionObserver(
          (entries) => {
            visible = entries.some((entry) => entry.isIntersecting && entry.intersectionRatio > 0.15);
            if (visible) scheduleNext();
            else window.clearTimeout(timerId);
          },
          { root: null, threshold: [0, 0.15, 0.4] },
        )
      : null;
  visibilityObs?.observe(viewport);

  goTo(0, "auto");
  const rect = viewport.getBoundingClientRect();
  visible = rect.top < window.innerHeight && rect.bottom > 0;
  if (visible && !prefersReducedMotion) scheduleNext();

  return () => {
    window.clearTimeout(timerId);
    window.clearTimeout(settleId);
    resizeObs.disconnect();
    visibilityObs?.disconnect();
    viewport.removeEventListener("scroll", onScroll);
    viewport.removeEventListener("pointerdown", onInteractStart);
    viewport.removeEventListener("touchstart", onInteractStart);
    viewport.removeEventListener("pointerup", onInteractEnd);
    viewport.removeEventListener("pointercancel", onInteractEnd);
    viewport.removeEventListener("touchend", onInteractEnd);
    viewport.removeEventListener("touchcancel", onInteractEnd);
  };
}

export function bootTestimonialsMobileCarousels(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>("[data-testimonials-mobile]").forEach((viewport) => {
    initTestimonialsMobile(viewport);
  });
}
