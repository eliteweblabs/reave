/**
 * Safari's bottom toolbar lives outside env(safe-area-inset-bottom). Track the
 * gap between the layout and visual viewports so bottom chrome can sit above
 * the URL bar and move when it collapses on scroll.
 */
let bound = false;

export function initBrowserUiBottomInset(): void {
  if (bound || typeof window === "undefined") return;
  if (!window.matchMedia("(max-width: 768px)").matches) return;
  const vv = window.visualViewport;
  if (!vv) return;
  bound = true;

  const root = document.documentElement;
  let raf = 0;

  const sync = () => {
    raf = 0;
    const inset = Math.max(
      0,
      Math.round(window.innerHeight - vv.height - vv.offsetTop),
    );
    root.style.setProperty("--browser-ui-bottom", `${inset}px`);
  };

  const schedule = () => {
    if (raf) return;
    raf = window.requestAnimationFrame(sync);
  };

  sync();
  vv.addEventListener("resize", schedule);
  vv.addEventListener("scroll", schedule);
  window.addEventListener("resize", schedule);
  window.addEventListener("orientationchange", schedule);
  document.addEventListener("astro:page-load", sync);
}
