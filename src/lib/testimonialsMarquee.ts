import { attachDragMarquee } from "./dragMarquee";

const PIXELS_PER_SECOND = 16;

export function attachTestimonialsMarquee(viewport: HTMLElement): () => void {
  const dragLayer = viewport.querySelector<HTMLElement>(".testimonials-marquee-drag");
  const track = dragLayer?.querySelector<HTMLElement>(".testimonials-marquee-track");
  if (!dragLayer || !track) return () => {};
  return attachDragMarquee(viewport, {
    dragLayer,
    track,
    velocity: PIXELS_PER_SECOND,
  });
}

export function bootTestimonialsMarquees(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>("[data-testimonials-marquee]").forEach((viewport) => {
    if (viewport.dataset.testimonialsMarqueeInit === "1") return;
    viewport.dataset.testimonialsMarqueeInit = "1";
    attachTestimonialsMarquee(viewport);
  });
}
