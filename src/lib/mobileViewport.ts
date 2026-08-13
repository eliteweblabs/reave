/**
 * Viewport meta for a full-bleed Mobile Safari layout.
 * `viewport-fit=cover` lets the page paint past the notch, home indicator,
 * and dynamic toolbars. Pair with `height: 100vh` on html (never `100%`) and
 * pad essential chrome with env(safe-area-inset-*).
 */
export const MOBILE_VIEWPORT_CONTENT =
  "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover";
