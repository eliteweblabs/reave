/**
 * Interactive compare-page flow — SVG.js charts, step nav, and detail panels.
 */
import { SVG, Svg, Element as SvgElement } from "@svgdotjs/svg.js";

export type CompareFlowData = {
  companyName: string;
  licenseBreakdown: { id: string; label: string; pct: number; tone: string }[];
  wasteSpectrum: {
    id: string;
    severity: string;
    theme: string;
    headline: string;
    stat: string;
    detail: string;
    source: string;
  }[];
  moneyStats: { label: string; value: string; source: string }[];
  compareMatrix: {
    dimension: string;
    saas: string;
    saasNote: string;
    reave: string;
    reaveNote: string;
    custom: string;
    customNote: string;
  }[];
  costScenarios: {
    label: string;
    year1: string;
    year3: string;
    tone: string;
    note: string;
    year3Num: number;
  }[];
};

const TONE_COLORS: Record<string, string> = {
  active: "#4ade80",
  under: "#fb923c",
  shelf: "#f87171",
  saas: "#f87171",
  reave: "#a855f7",
  custom: "#fb923c",
};

const IND_COLORS: Record<string, string> = {
  strong: "#4ade80",
  mixed: "#fbbf24",
  weak: "#f87171",
};

type StepId = string;

function discoverSteps(root: HTMLElement): StepId[] {
  return Array.from(root.querySelectorAll<HTMLElement>("[data-cmp-step]"))
    .map((el) => el.dataset.cmpStep)
    .filter((id): id is StepId => Boolean(id));
}

function parseMoneyK(value: string): number {
  const m = value.replace(/[~$,]/g, "").match(/([\d.]+)\s*K/i);
  return m ? parseFloat(m[1]) : 0;
}

export function enrichCostScenarios(
  scenarios: CompareFlowData["costScenarios"],
): CompareFlowData["costScenarios"] {
  return scenarios.map((s) => ({
    ...s,
    year3Num: s.year3Num ?? parseMoneyK(s.year3),
  }));
}

function toneColor(tone: string): string {
  return TONE_COLORS[tone] ?? "#a855f7";
}

function drawDonut(
  host: HTMLElement,
  segments: CompareFlowData["licenseBreakdown"],
  onSelect: (id: string | null) => void,
): () => void {
  host.innerHTML = "";
  const size = Math.min(host.clientWidth || 280, 280);
  const draw = SVG().addTo(host).size(size, size);
  const cx = size / 2;
  const cy = size / 2;
  const outer = size * 0.38;
  const inner = size * 0.26;
  let start = -90;
  let selected: string | null = null;

  const arcs: { id: string; el: SvgElement; mid: number }[] = [];

  segments.forEach((seg) => {
    const sweep = (seg.pct / 100) * 360;
    const end = start + sweep;
    const mid = start + sweep / 2;
    const large = sweep > 180 ? 1 : 0;
    const rad = (deg: number) => (deg * Math.PI) / 180;
    const x1 = cx + outer * Math.cos(rad(start));
    const y1 = cy + outer * Math.sin(rad(start));
    const x2 = cx + outer * Math.cos(rad(end));
    const y2 = cy + outer * Math.sin(rad(end));
    const xi1 = cx + inner * Math.cos(rad(end));
    const yi1 = cy + inner * Math.sin(rad(end));
    const xi2 = cx + inner * Math.cos(rad(start));
    const yi2 = cy + inner * Math.sin(rad(start));
    const d = [
      `M ${x1} ${y1}`,
      `A ${outer} ${outer} 0 ${large} 1 ${x2} ${y2}`,
      `L ${xi1} ${yi1}`,
      `A ${inner} ${inner} 0 ${large} 0 ${xi2} ${yi2}`,
      "Z",
    ].join(" ");
    const path = draw
      .path(d)
      .fill(toneColor(seg.tone))
      .opacity(0.88)
      .stroke({ color: "rgba(0,0,0,0.35)", width: 1 })
      .css({ cursor: "pointer", transition: "opacity 0.2s, transform 0.2s" });

    path.on("mouseenter", () => {
      if (selected !== seg.id) path.opacity(1);
    });
    path.on("mouseleave", () => {
      if (selected !== seg.id) path.opacity(0.88);
    });
    path.on("click", () => {
      selected = selected === seg.id ? null : seg.id;
      arcs.forEach(({ id, el }) => {
        const on = selected === null || selected === id;
        el.opacity(on ? (selected === id ? 1 : 0.88) : 0.35);
      });
      onSelect(selected);
    });

    arcs.push({ id: seg.id, el: path, mid });
    start = end;
  });

  draw
    .text("65%")
    .font({ size: size * 0.14, weight: 800, family: "inherit" })
    .fill("#fff")
    .center(cx, cy - 6);
  draw
    .text("wasted")
    .font({ size: size * 0.055, weight: 600, family: "inherit" })
    .fill("rgba(255,255,255,0.55)")
    .center(cx, cy + size * 0.07);

  return () => draw.remove();
}

