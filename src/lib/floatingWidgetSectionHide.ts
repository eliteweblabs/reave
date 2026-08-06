/** Hide fixed chat/voice widgets while key homepage sections are in view. */
export const FLOATING_WIDGET_SECTION_HIDE_RATIO = 0.2;

const OBSERVER_THRESHOLDS = Array.from({ length: 21 }, (_, i) => i * 0.05);

/**
 * Toggle `occludingClass` on `element` when any observed section is at least
 * `FLOATING_WIDGET_SECTION_HIDE_RATIO` visible.
 */
export function initFloatingWidgetSectionHide(
  element: HTMLElement,
  occludingClass: string,
  ...selectors: string[]
): void {
  const targets = selectors
    .map((selector) => document.querySelector(selector))
    .filter((el): el is Element => !!el);
  if (!targets.length || !('IntersectionObserver' in window)) return;

  const ratios = new Map<Element, number>();

  const sync = () => {
    const occluding = [...ratios.values()].some(
      (ratio) => ratio >= FLOATING_WIDGET_SECTION_HIDE_RATIO,
    );
    element.classList.toggle(occludingClass, occluding);
  };

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        ratios.set(entry.target, entry.intersectionRatio);
      }
      sync();
    },
    { threshold: OBSERVER_THRESHOLDS },
  );

  for (const target of targets) {
    ratios.set(target, 0);
    observer.observe(target);
  }
}
