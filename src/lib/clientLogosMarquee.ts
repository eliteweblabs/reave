import { attachDragMarquee, type DragMarqueeOptions } from "./dragMarquee";

export type ClientLogosMarqueeOptions = Pick<DragMarqueeOptions, "loopCopies" | "velocity">;

/**
 * Autoplay is a CSS animation on the track, so it keeps running on the
 * compositor regardless of what the main thread — or this module — is doing.
 * JS only sets the duration and moves a separate drag layer, so the swipe
 * offset and the autoplay transform compose instead of overwriting each other.
 */
const COMPACT_MAX_PX = 70;

function interleaveByWidth(wide: HTMLElement[], compact: HTMLElement[]): HTMLElement[] {
  const out: HTMLElement[] = [];
  let wi = 0;
  let ci = 0;
  let compactStreak = 0;
  while (ci < compact.length || wi < wide.length) {
    const preferWide =
      wi < wide.length && (compactStreak >= 1 || ci >= compact.length);
    if (preferWide) {
      out.push(wide[wi++]);
      compactStreak = 0;
      continue;
    }
    out.push(compact[ci++]);
    compactStreak += 1;
  }
  return out;
}

/** Keep small square marks from clustering after real widths are known. */
function spreadPaintedLogos(track: HTMLElement, loopCopies: number) {
  const items = [...track.children] as HTMLElement[];
  if (items.length < 4 || loopCopies < 1) return;
  const setSize = Math.round(items.length / loopCopies);
  if (setSize < 2) return;

  const first = items.slice(0, setSize);
  const compact: HTMLElement[] = [];
  const wide: HTMLElement[] = [];
  for (const el of first) {
    const width = el.getBoundingClientRect().width;
    if (width > 0 && width < COMPACT_MAX_PX) compact.push(el);
    else wide.push(el);
  }
  if (compact.length < 2 || wide.length < 1) return;

  const ordered = interleaveByWidth(wide, compact);
  const frag = document.createDocumentFragment();
  for (let copy = 0; copy < loopCopies; copy += 1) {
    for (const el of ordered) {
      frag.appendChild(copy === 0 ? el : (el.cloneNode(true) as HTMLElement));
    }
  }
  track.replaceChildren(frag);
}

export function attachClientLogosMarquee(
  viewport: HTMLElement,
  opts: ClientLogosMarqueeOptions = {},
): () => void {
  const dragLayer = viewport.querySelector<HTMLElement>(".client-logos-drag");
  const track = dragLayer?.querySelector<HTMLElement>(".client-logos-track");
  if (!dragLayer || !track) return () => {};
  const loopCopies = Math.max(
    1,
    opts.loopCopies ?? (Number(viewport.dataset.loopCopies) || 3),
  );
  spreadPaintedLogos(track, loopCopies);
  return attachDragMarquee(viewport, { ...opts, dragLayer, track, loopCopies });
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
