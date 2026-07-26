const PIXELS_PER_SECOND = 32;
const DRAG_THRESHOLD_PX = 8;
const AUTOPLAY_RESUME_MS = 4000;

export type ClientLogosMarqueeOptions = {
  loopCopies?: number;
  velocity?: number;
};

/**
 * Autoplay is a CSS animation on the track, so it keeps running on the
 * compositor regardless of what the main thread — or this module — is doing.
 * JS only sets the duration and moves a separate drag layer, so the swipe
 * offset and the autoplay transform compose instead of overwriting each other.
 */
export function attachClientLogosMarquee(
  viewport: HTMLElement,
  opts: ClientLogosMarqueeOptions = {},
): () => void {
  const dragLayer = viewport.querySelector<HTMLElement>(".client-logos-drag");
  const track = dragLayer?.querySelector<HTMLElement>(".client-logos-track");
  if (!dragLayer || !track) return () => {};
  return runMarquee(viewport, dragLayer, track, opts);
}

function runMarquee(
  viewport: HTMLElement,
  dragLayer: HTMLElement,
  track: HTMLElement,
  opts: ClientLogosMarqueeOptions,
): () => void {
  const loopCopies = Math.max(
    1,
    opts.loopCopies ?? (Number(viewport.dataset.loopCopies) || 3),
  );
  const velocity = opts.velocity ?? PIXELS_PER_SECOND;

  let setWidth = 0;
  let offset = 0;
  let dragging = false;
  let dragPending = false;
  let activePointerId: number | null = null;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragStartOffset = 0;
  let resumeTimer = 0;
  let dragListenersBound = false;

  /** Offsets are periodic: shifting by a whole set is visually identical. */
  function wrap(value: number) {
    if (setWidth <= 0) return value;
    const wrapped = value % setWidth;
    return wrapped > 0 ? wrapped - setWidth : wrapped;
  }

  function paint() {
    dragLayer.style.transform = `translate3d(${wrap(offset)}px, 0, 0)`;
  }

  function measure() {
    const total = track.scrollWidth || track.offsetWidth;
    const next = total / loopCopies;
    if (next <= 0) return;

    setWidth = next;
    // Constant pixel speed at every breakpoint. Reassigning restarts the
    // animation's timing, so only write when the value actually moved.
    const seconds = (setWidth / velocity).toFixed(2);
    const duration = `${seconds}s`;
    if (track.style.animationDuration !== duration) {
      track.style.animationDuration = duration;
    }
  }

  function pauseAutoplay() {
    track.style.animationPlayState = "paused";
  }

  function resumeAutoplay() {
    track.style.animationPlayState = "";
    if (resumeTimer) {
      clearTimeout(resumeTimer);
      resumeTimer = 0;
    }
  }

  /**
   * Safety net: a pointerup that never arrives (gesture stolen by the OS, tab
   * switch mid-swipe) must not leave the strip parked forever.
   */
  function armAutoplayResume() {
    if (resumeTimer) clearTimeout(resumeTimer);
    resumeTimer = window.setTimeout(resumeAutoplay, AUTOPLAY_RESUME_MS);
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

  function endDrag() {
    if (!dragging && !dragPending) return;

    dragging = false;
    dragPending = false;
    activePointerId = null;
    offset = wrap(offset);
    viewport.classList.remove("is-dragging");
    unbindDragListeners();
    resumeAutoplay();
    paint();
  }

  function onPointerDown(event: PointerEvent) {
    if (event.pointerType === "mouse" && event.button !== 0) return;

    dragPending = true;
    dragging = false;
    activePointerId = event.pointerId;
    dragStartX = event.clientX;
    dragStartY = event.clientY;
    dragStartOffset = offset;
    bindDragListeners();
  }

  function onPointerMove(event: PointerEvent) {
    if (activePointerId !== event.pointerId) return;

    const dx = event.clientX - dragStartX;
    const dy = event.clientY - dragStartY;

    if (dragPending) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;

      // Vertical intent → let the page scroll; abandon the swipe.
      if (Math.abs(dy) > Math.abs(dx)) {
        endDrag();
        return;
      }

      dragPending = false;
      dragging = true;
      viewport.classList.add("is-dragging");
      pauseAutoplay();
    }

    offset = dragStartOffset + dx;
    armAutoplayResume();
    paint();
  }

  function onPointerUp(event: PointerEvent) {
    if (activePointerId !== event.pointerId) return;
    endDrag();
  }

  const onWindowBlur = () => endDrag();

  const remeasure = () => {
    measure();
    paint();
  };

  const resizeObs = new ResizeObserver(remeasure);
  resizeObs.observe(viewport);
  resizeObs.observe(track);

  track.querySelectorAll("img").forEach((img) => {
    if (!img.complete) img.addEventListener("load", remeasure, { once: true });
  });

  viewport.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("blur", onWindowBlur);

  remeasure();

  return () => {
    endDrag();
    resizeObs.disconnect();
    viewport.removeEventListener("pointerdown", onPointerDown);
    window.removeEventListener("blur", onWindowBlur);
    dragLayer.style.removeProperty("transform");
    track.style.removeProperty("animation-duration");
    track.style.removeProperty("animation-play-state");
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
