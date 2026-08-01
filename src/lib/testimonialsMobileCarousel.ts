const DISPLAY_MS = 5000;
const SWIPE_THRESHOLD_PX = 48;

function initTestimonialsMobile(viewport: HTMLElement) {
  if (viewport.dataset.testimonialsMobileInit === "true") return;
  viewport.dataset.testimonialsMobileInit = "true";

  const track = viewport.querySelector<HTMLElement>("[data-testimonials-mobile-track]");
  const slides = Array.from(viewport.querySelectorAll<HTMLElement>("[data-testimonial-slide]"));
  if (!track || slides.length <= 1) return;

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let activeIndex = 0;
  let timerId = 0;
  let visible = false;
  let dragging = false;
  let pointerId: number | null = null;
  let startX = 0;
  let startY = 0;
  let swiped = false;

  function cardStride() {
    const card = slides[0];
    const gap = parseFloat(getComputedStyle(track).gap) || 12;
    return card.offsetWidth + gap;
  }

  function goTo(index: number, animate = true) {
    const count = slides.length;
    const next = ((index % count) + count) % count;
    track.style.transition = animate && !prefersReducedMotion ? "transform 0.45s ease" : "none";
    track.style.transform = `translate3d(${-next * cardStride()}px, 0, 0)`;
    slides.forEach((slide, i) => {
      slide.setAttribute("aria-hidden", i === next ? "false" : "true");
    });
    activeIndex = next;
    viewport.setAttribute(
      "aria-label",
      `Client testimonial ${next + 1} of ${count}. Swipe to change.`,
    );
  }

  function scheduleNext() {
    window.clearTimeout(timerId);
    if (!visible || prefersReducedMotion || dragging) return;
    timerId = window.setTimeout(() => {
      if (!visible || dragging) return;
      goTo(activeIndex + 1);
      scheduleNext();
    }, DISPLAY_MS);
  }

  function pauseAutoplayBriefly() {
    window.clearTimeout(timerId);
    scheduleNext();
  }

  function onPointerDown(event: PointerEvent) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    pointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    dragging = true;
    swiped = false;
    window.clearTimeout(timerId);
    try {
      viewport.setPointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }
  }

  function onPointerMove(event: PointerEvent) {
    if (!dragging || event.pointerId !== pointerId) return;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    if (!swiped && Math.abs(dx) >= SWIPE_THRESHOLD_PX && Math.abs(dx) > Math.abs(dy) * 1.15) {
      swiped = true;
      goTo(activeIndex + (dx < 0 ? 1 : -1));
      pauseAutoplayBriefly();
    }
  }

  function onPointerUp(event: PointerEvent) {
    if (event.pointerId !== pointerId) return;
    dragging = false;
    pointerId = null;
    if (viewport.hasPointerCapture(event.pointerId)) {
      viewport.releasePointerCapture(event.pointerId);
    }
    scheduleNext();
  }

  viewport.addEventListener("pointerdown", onPointerDown);
  viewport.addEventListener("pointermove", onPointerMove);
  viewport.addEventListener("pointerup", onPointerUp);
  viewport.addEventListener("pointercancel", onPointerUp);

  viewport.addEventListener("keydown", (event) => {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      goTo(activeIndex + 1);
      pauseAutoplayBriefly();
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      goTo(activeIndex - 1);
      pauseAutoplayBriefly();
    }
  });

  const resizeObs = new ResizeObserver(() => goTo(activeIndex, false));
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

  goTo(0, false);
  const rect = viewport.getBoundingClientRect();
  visible = rect.top < window.innerHeight && rect.bottom > 0;
  if (visible && !prefersReducedMotion) scheduleNext();

  return () => {
    window.clearTimeout(timerId);
    resizeObs.disconnect();
    visibilityObs?.disconnect();
    viewport.removeEventListener("pointerdown", onPointerDown);
    viewport.removeEventListener("pointermove", onPointerMove);
    viewport.removeEventListener("pointerup", onPointerUp);
    viewport.removeEventListener("pointercancel", onPointerUp);
  };
}

export function bootTestimonialsMobileCarousels(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>("[data-testimonials-mobile]").forEach((viewport) => {
    initTestimonialsMobile(viewport);
  });
}
