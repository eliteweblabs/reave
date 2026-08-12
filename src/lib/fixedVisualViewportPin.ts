/**
 * Keep a position:fixed element usable above the on-screen keyboard on iOS Safari.
 *
 * Do NOT chase the URL bar. Mobile Safari fires visualViewport scroll/resize while
 * the chrome animates; writing `bottom`/`right` every frame is what makes fixed
 * header/footer chrome bounce. Layout-fixed + CSS safe-area already holds the
 * page-load footer spot once the element is on <body> with no transform ancestor.
 *
 * Only apply an inline offset when the visual viewport shrinks by a keyboard-sized
 * amount; otherwise clear inline edges so stylesheet values win.
 */

export type FixedVisualViewportPinAxis = "bottom" | "bottom-right";

export type FixedVisualViewportPinOptions = {
  /** Extra inset beyond safe-area, in CSS pixels. */
  insetPx?: number;
  /** Which edges to pin. Defaults to bottom-only. */
  axis?: FixedVisualViewportPinAxis;
  /**
   * When false, skip env(safe-area-inset-*) (use when the element already
   * pads for the home indicator in CSS). Defaults to true.
   */
  includeSafeArea?: boolean;
};

/** URL bar deltas are ~40–100px; keyboards are much larger. */
const KEYBOARD_CHROME_MIN_PX = 140;

export function initFixedVisualViewportPin(
  el: HTMLElement,
  options: FixedVisualViewportPinOptions = {},
): void {
  if (el.dataset.vvPin === "1") return;
  el.dataset.vvPin = "1";

  const vv = window.visualViewport;
  if (!vv) return;

  const insetPx = options.insetPx ?? 0;
  const axis = options.axis ?? "bottom";
  const includeSafeArea = options.includeSafeArea !== false;

  let safeBottom = 0;
  let safeRight = 0;
  if (includeSafeArea) {
    const probe = document.createElement("div");
    probe.style.cssText =
      "position:fixed;bottom:0;right:0;height:0;padding-bottom:env(safe-area-inset-bottom,0px);padding-right:env(safe-area-inset-right,0px);visibility:hidden;pointer-events:none";
    document.body.appendChild(probe);
    const probeStyle = getComputedStyle(probe);
    safeBottom = parseFloat(probeStyle.paddingBottom) || 0;
    safeRight = parseFloat(probeStyle.paddingRight) || 0;
    probe.remove();
  }

  let raf = 0;
  const sync = () => {
    const layoutBottom = window.innerHeight;
    const visualBottom =
      (window.visualViewport?.offsetTop ?? 0) +
      (window.visualViewport?.height ?? layoutBottom);
    const chrome = Math.max(0, Math.round(layoutBottom - visualBottom));

    if (chrome >= KEYBOARD_CHROME_MIN_PX) {
      el.style.bottom = `${chrome + safeBottom + insetPx}px`;
    } else {
      // Drop the chase so CSS `bottom` (safe-area / 4px Liquid Glass gap) stays put.
      el.style.bottom = "";
    }

    if (axis === "bottom-right") {
      const layoutRight = window.innerWidth;
      const visualRight =
        (window.visualViewport?.offsetLeft ?? 0) +
        (window.visualViewport?.width ?? layoutRight);
      const sideChrome = Math.max(0, Math.round(layoutRight - visualRight));
      if (chrome >= KEYBOARD_CHROME_MIN_PX) {
        el.style.right = `${sideChrome + safeRight + insetPx}px`;
      } else {
        el.style.right = "";
      }
    }
  };

  const schedule = () => {
    if (raf) return;
    raf = window.requestAnimationFrame(() => {
      raf = 0;
      sync();
    });
  };

  // resize/orientation only — visualViewport *scroll* is the URL-bar/rubber-band path.
  vv.addEventListener("resize", schedule, { passive: true });
  window.addEventListener("resize", schedule, { passive: true });
  window.addEventListener("orientationchange", schedule, { passive: true });
  sync();
}
