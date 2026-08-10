/**
 * Compare — SVG.js graph dashboard (line, radar, network, radial, heatmap).
 */
import { SVG, Element as SvgElement } from "@svgdotjs/svg.js";
import type { CompareIndicator } from "../lib/comparePageData";

export type CompareGraphData = {
  companyName: string;
  licenseBreakdown: { id: string; label: string; pct: number; tone: string }[];
  wasteSpectrum: {
    id: string;
    theme: string;
    headline: string;
    stat: string;
    detail: string;
  }[];
  compareMatrix: {
    dimension: string;
    saas: CompareIndicator;
    reave: CompareIndicator;
    custom: CompareIndicator;
    saasNote: string;
    reaveNote: string;
    customNote: string;
  }[];
  radarDimensions: readonly string[];
  spectrumRadial: { id: string; label: string; value: number; color: string; stat: string }[];
  tcoCumulative: {
    labels: readonly string[];
    series: { id: string; label: string; color: string; values: readonly number[] }[];
  };
};

const TONE: Record<string, string> = {
  active: "#4ade80",
  under: "#fb923c",
  shelf: "#f87171",
  saas: "#f87171",
  reave: "#a855f7",
  custom: "#fb923c",
};

const PATH_COLORS = { saas: "#f87171", reave: "#a855f7", custom: "#fb923c" } as const;

function hostSize(host: HTMLElement): { w: number; h: number } {
  const w = Math.max(1, Math.round(host.clientWidth || 640));
  const h = Math.max(1, Math.round(host.clientHeight || 320));
  return { w, h };
}

/** Mount an SVG root that cannot inflate the host via inline baseline gap. */
function createDraw(host: HTMLElement, w: number, h: number) {
  const draw = SVG().addTo(host).size(w, h);
  draw.css({ display: "block", overflow: "hidden" });
  return draw;
}

function setCaption(root: HTMLElement, key: string, html: string): void {
  const el = root.querySelector<HTMLElement>(`[data-cg-caption="${key}"]`);
  if (el) el.innerHTML = html;
}

function score(ind: CompareIndicator): number {
  return ind === "strong" ? 3 : ind === "mixed" ? 2 : 1;
}

