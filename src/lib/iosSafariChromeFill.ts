/**
 * iOS Safari Liquid Glass — initial compositing nudge.
 *
 * At scrollY = 0 Safari sometimes keeps status/toolbar chrome on the fallback
 * root color (black bars) until the user scrolls. A one-pixel scroll tickle
 * forces a recomposite without the 64px runway that scrolled black through
 * the fixed header.
 */
export function initIosSafariChromeFill(): void {
  if (typeof CSS === "undefined" || !CSS.supports("-webkit-touch-callout", "none")) {
    return;
  }
  if (!window.matchMedia("(max-width: 767.98px)").matches) return;

  const tickle = () => {
    const y = window.scrollY;
    window.scrollTo(0, y + 1);
    window.requestAnimationFrame(() => window.scrollTo(0, y));
  };

  // After first layout — hero height must exist or scrollTo(1) is a no-op.
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(tickle);
  });
}

/** Run on first paint and after Astro client navigations. */
export function bindIosSafariChromeFill(): void {
  initIosSafariChromeFill();
  window.addEventListener("load", initIosSafariChromeFill, { once: true });
  document.addEventListener("astro:page-load", initIosSafariChromeFill);
}