function drawCostBars(host: HTMLElement, scenarios: CompareFlowData["costScenarios"]): () => void {
  host.innerHTML = "";
  const w = host.clientWidth || 640;
  const rowH = 52;
  const padL = 140;
  const padR = 72;
  const h = scenarios.length * rowH + 24;
  const max = Math.max(...scenarios.map((s) => s.year3Num), 1);
  const draw = SVG().addTo(host).size(w, h);

  scenarios.forEach((s, i) => {
    const y = 12 + i * rowH;
    const barW = ((w - padL - padR) * s.year3Num) / max;
    const color = toneColor(s.tone);

    draw
      .text(s.label)
      .font({ size: 11, weight: 600, family: "inherit" })
      .fill("rgba(255,255,255,0.78)")
      .move(0, y + 14);

    const bar = draw
      .rect(barW, 28)
      .move(padL, y + 6)
      .radius(8)
      .fill(color)
      .opacity(0.35)
      .stroke({ color, width: 1, opacity: 0.6 });

    bar.animate(600, 80 * i, "now").size(barW, 28).move(padL, y + 6);

    draw
      .text(s.year3)
      .font({ size: 13, weight: 800, family: "inherit" })
      .fill("#fff")
      .move(padL + barW + 10, y + 12);

    draw
      .text(`Yr 1: ${s.year1}`)
      .font({ size: 9, weight: 500, family: "inherit" })
      .fill("rgba(255,255,255,0.42)")
      .move(padL, y + 36);
  });

  return () => draw.remove();
}

function drawSpine(host: HTMLElement, steps: StepId[], activeStep: StepId): () => void {
  host.innerHTML = "";
  if (steps.length === 0) return () => {};
  const h = host.clientHeight || 480;
  const draw = SVG().addTo(host).size(48, h);
  const span = steps.length > 1 ? (h - 56) / (steps.length - 1) : 0;
  const stepY = steps.map((_, i) => 28 + i * span);

  draw
    .line(24, stepY[0], 24, stepY[stepY.length - 1])
    .stroke({ color: "rgba(255,255,255,0.12)", width: 2, linecap: "round" });

  const activeIdx = Math.max(0, steps.indexOf(activeStep));
  const progY = stepY[activeIdx] ?? stepY[0];
  draw
    .line(24, stepY[0], 24, progY)
    .stroke({ color: "#a855f7", width: 2, linecap: "round" })
    .opacity(0.85);

  steps.forEach((stepId, i) => {
    const y = stepY[i];
    const on = stepId === activeStep;
    const done = i < activeIdx;
    draw
      .circle(on ? 14 : 10)
      .center(24, y)
      .fill(on ? "#a855f7" : done ? "rgba(168,85,247,0.35)" : "rgba(255,255,255,0.08)")
      .stroke({ color: on ? "#c084fc" : "rgba(255,255,255,0.15)", width: on ? 2 : 1 });
  });

  return () => draw.remove();
}