/** Cumulative TCO — multi-series line chart with area fills. */
function drawTcoChart(
  host: HTMLElement,
  data: CompareGraphData["tcoCumulative"],
  root: HTMLElement,
  animate: boolean,
): () => void {
  host.innerHTML = "";
  const { w, h } = hostSize(host);
  const pad = { t: 24, r: 20, b: 44, l: 48 };
  const draw = createDraw(host, w, h);
  const innerW = w - pad.l - pad.r;
  const innerH = h - pad.t - pad.b;
  const labels = data.labels;
  const maxY = Math.max(...data.series.flatMap((s) => [...s.values]), 1);
  const n = labels.length;

  const xAt = (i: number) => pad.l + (i / (n - 1)) * innerW;
  const yAt = (v: number) => pad.t + innerH - (v / maxY) * innerH;

  // grid
  for (let g = 0; g <= 4; g++) {
    const y = pad.t + (g / 4) * innerH;
    draw.line(pad.l, y, w - pad.r, y).stroke({ color: "rgba(255,255,255,0.06)", width: 1 });
    const val = Math.round(maxY * (1 - g / 4));
    draw.text(`$${val}K`).font({ size: 9, family: "inherit" }).fill("rgba(255,255,255,0.35)").move(4, y - 5);
  }

  labels.forEach((lbl, i) => {
    if (i % 3 !== 0 && i !== n - 1) return;
    draw
      .text(lbl)
      .font({ size: 8, family: "inherit" })
      .fill("rgba(255,255,255,0.4)")
      .center(xAt(i), h - 16);
  });

  const visible = new Set(data.series.map((s) => s.id));

  data.series.forEach((series, si) => {
    const pts = series.values.map((v, i) => [xAt(i), yAt(v)] as const);
    const lineD = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p[0]} ${p[1]}`).join(" ");
    const areaD = `${lineD} L ${pts[pts.length - 1][0]} ${yAt(0)} L ${pts[0][0]} ${yAt(0)} Z`;

    const area = draw.path(areaD).fill(series.color).opacity(animate ? 0 : 0.08);
    const line = draw
      .path(lineD)
      .fill("none")
      .stroke({ color: series.color, width: 2.5, linecap: "round", linejoin: "round" });
    if (animate) {
      const len = line.length();
      line.attr({ "stroke-dasharray": len, "stroke-dashoffset": len });
      line.animate(900, si * 120, "now").attr({ "stroke-dashoffset": 0 });
      area.animate(700, 200 + si * 120, "now").opacity(0.08);
    }

    pts.forEach(([cx, cy], i) => {
      const dot = draw.circle(6).center(cx, cy).fill(series.color).opacity(0);
      dot.on("mouseenter", () => {
        setCaption(
          root,
          "tco",
          `<strong>${series.label}</strong> · ${labels[i]} · <strong>$${series.values[i]}K</strong> cumulative`,
        );
        dot.radius(8).opacity(1);
        line.stroke({ width: 3.5 });
      });
      dot.on("mouseleave", () => {
        dot.radius(6).opacity(0);
        line.stroke({ width: 2.5 });
      });
    });

    line.on("mouseenter", () => {
      setCaption(root, "tco", `<strong>${series.label}</strong> — cumulative spend over 3 years`);
    });

    const g = draw.group().attr("data-series", series.id);
    g.add(area);
    g.add(line);
    if (!visible.has(series.id)) g.opacity(0.15);
  });

  // legend
  let lx = pad.l;
  data.series.forEach((s) => {
    const hit = draw.rect(80, 18).move(lx, 4).fill("transparent").css({ cursor: "pointer" });
    draw.rect(10, 10).move(lx, 7).radius(2).fill(s.color);
    draw.text(s.label).font({ size: 10, weight: 600, family: "inherit" }).fill("rgba(255,255,255,0.75)").move(lx + 14, 5);
    hit.on("click", () => {
      if (visible.has(s.id)) visible.delete(s.id);
      else visible.add(s.id);
      draw.find(`[data-series="${s.id}"]`).forEach((el) => {
        (el as SvgElement).opacity(visible.has(s.id) ? 1 : 0.12);
      });
    });
    lx += 92;
  });

  return () => draw.remove();
}

/** License utilization donut. */
function drawUtilizationDonut(
  host: HTMLElement,
  segments: CompareGraphData["licenseBreakdown"],
  root: HTMLElement,
  animate: boolean,
): () => void {
  host.innerHTML = "";
  const size = Math.min(host.clientWidth || 280, host.clientHeight || 280, 300);
  const draw = createDraw(host, size, size);
  const cx = size / 2;
  const cy = size / 2;
  const outer = size * 0.4;
  const inner = size * 0.26;
  let start = -90;

  segments.forEach((seg) => {
    const sweep = (seg.pct / 100) * 360;
    const end = start + sweep;
    const large = sweep > 180 ? 1 : 0;
    const rad = (d: number) => (d * Math.PI) / 180;
    const x1 = cx + outer * Math.cos(rad(start));
    const y1 = cy + outer * Math.sin(rad(start));
    const x2 = cx + outer * Math.cos(rad(end));
    const y2 = cy + outer * Math.sin(rad(end));
    const xi1 = cx + inner * Math.cos(rad(end));
    const yi1 = cy + inner * Math.sin(rad(end));
    const xi2 = cx + inner * Math.cos(rad(start));
    const yi2 = cy + inner * Math.sin(rad(start));
    const d = `M ${x1} ${y1} A ${outer} ${outer} 0 ${large} 1 ${x2} ${y2} L ${xi1} ${yi1} A ${inner} ${inner} 0 ${large} 0 ${xi2} ${yi2} Z`;
    const color = TONE[seg.tone] ?? "#a855f7";
    const slice = draw
      .path(d)
      .fill(color)
      .opacity(animate ? 0 : 0.9)
      .stroke({ color: "rgba(0,0,0,0.3)", width: 1 })
      .css({ cursor: "pointer" });
    if (animate) slice.animate(500, (start + 90) * 1.2, "now").opacity(0.9);
    slice
      .on("mouseenter", () => {
        setCaption(root, "util", `<strong>${seg.pct}%</strong> ${seg.label} — click segments to explore waste.`);
      })
      .on("click", () => {
        setCaption(
          root,
          "util",
          `<strong>${seg.pct}%</strong> ${seg.label}. Vertice Q2 2026: 65% total waste (51% under + 14% shelf).`,
        );
      });
    start = end;
  });

  const pctText = draw
    .text("65%")
    .font({ size: size * 0.13, weight: 800, family: "inherit" })
    .fill("#fff")
    .center(cx, cy - 4)
    .opacity(animate ? 0 : 1);
  const wastedText = draw
    .text("wasted")
    .font({ size: size * 0.05, weight: 600, family: "inherit" })
    .fill("rgba(255,255,255,0.5)")
    .center(cx, cy + size * 0.06)
    .opacity(animate ? 0 : 1);
  if (animate) {
    pctText.animate(400, 280, "now").opacity(1);
    wastedText.animate(400, 340, "now").opacity(1);
  }

  return () => draw.remove();
}

/** Waste spectrum as radial bars. */
function drawRadialSpectrum(
  host: HTMLElement,
  items: CompareGraphData["spectrumRadial"],
  root: HTMLElement,
  animate: boolean,
): () => void {
  host.innerHTML = "";
  const size = Math.min(host.clientWidth || 320, host.clientHeight || 320, 340);
  const draw = createDraw(host, size, size);
  const cx = size / 2;
  const cy = size / 2;
  const maxR = size * 0.38;
  const n = items.length;

  items.forEach((item, i) => {
    const angle = -90 + (i / n) * 360;
    const rad = (angle * Math.PI) / 180;
    const len = (item.value / 100) * maxR;
    const x2 = cx + len * Math.cos(rad);
    const y2 = cy + len * Math.sin(rad);
    const bar = draw
      .line(cx, cy, animate ? cx : x2, animate ? cy : y2)
      .stroke({ color: item.color, width: 10, linecap: "round" })
      .opacity(0.85);
    if (animate) bar.animate(500, i * 60, "now").plot(cx, cy, x2, y2);

    const lx = cx + (maxR + 14) * Math.cos(rad);
    const ly = cy + (maxR + 14) * Math.sin(rad);
    draw
      .text(item.label)
      .font({ size: 8, weight: 600, family: "inherit" })
      .fill("rgba(255,255,255,0.65)")
      .center(lx, ly);

    bar.css({ cursor: "pointer" }).on("mouseenter", () => {
      setCaption(root, "spectrum", `<strong>${item.label}</strong> · ${item.stat}`);
    });
  });

  draw.circle(8).center(cx, cy).fill("#a855f7").opacity(0.8);

  return () => draw.remove();
}

/** Three topology mini-graphs: SaaS sprawl vs REAVE hub vs custom monolith. */
function drawTopology(host: HTMLElement, companyName: string, root: HTMLElement, animate: boolean): () => void {
  host.innerHTML = "";
  const { w, h } = hostSize(host);
  const draw = createDraw(host, w, h);
  const colW = w / 3;

  const panels = [
    {
      id: "saas",
      title: "Box SaaS",
      color: PATH_COLORS.saas,
      nodes: ["CRM", "QB", "Slack", "Cal", "Mail", "Sign", "HR", "Ads", "PM", "Drive"],
      hub: false,
    },
    {
      id: "reave",
      title: companyName,
      color: PATH_COLORS.reave,
      nodes: ["CRM", "Portal", "Billing", "Inbox", "AI", "Mobile"],
      hub: true,
    },
    {
      id: "custom",
      title: "Custom build",
      color: PATH_COLORS.custom,
      nodes: ["Monolith"],
      hub: true,
    },
  ] as const;

  panels.forEach((panel, col) => {
    const ox = col * colW + colW / 2;
    const oy = h / 2 + 8;
    draw
      .text(panel.title)
      .font({ size: 10, weight: 700, family: "inherit" })
      .fill(panel.color)
      .center(ox, 18);

    if (panel.id === "custom") {
      draw
        .rect(80, 48)
        .center(ox, oy)
        .radius(10)
        .fill(panel.color)
        .opacity(0.2)
        .stroke({ color: panel.color, width: 2 });
      draw.text("Single app").font({ size: 9, family: "inherit" }).fill("#fff").center(ox, oy - 4);
      draw.text("3–6 mo build").font({ size: 8, family: "inherit" }).fill("rgba(255,255,255,0.5)").center(ox, oy + 10);
      return;
    }

    const hubR = panel.hub ? 22 : 14;
    const hub = draw.circle(hubR * 2).center(ox, oy).fill(panel.color).opacity(panel.hub ? 0.35 : 0.2);
    hub.stroke({ color: panel.color, width: panel.hub ? 2 : 1 });
    draw
      .text(panel.hub ? "OS" : "Team")
      .font({ size: 8, weight: 700, family: "inherit" })
      .fill("#fff")
      .center(ox, oy);

    const satellites = panel.nodes;
    const orbit = Math.min(colW, h) * 0.32;
    satellites.forEach((label, i) => {
      const a = -Math.PI / 2 + (i / satellites.length) * Math.PI * 2;
      const nx = ox + orbit * Math.cos(a);
      const ny = oy + orbit * Math.sin(a);
      const edge = draw
        .line(ox, oy, animate ? ox : nx, animate ? oy : ny)
        .stroke({
          color: panel.color,
          width: panel.hub ? 1.5 : 1,
          dasharray: panel.hub ? undefined : "4 3",
          opacity: panel.hub ? 0.7 : 0.35,
        });
      if (animate) edge.animate(400, i * 30, "now").plot(ox, oy, nx, ny);

      const node = draw.circle(16).center(nx, ny).fill("rgba(255,255,255,0.06)").stroke({ color: panel.color, width: 1 });
      draw.text(label).font({ size: 6, weight: 600, family: "inherit" }).fill("rgba(255,255,255,0.7)").center(nx, ny);

      node.css({ cursor: "pointer" }).on("mouseenter", () => {
        node.fill(panel.color).opacity(0.35);
        setCaption(
          root,
          "topology",
          panel.hub
            ? `<strong>${panel.title}</strong> — ${label} shares one contact list and one login.`
            : `<strong>${label}</strong> — another silo. Data doesn't sync without Zapier duct tape.`,
        );
      });
      node.on("mouseleave", () => node.fill("rgba(255,255,255,0.06)").opacity(1));
    });
  });

  draw
    .line(colW, 36, colW, h - 12)
    .stroke({ color: "rgba(255,255,255,0.08)", width: 1 });
  draw
    .line(colW * 2, 36, colW * 2, h - 12)
    .stroke({ color: "rgba(255,255,255,0.08)", width: 1 });

  return () => draw.remove();
}

