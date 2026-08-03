/**
 * Homepage hero idle demo — scripted Q&A under the brand icon.
 * Stops when the visitor engages (scroll, click, key).
 */

import type { HeroDemoExchange } from "./heroDemoConversation";

const ENGAGED_KEY = "hero-demo-engaged";
const THINK_MS = 900;
const HOLD_MS = 4200;
const EXIT_MS = 650;
const GAP_MS = 700;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseExchanges(raw: string | undefined): HeroDemoExchange[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as HeroDemoExchange[];
    return parsed.filter((e) => e.prompt?.trim() && e.answer?.trim());
  } catch {
    return [];
  }
}

function createLine(text: string, role: "user" | "assistant", kind: HeroDemoExchange["kind"]): HTMLElement {
  const line = document.createElement("p");
  line.className = `home-hero-demo-line home-hero-demo-line--${role}`;
  if (kind === "slash" && role === "user") {
    line.classList.add("home-hero-demo-line--slash");
  }
  line.textContent = text;
  return line;
}

function animateExit(lines: HTMLElement[]): Promise<void> {
  if (!lines.length) return Promise.resolve();
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced) {
    lines.forEach((line) => line.remove());
    return Promise.resolve();
  }

  lines.forEach((line) => line.classList.add("home-hero-demo-line--exit"));

  return new Promise((resolve) => {
    window.setTimeout(() => {
      lines.forEach((line) => line.remove());
      resolve();
    }, EXIT_MS);
  });
}

export function initHeroDemoLoop(root: HTMLElement) {
  if (root.dataset.heroDemoBound === "1") return;
  root.dataset.heroDemoBound = "1";

  const exchanges = parseExchanges(root.dataset.exchanges);
  if (!exchanges.length) return;

  const stack = root.querySelector<HTMLElement>("[data-hero-demo-stack]");
  if (!stack) return;

  if (sessionStorage.getItem(ENGAGED_KEY) === "1") {
    root.hidden = true;
    return;
  }

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let index = Math.floor(Math.random() * exchanges.length);
  let running = true;

  const stop = () => {
    if (!running) return;
    running = false;
    sessionStorage.setItem(ENGAGED_KEY, "1");
    void animateExit([...stack.querySelectorAll<HTMLElement>(".home-hero-demo-line")]).then(() => {
      root.hidden = true;
    });
  };

  const onEngage = () => stop();

  document.addEventListener("pointerdown", onEngage, { once: true, passive: true });
  document.addEventListener("keydown", onEngage, { once: true });
  document.addEventListener("scroll", onEngage, { once: true, passive: true });

  const cycle = async () => {
    if (!running) return;

    const exchange = exchanges[index]!;
    index = (index + 1) % exchanges.length;

    stack.replaceChildren();

    const promptLine = createLine(exchange.prompt, "user", exchange.kind);
    if (!reducedMotion) promptLine.classList.add("home-hero-demo-line--enter");
    stack.appendChild(promptLine);

    await wait(THINK_MS);
    if (!running) return;

    const answerLine = createLine(exchange.answer, "assistant", exchange.kind);
    if (!reducedMotion) answerLine.classList.add("home-hero-demo-line--enter");
    stack.appendChild(answerLine);

    await wait(HOLD_MS);
    if (!running) return;

    await animateExit([promptLine, answerLine]);
    if (!running) return;

    await wait(GAP_MS);
    if (!running) return;

    void cycle();
  };

  void cycle();
}

export function bootHeroDemoLoop() {
  document.querySelectorAll<HTMLElement>("[data-hero-demo]").forEach(initHeroDemoLoop);
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootHeroDemoLoop, { once: true });
  } else {
    bootHeroDemoLoop();
  }
  document.addEventListener("astro:page-load", bootHeroDemoLoop);
}
