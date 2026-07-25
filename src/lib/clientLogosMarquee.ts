const PIXELS_PER_SECOND = 28;
const DRAG_THRESHOLD_PX = 8;

export type ClientLogosMarqueeOptions = {
  loopCopies?: number;
  velocity?: number;
};

/**
 * Infinite logo marquee: one transform offset, one rAF loop.
 * Autoplay and horizontal swipe work the same on desktop and mobile.
 */
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
  let dragListenersBound = false;

  function measure() {
    const items = track.querySelectorAll<HTMLElement>(".client-logo-item");
    const perSet = Math.floor(items.length / loopCopies);
    if (perSet > 0) {
      let width = 0;
      for (let i = 0; i < perSet; i++) {
        width += items[i]!.offsetWidth;
      }
      if (width > 0) {
        setWidth = width;
        return;
      }
    }

    const fallback = track.scrollWidth / loopCopies;
    if (fallback > 0) setWidth = fallback;
  }

  /** Keep offset in (-setWidth, 0]; skip while dragging so swipes don't snap. */
  function wrapOffset(force = false) {
    if (setWidth <= 0 || (dragging && !force)) return;
    while (offset <= -setWidth) offset += setWidth;
    while (offset > 0) offset -= setWidth;
  }

  function paint() {
    track.style.transform = `translate3d(${offset}px, 0, 0)`;
  }

  function canAutoplay() {
    return !prefersReducedMotion && !dragging && !dragPending && setWidth > 0;
  }

  function frame(now: number) {
    rafId = requestAnimationFrame(frame);
    if (!running) {
      lastFrameTime = now;
      return;
    }

    const dt = lastFrameTime ? Math.min((now - lastFrameTime) / 1000, 0.05) : 0;
    lastFrameTime = now;

    if (canAutoplay()) {
      offset -= velocity * dt;
      wrapOffset(true);
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

  function bindDragListeners() {
    if (dragListenersBound) return;
    dragListenersBound = true;
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
  }

  function unbindDragListeners() {
    if (!dragListenersBound) return;
    dragListenersBound = false;
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("pointercancel", onPointerUp);
  }

  function finishDrag() {
    if (!dragging && !dragPending) return;

    dragPending = false;
    dragging = false;
    activePointerId = null;
    viewport.classList.remove("is-dragging");
    unbindDragListeners();
    wrapOffset(true);
    paint();
  }

  function onPointerDown(event: PointerEvent) {
    if (event.button !== 0 && event.pointerType === "mouse") return;

    dragPending = true;
    dragging = false;
    activePointerId = event.pointerId;
    dragStartX = event.clientX;
    dragStartY = event.clientY;
    dragStartOffset = offset;
    bindDragListeners();
  }

  function onPointerMove(event: PointerEvent) {
    if (!dragPending && !dragging) return;
    if (activePointerId !== event.pointerId) return;

    const dx = event.clientX - dragStartX;
    const dy = event.clientY - dragStartY;

    if (dragPending) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;

      // Vertical intent → let the page scroll; abandon the drag.
      if (Math.abs(dy) > Math.abs(dx) * 1.1) {
        finishDrag();
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
    paint();
  }

  function onPointerUp(event: PointerEvent) {
    if (activePointerId !== event.pointerId) return;

    if (viewport.hasPointerCapture(event.pointerId)) {
      try {
        viewport.releasePointerCapture(event.pointerId);
      } catch {
        /* ignore */
      }
    }

    finishDrag();
  }

  const onLostPointerCapture = () => {
    finishDrag();
  };

  const remeasure = () => {
    measure();
    wrapOffset(true);
    paint();
  };

  const resizeObs = new ResizeObserver(remeasure);
  resizeObs.observe(viewport);
  resizeObs.observe(track);

  track.querySelectorAll("img").forEach((img) => {
    if (!(img as HTMLImageElement).complete) {
      img.addEventListener("load", remeasure, { once: true });
    }
  });

  const onVisibilityChange = () => {
    if (document.hidden) stopLoop();
    else startLoop();
  };

  viewport.addEventListener("pointerdown", onPointerDown);
  viewport.addEventListener("lostpointercapture", onLostPointerCapture);
  document.addEventListener("visibilitychange", onVisibilityChange);

  remeasure();
  requestAnimationFrame(remeasure);
  startLoop();

  return () => {
    stopLoop();
    unbindDragListeners();
    resizeObs.disconnect();
    viewport.removeEventListener("pointerdown", onPointerDown);
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

if (typeof document !== "undefined") {
  const boot = () => bootClientLogosMarquees();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
  document.addEventListener("astro:page-load", boot);
}
