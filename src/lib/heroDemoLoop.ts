/**
 * Homepage hero idle demo — scripted chat under the brand icon.
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

function cloneAvatar(role: "user" | "assistant", root: HTMLElement): HTMLElement {
  const templateId = role === "assistant" ? "hero-demo-agent-avatar" : "hero-demo-user-avatar";
  const tpl = root.querySelector<HTMLTemplateElement>(`#${templateId}`);
  if (tpl?.content.firstElementChild) {
    return tpl.content.firstElementChild.cloneNode(true) as HTMLElement;
  }

  const fallback = document.createElement("span");
  fallback.className = `home-hero-demo-avatar home-hero-demo-avatar--${role === "assistant" ? "agent" : "user"}`;
  fallback.setAttribute("aria-hidden", "true");
  return fallback;
}

function createMessage(
  text: string,
  role: "user" | "assistant",
  kind: HeroDemoExchange["kind"],
  root: HTMLElement,
): HTMLElement {
  const row = document.createElement("div");
  row.className = `home-hero-demo-msg home-hero-demo-msg--${role}`;
  row.setAttribute("role", "listitem");

  const bubble = document.createElement("div");
  bubble.className = "home-hero-demo-bubble";
  if (kind === "slash" && role === "user") {
    bubble.classList.add("home-hero-demo-bubble--slash");
  }
  bubble.textContent = text;

  const avatar = cloneAvatar(role, root);

  if (role === "user") {
    row.appendChild(bubble);
    row.appendChild(avatar);
  } else {
    row.appendChild(avatar);
    row.appendChild(bubble);
  }

  return row;
}

function animateExit(rows: HTMLElement[]): Promise<void> {
  if (!rows.length) return Promise.resolve();
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced) {
    rows.forEach((row) => row.remove());
    return Promise.resolve();
  }

  rows.forEach((row) => row.classList.add("home-hero-demo-msg--exit"));

  return new Promise((resolve) => {
    window.setTimeout(() => {
      rows.forEach((row) => row.remove());
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
    void animateExit([...stack.querySelectorAll<HTMLElement>(".home-hero-demo-msg")]).then(() => {
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

    const promptRow = createMessage(exchange.prompt, "user", exchange.kind, root);
    if (!reducedMotion) promptRow.classList.add("home-hero-demo-msg--enter");
    stack.appendChild(promptRow);

    await wait(THINK_MS);
    if (!running) return;

    const answerRow = createMessage(exchange.answer, "assistant", exchange.kind, root);
    if (!reducedMotion) answerRow.classList.add("home-hero-demo-msg--enter");
    stack.appendChild(answerRow);

    await wait(HOLD_MS);
    if (!running) return;

    await animateExit([promptRow, answerRow]);
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
