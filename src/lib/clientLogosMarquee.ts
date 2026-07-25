const PIXELS_PER_SECOND = 28;
const DRAG_THRESHOLD_PX = 6;

export type ClientLogosMarqueeOptions = {
  loopCopies?: number;
  velocity?: number;
};

/** One rAF loop + one offset — autoplay and drag on every device. */
export function attachClientLogosMarquee(
  viewport: HTMLElement,
  opts: ClientLogosMarqueeOptions = {},
): () => void {
  const track = viewport.querySelector<HTMLElement>(".client-logos-track");
  if (!track) return () => {};

  const loopCopies = Math.max(
    1,
    opts.loopCopies ?? (Number(viewport.dataset.loopCopies) || 3),
  );
  const velocity = opts.velocity ?? PIXELS_PER_SECOND;
  const prefersReducedMotion =
    typeof matchMedia !== "undefined" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches;

  let setWidth = 0;
  let offset = 0;
  let running = false;
  let dragging = false;
  let dragPending = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragStartOffset = 0;
  let activePointerId: number | null = null;
  let lastFrameTime = 0;
  let rafId = 0;
  let offscreen = false;

  function measure() {
    const next = track.scrollWidth / loopCopies;
    if (next > 0) setWidth = next;
  }

  function wrapOffset() {
    if (setWidth <= 0) return;
    while (offset <= -setWidth) offset += setWidth;
    while (offset > 0) offset -= setWidth;
  }

  function paint() {
    track.style.transform = `translate3d(${offset}px, 0, 0)`;
  }

  function shouldAutoplay() {
    return !prefersReducedMotion && !dragging && !dragPending && !offscreen && setWidth > 0;
  }

  function frame(now: number) {
    rafId = requestAnimationFrame(frame);

    if (!running) {
      lastFrameTime = now;
      return;
    }

    const dt = lastFrameTime ? Math.min((now - lastFrameTime) / 1000, 0.05) : 0;
    lastFrameTime = now;

    if (shouldAutoplay()) {
      offset -= velocity * dt;
      wrapOffset();
      paint();
    }
  }

  function startLoop() {
    if (running) return;
    running = true;
    lastFrameTime = 0;
    rafId = requestAnimationFrame(frame);
  }

  function stopLoop() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
  }

  function onPointerDown(event: PointerEvent) {
    if (event.button !== 0 && event.pointerType === "mouse") return;

    dragPending = true;
    dragging = false;
    activePointerId = event.pointerId;
    dragStartX = event.clientX;
    dragStartY = event.clientY;
    dragStartOffset = offset;
  }

  function onPointerMove(event: PointerEvent) {
    if (!dragPending && !dragging) return;
    if (activePointerId !== event.pointerId) return;

    const dx = event.clientX - dragStartX;
    const dy = event.clientY - dragStartY;

    if (dragPending) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;

      // Let vertical pans scroll the page; only capture horizontal swipes.
      if (Math.abs(dy) > Math.abs(dx)) {
        dragPending = false;
        activePointerId = null;
        return;
      }

      dragPending = false;
      dragging = true;
      viewport.classList.add("is-dragging");
      try {
        viewport.setPointerCapture(event.pointerId);
      } catch {
        /* ignore */
      }
    }

    offset = dragStartOffset + dx;
    wrapOffset();
    paint();
  }

  function endDrag(event: PointerEvent) {
    if (activePointerId !== event.pointerId) return;

    dragPending = false;
    dragging = false;
    activePointerId = null;
    viewport.classList.remove("is-dragging");
    wrapOffset();
    paint();

    if (viewport.hasPointerCapture(event.pointerId)) {
      try {
        viewport.releasePointerCapture(event.pointerId);
      } catch {
        /* ignore */
      }
    }
  }

  const onLostPointerCapture = () => {
    dragPending = false;
    dragging = false;
    activePointerId = null;
    viewport.classList.remove("is-dragging");
    wrapOffset();
    paint();
  };

  const visibilityObs =
    "IntersectionObserver" in window
      ? new IntersectionObserver(
          (entries) => {
            offscreen = !entries.some((entry) => entry.isIntersecting);
          },
          { root: null, threshold: 0, rootMargin: "64px 0px" },
        )
      : null;
  visibilityObs?.observe(viewport);

  const resizeObs = new ResizeObserver(() => {
    measure();
    wrapOffset();
    paint();
  });
  resizeObs.observe(viewport);
  resizeObs.observe(track);

  track.querySelectorAll("img").forEach((img) => {
    if (!(img as HTMLImageElement).complete) {
      img.addEventListener("load", () => {
        measure();
        wrapOffset();
        paint();
      }, { once: true });
    }
  });

  const onVisibilityChange = () => {
    if (document.hidden) stopLoop();
    else startLoop();
  };

  viewport.addEventListener("pointerdown", onPointerDown);
  viewport.addEventListener("pointermove", onPointerMove);
  viewport.addEventListener("pointerup", endDrag);
  viewport.addEventListener("pointercancel", endDrag);
  viewport.addEventListener("lostpointercapture", onLostPointerCapture);
  document.addEventListener("visibilitychange", onVisibilityChange);

  measure();
  wrapOffset();
  paint();
  startLoop();

  return () => {
    stopLoop();
    visibilityObs?.disconnect();
    resizeObs.disconnect();
    viewport.removeEventListener("pointerdown", onPointerDown);
    viewport.removeEventListener("pointermove", onPointerMove);
    viewport.removeEventListener("pointerup", endDrag);
    viewport.removeEventListener("pointercancel", endDrag);
    viewport.removeEventListener("lostpointercapture", onLostPointerCapture);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    track.style.removeProperty("transform");
  };
}

export function bootClientLogosMarquees(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>("[data-client-logos]").forEach((viewport) => {
    if (viewport.dataset.clientLogosInit === "1") return;
    viewport.dataset.clientLogosInit = "1";
    attachClientLogosMarquee(viewport);
  });
}
