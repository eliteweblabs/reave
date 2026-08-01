type Segment = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

type CoverRect = {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  dx: number;
  dy: number;
  dw: number;
  dh: number;
};

const SAMPLE_WIDTH = 360;
const MIN_RUN = 2;
const ROW_STEP = 1;

/** Scale to 100% container height; width follows image aspect ratio (may overflow horizontally). */
function getHeightFitRect(iw: number, ih: number, ch: number): CoverRect {
  const scale = ch / ih;
  const dw = iw * scale;
  const dh = ch;
  return { sx: 0, sy: 0, sw: iw, sh: ih, dx: 0, dy: 0, dw, dh };
}

function extractSegments(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  threshold: number,
): Segment[] {
  const segments: Segment[] = [];

  for (let y = 0; y < height; y += ROW_STEP) {
    let inRun = false;
    let startX = 0;

    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const alpha = data[i + 3] / 255;
      const lum = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255;
      const ink = alpha * (1 - lum);
      const dark = ink > threshold;

      if (dark && !inRun) {
        inRun = true;
        startX = x;
      } else if (!dark && inRun) {
        inRun = false;
        if (x - startX >= MIN_RUN) {
          segments.push({ x1: startX, y1: y, x2: x - 1, y2: y });
        }
      }
    }

    if (inRun && width - startX >= MIN_RUN) {
      segments.push({ x1: startX, y1: y, x2: width - 1, y2: y });
    }
  }

  return segments;
}

function mapSegmentsToCanvas(
  segments: Segment[],
  sampleW: number,
  sampleH: number,
  cover: CoverRect,
): Segment[] {
  return segments.map((segment) => {
    const toCanvasX = (x: number) => cover.dx + (x / sampleW) * cover.dw;
    const toCanvasY = (y: number) => cover.dy + (y / sampleH) * cover.dh;
    return {
      x1: toCanvasX(segment.x1),
      y1: toCanvasY(segment.y1),
      x2: toCanvasX(segment.x2),
      y2: toCanvasY(segment.y2),
    };
  });
}