function setActiveStep(root: HTMLElement, stepId: StepId, steps: StepId[], scroll = true): void {
  root.querySelectorAll<HTMLElement>("[data-cmp-step]").forEach((el) => {
    el.classList.toggle("cmp-flow-step--active", el.dataset.cmpStep === stepId);
  });
  root.querySelectorAll<HTMLElement>("[data-cmp-nav]").forEach((btn) => {
    const on = btn.dataset.cmpNav === stepId;
    btn.classList.toggle("cmp-flow-nav__btn--active", on);
    btn.setAttribute("aria-current", on ? "step" : "false");
  });
  const spine = root.querySelector<HTMLElement>("[data-cmp-spine]");
  if (spine) {
    const cleanup = (spine as HTMLElement & { _cmpSpineCleanup?: () => void })._cmpSpineCleanup;
    cleanup?.();
    (spine as HTMLElement & { _cmpSpineCleanup?: () => void })._cmpSpineCleanup = drawSpine(
      spine,
      steps,
      stepId,
    );
  }
  if (scroll) {
    const panel = root.querySelector<HTMLElement>(`#cmp-panel-${stepId}`);
    panel?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function bindDetailPanel(
  root: HTMLElement,
  wasteSpectrum: CompareFlowData["wasteSpectrum"],
): void {
  const detail = root.querySelector<HTMLElement>("[data-cmp-detail]");
  const defaultHtml = detail?.innerHTML ?? "";

  root.querySelectorAll<HTMLElement>("[data-cmp-tier]").forEach((card) => {
    card.addEventListener("click", () => {
      const id = card.dataset.cmpTier;
      const tier = wasteSpectrum.find((t) => t.id === id);
      if (!tier || !detail) return;
      const wasActive = card.classList.contains("cmp-tier--selected");
      root.querySelectorAll(".cmp-tier--selected").forEach((el) => el.classList.remove("cmp-tier--selected"));
      if (wasActive) {
        detail.innerHTML = defaultHtml;
        return;
      }
      card.classList.add("cmp-tier--selected");
      detail.innerHTML = `
        <p class="cmp-detail-kicker">${tier.theme} · ${tier.severity}</p>
        <p class="cmp-detail-stat">${tier.stat}</p>
        <p class="cmp-detail-headline">${tier.headline}</p>
        <p class="cmp-detail-body">${tier.detail}</p>
        <p class="cmp-detail-source">${tier.source}</p>
      `;
    });
  });
}

function bindDonutLegend(
  root: HTMLElement,
  segments: CompareFlowData["licenseBreakdown"],
  onSelect: (id: string | null) => void,
): void {
  root.querySelectorAll<HTMLElement>("[data-cmp-seg]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.cmpSeg ?? null;
      const was = btn.classList.contains("cmp-legend--active");
      root.querySelectorAll(".cmp-legend--active").forEach((el) => el.classList.remove("cmp-legend--active"));
      onSelect(was ? null : id);
      if (!was && id) btn.classList.add("cmp-legend--active");
    });
  });

  const legendDetail = root.querySelector<HTMLElement>("[data-cmp-seg-detail]");
  if (!legendDetail) return;
  const defaultLegend = legendDetail.innerHTML;

  root.addEventListener("cmp-seg-select", ((e: CustomEvent<string | null>) => {
    const id = e.detail;
    if (!id) {
      legendDetail.innerHTML = defaultLegend;
      root.querySelectorAll(".cmp-legend--active").forEach((el) => el.classList.remove("cmp-legend--active"));
      return;
    }
    const seg = segments.find((s) => s.id === id);
    if (!seg) return;
    root.querySelectorAll<HTMLElement>("[data-cmp-seg]").forEach((el) => {
      el.classList.toggle("cmp-legend--active", el.dataset.cmpSeg === id);
    });
    legendDetail.innerHTML = `
      <strong>${seg.pct}%</strong> ${seg.label} —
      ${id === "active" ? "Seats your team actually uses." : id === "under" ? "Paying for capacity nobody touches." : "Licenses with zero logins."}
    `;
  }) as EventListener);
}

