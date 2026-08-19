import { attachDragMarquee, type DragMarqueeOptions } from "./dragMarquee";

export type ClientLogosMarqueeOptions = Pick<DragMarqueeOptions, "loopCopies" | "velocity">;

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
  return attachDragMarquee(viewport, { ...opts, dragLayer, track });
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