function sortSegments(segments: Segment[]): Segment[] {
  return segments
    .map((segment, index) => ({
      segment,
      index,
      band: Math.floor(segment.y1 / 4),
      jitter: ((index * 17) % 97) / 97,
    }))
    .sort((a, b) => a.band - b.band || a.segment.x1 - b.segment.x1 || a.jitter - b.jitter)
    .map(({ segment }) => segment);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load sketch image: ${src}`));
    image.src = src;
  });
}

export function initSketchDrawReveal(root: HTMLElement): () => void {
  const canvas = root.querySelector<HTMLCanvasElement>(".sketch-draw-reveal__canvas");
  const fallback = root.querySelector<HTMLImageElement>(".sketch-draw-reveal__fallback");
  if (!canvas || !fallback) return () => {};

  const src = fallback.currentSrc || fallback.src;
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reducedMotion || root.dataset.sketchDrawReady === "1") {
    root.dataset.sketchDrawReady = "1";
    return () => {};
  }

  let disposed = false;
  let observer: IntersectionObserver | undefined;
  let resizeTimer: ReturnType<typeof setTimeout> | undefined;
  let rafId = 0;

  const cleanup = () => {
    disposed = true;
    observer?.disconnect();
    if (resizeTimer) clearTimeout(resizeTimer);
    if (rafId) cancelAnimationFrame(rafId);
  };

  const showFallback = () => {
    root.dataset.sketchDrawReady = "1";
    canvas.hidden = true;
    fallback.hidden = false;
  };

  const layoutCanvas = (iw: number, ih: number) => {
    const rect = root.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const height = Math.max(1, Math.round(rect.height));
    const width = Math.max(1, Math.round((iw / ih) * height));
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    return { width, height, dpr };
  };

  const prepare = async () => {
    try {
      const image = await loadImage(src);
      if (disposed) return;

      const iw = image.naturalWidth;
      const ih = image.naturalHeight;
      const { width, height, dpr } = layoutCanvas(iw, ih);
      const ctx = canvas.getContext("2d", { alpha: true });
      if (!ctx) {
        showFallback();
        return;
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "rgba(0, 0, 0, 0.92)";

      const cover = getHeightFitRect(iw, ih, height);
      const sampleH = Math.max(1, Math.round((ih / iw) * SAMPLE_WIDTH));
      const sampleCanvas = document.createElement("canvas");
      sampleCanvas.width = SAMPLE_WIDTH;
      sampleCanvas.height = sampleH;
      const sampleCtx = sampleCanvas.getContext("2d", { willReadFrequently: true });
      if (!sampleCtx) {
        showFallback();
        return;
      }

      sampleCtx.drawImage(
        image,
        cover.sx,
        cover.sy,
        cover.sw,
        cover.sh,
        0,
        0,
        SAMPLE_WIDTH,
        sampleH,
      );

      const sampleData = sampleCtx.getImageData(0, 0, SAMPLE_WIDTH, sampleH).data;
      const segments = sortSegments(
        mapSegmentsToCanvas(
          extractSegments(sampleData, SAMPLE_WIDTH, sampleH, 0.34),
          SAMPLE_WIDTH,
          sampleH,
          cover,
        ),
      );

      if (!segments.length) {
        showFallback();
        return;
      }

      canvas.hidden = false;
      root.dataset.sketchDrawReady = "1";

      const drawCompletedImage = () => {
        const nextLayout = layoutCanvas(iw, ih);
        const completedCtx = canvas.getContext("2d");
        if (!completedCtx) return;
        const nextCover = getHeightFitRect(iw, ih, nextLayout.height);
        completedCtx.setTransform(nextLayout.dpr, 0, 0, nextLayout.dpr, 0, 0);
        completedCtx.clearRect(0, 0, nextLayout.width, nextLayout.height);
        completedCtx.drawImage(
          image,
          nextCover.sx,
          nextCover.sy,
          nextCover.sw,
          nextCover.sh,
          nextCover.dx,
          nextCover.dy,
          nextCover.dw,
          nextCover.dh,
        );
      };

      const durationMs = 5200;
      const batchSize = Math.max(24, Math.ceil(segments.length / (durationMs / 16)));
      let index = 0;
      let started = false;

      const drawBatch = () => {
        if (disposed) return;

        if (!started) {
          started = true;
          fallback.hidden = true;
        }

        const end = Math.min(index + batchSize, segments.length);
        ctx.beginPath();
        for (let i = index; i < end; i++) {
          const segment = segments[i];
          ctx.lineWidth = 1.1;
          ctx.moveTo(segment.x1, segment.y1);
          ctx.lineTo(segment.x2, segment.y2);
        }
        ctx.stroke();
        index = end;

        if (index < segments.length) {
          rafId = requestAnimationFrame(drawBatch);
        } else {
          root.dataset.sketchDrawComplete = "1";
          // The sketch pass only inks dark edge pixels, so it never fully
          // covers the photo on its own — paint the real image now so the
          // background actually becomes visible once the reveal finishes.
          drawCompletedImage();
        }
      };

      const play = () => {
        if (disposed || root.dataset.sketchDrawComplete === "1" || started) return;
        drawBatch();
      };

      if ("IntersectionObserver" in window) {
        observer = new IntersectionObserver(
          (entries) => {
            if (entries.some((entry) => entry.isIntersecting)) {
              play();
              observer?.disconnect();
            }
          },
          { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
        );
        observer.observe(root);
      } else {
        play();
      }

      const onResize = () => {
        if (root.dataset.sketchDrawComplete !== "1") return;
        resizeTimer = setTimeout(() => {
          if (disposed) return;
          drawCompletedImage();
        }, 120);
      };

      window.addEventListener("resize", onResize, { passive: true });

      return () => {
        window.removeEventListener("resize", onResize);
      };
    } catch {
      showFallback();
    }
  };

  void prepare();
  return cleanup;
}

export function bootSketchDrawReveal() {
  document.querySelectorAll<HTMLElement>("[data-sketch-draw]").forEach((root) => {
    initSketchDrawReveal(root);
  });
}

if (typeof document !== "undefined") {
  const run = () => bootSketchDrawReveal();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run, { once: true });
  } else {
    run();
  }
}