function bindMatrix(root: HTMLElement): void {
  const table = root.querySelector<HTMLElement>("[data-cmp-matrix]");
  if (!table) return;

  table.querySelectorAll<HTMLElement>("[data-cmp-col]").forEach((th) => {
    th.addEventListener("mouseenter", () => {
      const col = th.dataset.cmpCol;
      table.dataset.highlightCol = col ?? "";
    });
    th.addEventListener("mouseleave", () => {
      delete table.dataset.highlightCol;
    });
    th.addEventListener("click", () => {
      const col = th.dataset.cmpCol;
      if (!col) return;
      table.dataset.pinCol = table.dataset.pinCol === col ? "" : col;
      table.dataset.highlightCol = table.dataset.pinCol || "";
    });
  });

  table.querySelectorAll<HTMLElement>("tbody tr").forEach((row) => {
    row.addEventListener("mouseenter", () => {
      row.classList.add("cmp-matrix-row--hover");
    });
    row.addEventListener("mouseleave", () => {
      row.classList.remove("cmp-matrix-row--hover");
    });
  });
}

function bindScrollSpy(root: HTMLElement, steps: StepId[]): () => void {
  const panels = steps
    .map((id) => root.querySelector<HTMLElement>(`#cmp-panel-${id}`))
    .filter(Boolean) as HTMLElement[];

  const observer = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((e) => e.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!visible?.target.id) return;
      const stepId = visible.target.id.replace("cmp-panel-", "");
      if (steps.includes(stepId)) setActiveStep(root, stepId, steps, false);
    },
    { rootMargin: "-20% 0px -55% 0px", threshold: [0.15, 0.4, 0.7] },
  );

  panels.forEach((p) => observer.observe(p));
  return () => observer.disconnect();
}

export function initCompareFlow(root: HTMLElement, data: CompareFlowData): () => void {
  if (!root || root.dataset.cmpFlowInit === "1") return () => {};
  root.dataset.cmpFlowInit = "1";

  const steps = discoverSteps(root);
  const firstStep = steps[0] ?? "waste";
  const cleanups: (() => void)[] = [];

  const donutHost = root.querySelector<HTMLElement>("[data-cmp-donut]");
  if (donutHost) {
    const onSelect = (id: string | null) => {
      root.dispatchEvent(new CustomEvent("cmp-seg-select", { detail: id }));
    };
    cleanups.push(drawDonut(donutHost, data.licenseBreakdown, onSelect));
    bindDonutLegend(root, data.licenseBreakdown, onSelect);
  }

  const costHost = root.querySelector<HTMLElement>("[data-cmp-cost-chart]");
  if (costHost) {
    const renderCost = () => cleanups.push(drawCostBars(costHost, data.costScenarios));
    renderCost();
    const ro = new ResizeObserver(() => {
      cleanups.pop()?.();
      renderCost();
    });
    ro.observe(costHost);
    cleanups.push(() => ro.disconnect());
  }

  const spineWrap = root.querySelector<HTMLElement>("[data-cmp-spine-wrap]");
  const spine = root.querySelector<HTMLElement>("[data-cmp-spine]");
  if (spineWrap && spine && steps.length > 0) {
    spineWrap.style.setProperty("--cmp-step-count", String(steps.length));
    const redrawSpine = (active: StepId) => {
      (spine as HTMLElement & { _cmpSpineCleanup?: () => void })._cmpSpineCleanup?.();
      (spine as HTMLElement & { _cmpSpineCleanup?: () => void })._cmpSpineCleanup = drawSpine(
        spine,
        steps,
        active,
      );
    };
    redrawSpine(firstStep);
    const spineRo = new ResizeObserver(() => {
      const active = root.querySelector(".cmp-flow-nav__btn--active")?.getAttribute("data-cmp-nav") ?? firstStep;
      redrawSpine(active);
    });
    spineRo.observe(spineWrap);
    cleanups.push(() => spineRo.disconnect());
  }

  bindDetailPanel(root, data.wasteSpectrum);
  bindMatrix(root);

  root.querySelectorAll<HTMLElement>("[data-cmp-nav]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const step = btn.dataset.cmpNav;
      if (step && steps.includes(step)) setActiveStep(root, step, steps);
    });
  });

  cleanups.push(bindScrollSpy(root, steps));

  return () => {
    cleanups.forEach((fn) => fn());
    delete root.dataset.cmpFlowInit;
  };
}

export { IND_COLORS };
