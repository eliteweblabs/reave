/**
 * Homepage hero idle demo — multi-turn scenes that stack, fade, and scroll under the icon.
 * Stops when the visitor engages (scroll, click, key).
 */

import type { HeroDemoAction, HeroDemoScene, HeroDemoTurn } from "./heroDemoConversation";

const ENGAGED_KEY = "hero-demo-engaged";
const DEFAULT_THINK_MS = 850;
const DEFAULT_HOLD_MS = 3400;
const SCENE_GAP_MS = 900;
const SCENE_EXIT_MS = 900;
const ACTION_PRESS_MS = 700;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseScenes(raw: string | undefined): HeroDemoScene[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as HeroDemoScene[];
    return parsed.filter((s) => s.id && Array.isArray(s.turns) && s.turns.length > 0);
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

function renderActions(actions: HeroDemoAction[]): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "home-hero-demo-actions";

  for (const action of actions) {
    const chip = document.createElement("span");
    chip.className = "home-hero-demo-action";
    if (action.variant === "primary") chip.classList.add("home-hero-demo-action--primary");
    if (action.variant === "secondary") chip.classList.add("home-hero-demo-action--secondary");
    chip.textContent = action.label;
    wrap.appendChild(chip);
  }

  return wrap;
}

function createMessage(turn: HeroDemoTurn, root: HTMLElement): HTMLElement {
  const role = turn.role;
  const kind = turn.kind ?? "voice";

  const row = document.createElement("div");
  row.className = `home-hero-demo-msg home-hero-demo-msg--${role}`;
  row.setAttribute("role", "listitem");

  const bubble = document.createElement("div");
  bubble.className = "home-hero-demo-bubble";
  if (kind === "slash" && role === "user") {
    bubble.classList.add("home-hero-demo-bubble--slash");
  }

  const text = document.createElement("p");
  text.className = "home-hero-demo-bubble-text";
  text.textContent = turn.text;
  bubble.appendChild(text);

  if (role === "assistant" && turn.actions?.length) {
    bubble.appendChild(renderActions(turn.actions));
  }

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

function refreshStackLayout(viewport: HTMLElement, stack: HTMLElement) {
  const msgs = [...stack.querySelectorAll<HTMLElement>(".home-hero-demo-msg")];
  const count = msgs.length;

  msgs.forEach((msg, index) => {
    const depth = count - 1 - index;
    msg.dataset.depth = String(depth);
  });

  const overflow = Math.max(0, stack.scrollHeight - viewport.clientHeight);
  stack.style.transform = overflow > 0 ? `translateY(${-overflow}px)` : "";
}

async function simulateActionPress(row: HTMLElement): Promise<void> {
  const primary = row.querySelector<HTMLElement>(".home-hero-demo-action--primary");
  const target = primary ?? row.querySelector<HTMLElement>(".home-hero-demo-action");
  if (!target) return;
  target.classList.add("home-hero-demo-action--pressed");
  await wait(ACTION_PRESS_MS);
  target.classList.remove("home-hero-demo-action--pressed");
}

function animateSceneExit(sceneEl: HTMLElement): Promise<void> {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced) {
    sceneEl.remove();
    return Promise.resolve();
  }

  sceneEl.classList.add("home-hero-demo-scene--exit");
  return new Promise((resolve) => {
    window.setTimeout(() => {
      sceneEl.remove();
      resolve();
    }, SCENE_EXIT_MS);
  });
}

export function initHeroDemoLoop(root: HTMLElement) {
  if (root.dataset.heroDemoBound === "1") return;
  root.dataset.heroDemoBound = "1";

  const scenes = parseScenes(root.dataset.scenes);
  if (!scenes.length) return;

  const viewport = root.querySelector<HTMLElement>("[data-hero-demo-viewport]");
  const stack = root.querySelector<HTMLElement>("[data-hero-demo-stack]");
  if (!viewport || !stack) return;

  if (sessionStorage.getItem(ENGAGED_KEY) === "1") {
    root.hidden = true;
    return;
  }

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let sceneIndex = Math.floor(Math.random() * scenes.length);
  let running = true;

  const stop = () => {
    if (!running) return;
    running = false;
    sessionStorage.setItem(ENGAGED_KEY, "1");
    root.classList.add("home-hero-demo--stopped");
    window.setTimeout(() => {
      root.hidden = true;
    }, SCENE_EXIT_MS);
  };

  document.addEventListener("pointerdown", stop, { once: true, passive: true });
  document.addEventListener("keydown", stop, { once: true });
  document.addEventListener("scroll", stop, { once: true, passive: true });

  const playScene = async (scene: HeroDemoScene): Promise<void> => {
    if (!running) return;

    stack.replaceChildren();
    stack.style.transform = "";

    const sceneEl = document.createElement("div");
    sceneEl.className = "home-hero-demo-scene";
    sceneEl.dataset.sceneId = scene.id;
    stack.appendChild(sceneEl);

    for (let i = 0; i < scene.turns.length; i++) {
      const turn = scene.turns[i]!;
      if (i > 0 || turn.pauseMs != null) {
        const pause = turn.pauseMs ?? (turn.role === "assistant" ? DEFAULT_THINK_MS : 650);
        await wait(pause);
      }
      if (!running) return;

      const row = createMessage(turn, root);
      if (!reducedMotion) row.classList.add("home-hero-demo-msg--enter");
      sceneEl.appendChild(row);
      refreshStackLayout(viewport, stack);

      if (turn.role === "assistant" && turn.actions?.length) {
        await wait(ACTION_PRESS_MS + 200);
        if (!running) return;
        await simulateActionPress(row);
      }
    }

    await wait(scene.holdMs ?? DEFAULT_HOLD_MS);
    if (!running) return;

    await animateSceneExit(sceneEl);
    if (!running) return;

    stack.replaceChildren();
    stack.style.transform = "";
  };

  const loop = async () => {
    while (running) {
      const scene = scenes[sceneIndex]!;
      sceneIndex = (sceneIndex + 1) % scenes.length;
      await playScene(scene);
      if (!running) break;
      await wait(SCENE_GAP_MS);
    }
  };

  void loop();
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
