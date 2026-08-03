const DEFAULT_REVEAL_WINDOW_MS = 4000;
const DEFAULT_FADE_MS = 500;
/** Centroid distance below which two triangles are treated as touching. */
const ADJACENCY_THRESHOLD = 50;

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function readMs(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function shuffle<T>(items: T[]): void {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
}

type TriangleNode = {
  index: number;
  path: SVGPathElement;
  x: number;
  y: number;
};

function measureNodes(paths: SVGPathElement[]): TriangleNode[] {
  return paths.map((path, index) => {
    const box = path.getBBox();
    return {
      index,
      path,
      x: box.x + box.width / 2,
      y: box.y + box.height / 2,
    };
  });
}

function buildAdjacency(nodes: TriangleNode[]): number[][] {
  const thresholdSq = ADJACENCY_THRESHOLD * ADJACENCY_THRESHOLD;
  const adj = nodes.map(() => [] as number[]);

  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      const dx = nodes[i].x - nodes[j].x;
      const dy = nodes[i].y - nodes[j].y;
      if (dx * dx + dy * dy <= thresholdSq) {
        adj[i].push(j);
        adj[j].push(i);
      }
    }
  }

  return adj;
}

function findTopLeftSeed(nodes: TriangleNode[]): number {
  let seed = 0;
  let best = Infinity;

  for (let i = 0; i < nodes.length; i += 1) {
    const score = nodes[i].x + nodes[i].y;
    if (score < best) {
      best = score;
      seed = i;
    }
  }

  return seed;
}

/**
 * Grow a connected blob from the seed: each step reveals a random hidden
 * neighbor of a random point on the current frontier (organic fractal spread).
 */
function computeConnectedRevealOrder(adj: number[][], seed: number): number[] {
  const order: number[] = [seed];
  const revealed = new Set<number>([seed]);

  while (order.length < adj.length) {
    const frontier: number[] = [];
    for (const node of revealed) {
      if (adj[node].some((neighbor) => !revealed.has(neighbor))) {
        frontier.push(node);
      }
    }

    if (frontier.length === 0) break;

    shuffle(frontier);
    const from = frontier[0];
    const hiddenNeighbors = adj[from].filter((neighbor) => !revealed.has(neighbor));
    shuffle(hiddenNeighbors);

    const next = hiddenNeighbors[0];
    revealed.add(next);
    order.push(next);
  }

  if (order.length < adj.length) {
    for (let i = 0; i < adj.length; i += 1) {
      if (!revealed.has(i)) order.push(i);
    }
  }

  return order;
}

function buildRevealDelays(orderLength: number, windowMs: number, fadeMs: number): number[] {
  if (orderLength <= 1) return [0];

  const spreadMs = Math.max(0, windowMs - fadeMs);
  const stepMs = spreadMs / (orderLength - 1);

  return Array.from({ length: orderLength }, (_, index) => {
    const jitter = Math.random() * stepMs * 0.45;
    return index * stepMs + jitter;
  });
}

export function initReaveBgPatternReveal(root: ParentNode = document): number {
  const patterns = root.querySelectorAll<HTMLElement>('.reave-bg-pattern[data-reveal="true"]');
  let started = 0;

  patterns.forEach((wrap) => {
    if (wrap.dataset.reaveBgPatternRevealBound === '1') return;
    wrap.dataset.reaveBgPatternRevealBound = '1';

    const svg = wrap.querySelector('.reave-bg-pattern__svg');
    if (!svg) return;

    const paths = [...svg.querySelectorAll<SVGPathElement>('path')];
    if (paths.length === 0) return;

    started += 1;

    if (prefersReducedMotion()) {
      paths.forEach((path) => {
        path.style.opacity = '1';
      });
      return;
    }

    const fadeMs = readMs(wrap.dataset.revealFadeMs, DEFAULT_FADE_MS);
    const windowMs = readMs(wrap.dataset.revealWindowMs, DEFAULT_REVEAL_WINDOW_MS);

    const nodes = measureNodes(paths);
    const adjacency = buildAdjacency(nodes);
    const seed = findTopLeftSeed(nodes);
    const order = computeConnectedRevealOrder(adjacency, seed);
    const delays = buildRevealDelays(order.length, windowMs, fadeMs);
    const delayByIndex = new Map<number, number>();

    order.forEach((nodeIndex, sequence) => {
      delayByIndex.set(nodeIndex, delays[sequence]);
    });

    paths.forEach((path, index) => {
      path.style.opacity = '0';
      path.style.transition = `opacity ${fadeMs}ms ease-in`;
      path.style.transitionDelay = `${delayByIndex.get(index) ?? 0}ms`;
    });

    void wrap.getBoundingClientRect();

    requestAnimationFrame(() => {
      paths.forEach((path) => {
        path.style.opacity = '1';
      });
    });
  });

  return started;
}

export function bootReaveBgPatternReveal() {
  initReaveBgPatternReveal();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootReaveBgPatternReveal, { once: true });
  } else {
    bootReaveBgPatternReveal();
  }
  document.addEventListener('astro:page-load', bootReaveBgPatternReveal);
}