/** Radar chart — feature scores for three paths. */
function drawRadar(host: HTMLElement, data: CompareGraphData, root: HTMLElement, animate: boolean): () => void {
  host.innerHTML = "";
  const { w, h } = hostSize(host);
  const draw = createDraw(host, w, h);
  const cx = w / 2;
  const cy = h / 2 + 8;
  const maxR = Math.min(w, h) * 0.34;
  const axes = data.radarDimensions;
  const rows = axes
    .map((dim) => data.compareMatrix.find((r) => r.dimension === dim))
    .filter(Boolean) as CompareGraphData["compareMatrix"];
  const n = rows.length;
  if (n === 0) return () => draw.remove();

  const angleAt = (i: number) => -Math.PI / 2 + (i / n) * Math.PI * 2;
  const ptAt = (i: number, val: number) => {
    const r = (val / 3) * maxR;
    const a = angleAt(i);
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as const;
  };

  // rings
  [1, 2, 3].forEach((level) => {
    const ringPts = Array.from({ length: n }, (_, i) => ptAt(i, level));
    const d = ringPts.map((p, i) => `${i === 0 ? "M" : "L"} ${p[0]} ${p[1]}`).join(" ") + " Z";
    draw.path(d).fill("none").stroke({ color: "rgba(255,255,255,0.08)", width: 1 });
  });

  // axes + labels
  rows.forEach((row, i) => {
    const [x2, y2] = ptAt(i, 3);
    draw.line(cx, cy, x2, y2).stroke({ color: "rgba(255,255,255,0.1)", width: 1 });
    const [lx, ly] = ptAt(i, 3.55);
    draw
      .text(row.dimension)
      .font({ size: 7, weight: 600, family: "inherit" })
      .fill("rgba(255,255,255,0.55)")
      .center(lx, ly);
  });

  const paths = [
    { key: "saas" as const, label: "Box SaaS", color: PATH_COLORS.saas },
    { key: "reave" as const, label: data.companyName, color: PATH_COLORS.reave },
    { key: "custom" as const, label: "Custom", color: PATH_COLORS.custom },
  ];

  paths.forEach((path, pi) => {
    const vals = rows.map((r) => score(r[path.key]));
    const endPts = vals.map((v, i) => ptAt(i, v));
    const startPts = vals.map((_, i) => ptAt(i, 0));
    const endD = endPts.map((p, i) => `${i === 0 ? "M" : "L"} ${p[0]} ${p[1]}`).join(" ") + " Z";
    const startD = startPts.map((p, i) => `${i === 0 ? "M" : "L"} ${p[0]} ${p[1]}`).join(" ") + " Z";
    const poly = draw
      .path(animate ? startD : endD)
      .fill(path.color)
      .opacity(animate ? 0 : 0.18)
      .stroke({ color: path.color, width: 2, linejoin: "round" });
    if (animate) poly.animate(700, 120 + pi * 110, "now").attr({ d: endD }).opacity(0.18);

    poly.on("mouseenter", () => {
      poly.opacity(0.32).stroke({ width: 3 });
      setCaption(root, "radar", `<strong>${path.label}</strong> — hover axes for dimension detail.`);
    });
    poly.on("mouseleave", () => poly.opacity(0.18).stroke({ width: 2 }));
  });

  return () => draw.remove();
}

