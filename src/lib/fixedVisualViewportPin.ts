/**
 * Keep a position:fixed element glued to the visible viewport edge on iOS Safari.
 *
 * Mobile Safari's layout viewport and visualViewport diverge while the URL bar
 * shows/hides; plain `bottom: 0` then drifts mid-page. Syncing from
 * visualViewport keeps the element at the same on-screen edge it had on load.
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

  const sync = () => {
    const layoutBottom = window.innerHeight;
    const visualBottom =
      (window.visualViewport?.offsetTop ?? 0) +
      (window.visualViewport?.height ?? layoutBottom);
    const chrome = Math.max(0, Math.round(layoutBottom - visualBottom));
    el.style.bottom = `${chrome + safeBottom + insetPx}px`;

    if (axis === "bottom-right") {
      const layoutRight = window.innerWidth;
      const visualRight =
        (window.visualViewport?.offsetLeft ?? 0) +
        (window.visualViewport?.width ?? layoutRight);
      const sideChrome = Math.max(0, Math.round(layoutRight - visualRight));
      el.style.right = `${sideChrome + safeRight + insetPx}px`;
    }
  };

  vv.addEventListener("resize", sync, { passive: true });
  vv.addEventListener("scroll", sync, { passive: true });
  window.addEventListener("resize", sync, { passive: true });
  window.addEventListener("orientationchange", sync, { passive: true });
  sync();
  requestAnimationFrame(sync);
  window.setTimeout(sync, 150);
}