/** Grouped horizontal bar heatmap from full feature matrix. */
function drawFeatureHeatmap(host: HTMLElement, data: CompareGraphData, root: HTMLElement, animate: boolean): () => void {
  host.innerHTML = "";
  const { w } = hostSize(host);
  const rowH = 22;
  const padL = 130;
  const barW = 36;
  const gap = 6;
  const h = data.compareMatrix.length * rowH + 36;
  const draw = createDraw(host, w, h);

  const paths = [
    { key: "saas" as const, label: "SaaS", color: PATH_COLORS.saas },
    { key: "reave" as const, label: "REAVE", color: PATH_COLORS.reave },
    { key: "custom" as const, label: "Custom", color: PATH_COLORS.custom },
  ];

  paths.forEach((p, pi) => {
    draw
      .text(p.label)
      .font({ size: 8, weight: 700, family: "inherit" })
      .fill(p.color)
      .move(padL + pi * (barW + gap) + 4, 8);
  });

  data.compareMatrix.forEach((row, i) => {
    const y = 28 + i * rowH;
    draw
      .text(row.dimension)
      .font({ size: 8, weight: 600, family: "inherit" })
      .fill("rgba(255,255,255,0.72)")
      .move(0, y + 4);

    paths.forEach((p, pi) => {
      const s = score(row[p.key]);
      const x = padL + pi * (barW + gap);
      const bh = (s / 3) * (rowH - 8);
      const bar = draw
        .rect(barW, animate ? 0 : bh)
        .move(x, animate ? y + rowH - 4 : y + rowH - 4 - bh)
        .radius(4)
        .fill(p.color)
        .opacity(0.25 + s * 0.2);
      if (animate) bar.animate(400, i * 20, "now").size(barW, bh).move(x, y + rowH - 4 - bh);

      bar.css({ cursor: "pointer" }).on("mouseenter", () => {
        bar.opacity(0.95);
        const note = row[`${p.key}Note` as keyof typeof row];
        setCaption(root, "heatmap", `<strong>${row.dimension}</strong> · ${p.label}: ${note}`);
      });
      bar.on("mouseleave", () => bar.opacity(0.25 + s * 0.2));
    });
  });

  return () => draw.remove();
}

/** 90/10 arc gauge — fills the host canvas. */
function drawNinetyGauge(host: HTMLElement, companyName: string, root: HTMLElement, animate: boolean): () => void {
  host.innerHTML = "";
  const { w, h } = hostSize(host);
  const draw = createDraw(host, w, h);
  const size = Math.min(w, h / 0.72);
  const cx = w / 2;
  const cy = h * 0.58;
  const r = Math.min(size * 0.38, w * 0.36, h * 0.42);
  const strokeW = Math.max(12, Math.min(22, r * 0.12));
  const labelR = r + Math.max(20, strokeW + 10);
  const pctSize = Math.max(11, Math.min(16, r * 0.08));
  const labelSize = Math.max(7, Math.min(11, r * 0.055));
  const nameSize = Math.max(10, Math.min(14, r * 0.07));
  const start = Math.PI;
  const end = 0;

  const arc = (from: number, to: number, color: string, label: string, pct: string, delay: number) => {
    const x1 = cx + r * Math.cos(from);
    const y1 = cy + r * Math.sin(from);
    const x2 = cx + r * Math.cos(to);
    const y2 = cy + r * Math.sin(to);
    const large = to - from > Math.PI ? 1 : 0;
    const path = draw
      .path(`M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`)
      .fill("none")
      .stroke({ color, width: strokeW, linecap: "round" })
      .opacity(0.85);
    if (animate) {
      const len = path.length();
      path.attr({ "stroke-dasharray": len, "stroke-dashoffset": len });
      path.animate(900, delay, "now").attr({ "stroke-dashoffset": 0 });
    }

    const mid = (from + to) / 2;
    const lx = cx + labelR * Math.cos(mid);
    const ly = cy + labelR * Math.sin(mid);
    const pctEl = draw
      .text(pct)
      .font({ size: pctSize, weight: 800, family: "inherit" })
      .fill("#fff")
      .center(lx, ly - 4)
      .opacity(animate ? 0 : 1);
    const labelEl = draw
      .text(label)
      .font({ size: labelSize, weight: 600, family: "inherit" })
      .fill("rgba(255,255,255,0.55)")
      .center(lx, ly + 8)
      .opacity(animate ? 0 : 1);
    if (animate) {
      pctEl.animate(400, delay + 450, "now").opacity(1);
      labelEl.animate(400, delay + 520, "now").opacity(1);
    }
  };

  arc(start, start + 0.9 * Math.PI, "#a855f7", "Core OS", "90%", 80);
  arc(start + 0.9 * Math.PI + 0.02, end - 0.02, "#38bdf8", "Bolt-ons", "+10%", 280);

  const nameEl = draw
    .text(companyName)
    .font({ size: nameSize, weight: 700, family: "inherit" })
    .fill("rgba(255,255,255,0.7)")
    .center(cx, cy + Math.max(8, r * 0.08))
    .opacity(animate ? 0 : 1);
  if (animate) nameEl.animate(450, 700, "now").opacity(1);

  setCaption(root, "gauge", `<strong>90%</strong> ships day one. <strong>10%</strong> makes it yours.`);

  return () => draw.remove();
}

function observeGraph(host: HTMLElement, render: (animate: boolean) => () => void, cleanups: (() => void)[]): void {
  let cleanup = () => {};
  let lastW = 0;
  let lastH = 0;
  let raf = 0;
  let entered = false;

  const run = (animate: boolean) => {
    const { w, h } = hostSize(host);
    if (w === lastW && h === lastH) return;
    lastW = w;
    lastH = h;
    cleanup();
    cleanup = render(animate);
  };

  const play = () => {
    if (entered) return;
    entered = true;
    lastW = 0;
    lastH = 0;
    run(true);
  };

  if (typeof IntersectionObserver !== "undefined") {
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          play();
          io.disconnect();
        }
      },
      { threshold: 0.2, rootMargin: "0px 0px -6% 0px" },
    );
    io.observe(host);
    cleanups.push(() => io.disconnect());
  } else {
    play();
  }

  cleanups.push(() => cleanup());

  const ro = new ResizeObserver(() => {
    if (!entered) return;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => run(false));
  });
  ro.observe(host);
  cleanups.push(() => {
    cancelAnimationFrame(raf);
    ro.disconnect();
  });
}

export function initCompareGraphs(root: HTMLElement, data: CompareGraphData): () => void {
  if (!root || root.dataset.cgInit === "1") return () => {};
  root.dataset.cgInit = "1";
  const cleanups: (() => void)[] = [];

  const mounts: [string, (animate: boolean) => () => void][] = [
    ["[data-cg-tco]", (animate) => drawTcoChart(root.querySelector("[data-cg-tco]")!, data.tcoCumulative, root, animate)],
    [
      "[data-cg-util]",
      (animate) => drawUtilizationDonut(root.querySelector("[data-cg-util]")!, data.licenseBreakdown, root, animate),
    ],
    [
      "[data-cg-spectrum]",
      (animate) => drawRadialSpectrum(root.querySelector("[data-cg-spectrum]")!, data.spectrumRadial, root, animate),
    ],
    [
      "[data-cg-topology]",
      (animate) => drawTopology(root.querySelector("[data-cg-topology]")!, data.companyName, root, animate),
    ],
    ["[data-cg-radar]", (animate) => drawRadar(root.querySelector("[data-cg-radar]")!, data, root, animate)],
    ["[data-cg-heatmap]", (animate) => drawFeatureHeatmap(root.querySelector("[data-cg-heatmap]")!, data, root, animate)],
    [
      "[data-cg-gauge]",
      (animate) => drawNinetyGauge(root.querySelector("[data-cg-gauge]")!, data.companyName, root, animate),
    ],
  ];

  mounts.forEach(([sel, renderFn]) => {
    const host = root.querySelector<HTMLElement>(sel);
    if (host) observeGraph(host, renderFn, cleanups);
  });

  return () => {
    cleanups.forEach((fn) => fn());
    delete root.dataset.cgInit;
  };
}
