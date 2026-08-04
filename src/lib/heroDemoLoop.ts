/**
 * Homepage hero idle demo — multi-turn scenes that stack, fade, and scroll under the icon.
 * Stops when the visitor engages (scroll, click, key).
 */

import {
  HERO_DEMO_SLASH_PICKER,
  type HeroDemoAction,
  type HeroDemoScene,
  type HeroDemoTurn,
} from "./heroDemoConversation";

const ENGAGED_KEY = "hero-demo-engaged-v2";
const DEFAULT_THINK_MS = 1500;
const DEFAULT_USER_PAUSE_MS = 1300;
const DEFAULT_HOLD_MS = 5200;
const SCENE_GAP_MS = 1400;
const SCENE_EXIT_MS = 900;
const TYPING_MS = 1200;
const ACTION_PRESS_MS = 900;
const SLASH_PICKER_SHOW_MS = 1100;
const SLASH_PICKER_HIDE_MS = 280;
const USER_CHAR_MS = 32;
const SLASH_CHAR_MS = 38;

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

function createTypingIndicator(root: HTMLElement): HTMLElement {
  const row = document.createElement("div");
  row.className = "home-hero-demo-msg home-hero-demo-msg--assistant home-hero-demo-msg--typing";
  row.setAttribute("role", "listitem");
  row.setAttribute("aria-label", "Agent is typing");

  const avatar = cloneAvatar("assistant", root);
  const bubble = document.createElement("div");
  bubble.className = "home-hero-demo-bubble home-hero-demo-bubble--typing";
  bubble.setAttribute("aria-hidden", "true");

  const dots = document.createElement("span");
  dots.className = "home-hero-demo-typing";
  for (let i = 0; i < 3; i++) {
    dots.appendChild(document.createElement("span"));
  }
  bubble.appendChild(dots);

  row.appendChild(avatar);
  row.appendChild(bubble);
  return row;
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

function createUserComposingShell(root: HTMLElement, kind: "voice" | "slash"): HTMLElement {
  const row = document.createElement("div");
  row.className = "home-hero-demo-msg home-hero-demo-msg--user home-hero-demo-msg--composing";
  row.setAttribute("role", "listitem");

  const bubble = document.createElement("div");
  bubble.className = "home-hero-demo-bubble";
  if (kind === "slash") bubble.classList.add("home-hero-demo-bubble--slash");

  const text = document.createElement("p");
  text.className = "home-hero-demo-bubble-text home-hero-demo-bubble-text--cursor";
  text.textContent = "";
  bubble.appendChild(text);

  const avatar = cloneAvatar("user", root);
  row.appendChild(bubble);
  row.appendChild(avatar);
  return row;
}

function buildSlashPicker(activeSlash: string): HTMLElement {
  const panel = document.createElement("div");
  panel.className = "home-hero-demo-slash-picker";
  panel.setAttribute("role", "listbox");
  panel.setAttribute("aria-label", "Slash commands");

  const list = document.createElement("ul");
  list.className = "home-hero-demo-slash-picker-list";

  for (const option of HERO_DEMO_SLASH_PICKER) {
    const item = document.createElement("li");
    item.className = "home-hero-demo-slash-option";
    if (option.slash === activeSlash) item.classList.add("active");

    const slash = document.createElement("span");
    slash.className = "home-hero-demo-slash-option-cmd";
    slash.textContent = option.slash;

    const summary = document.createElement("span");
    summary.className = "home-hero-demo-slash-option-summary";
    summary.textContent = option.summary;

    item.appendChild(slash);
    item.appendChild(summary);
    list.appendChild(item);
  }

  panel.appendChild(list);
  return panel;
}

async function typeText(
  el: HTMLElement,
  chunk: string,
  msPerChar: number,
  isAlive: () => boolean,
): Promise<void> {
  for (const ch of chunk) {
    if (!isAlive()) return;
    el.textContent += ch;
    await wait(msPerChar);
  }
}

async function playUserTurn(
  turn: HeroDemoTurn,
  root: HTMLElement,
  sceneEl: HTMLElement,
  viewport: HTMLElement,
  stack: HTMLElement,
  reducedMotion: boolean,
  isAlive: () => boolean,
): Promise<void> {
  if (reducedMotion) {
    const row = createMessage(turn, root);
    sceneEl.appendChild(row);
    refreshStackLayout(viewport, stack);
    return;
  }

  const kind = turn.kind ?? "voice";
  const row = createUserComposingShell(root, kind);
  row.classList.add("home-hero-demo-msg--enter");
  sceneEl.appendChild(row);
  refreshStackLayout(viewport, stack);

  const textEl = row.querySelector<HTMLElement>(".home-hero-demo-bubble-text")!;
  const full = turn.text;

  if (kind === "slash") {
    const activeSlash = full.trim().split(/\s/)[0] ?? "/document";

    await typeText(textEl, "/", SLASH_CHAR_MS, isAlive);
    if (!isAlive()) return;
    refreshStackLayout(viewport, stack);

    const picker = buildSlashPicker(activeSlash);
    row.appendChild(picker);
    requestAnimationFrame(() => {
      picker.classList.add("home-hero-demo-slash-picker--visible");
    });
    refreshStackLayout(viewport, stack);
    await wait(SLASH_PICKER_SHOW_MS);
    if (!isAlive()) return;

    picker.classList.remove("home-hero-demo-slash-picker--visible");
    picker.classList.add("home-hero-demo-slash-picker--exit");
    await wait(SLASH_PICKER_HIDE_MS);
    picker.remove();

    const slashBody = activeSlash.slice(1);
    await typeText(textEl, slashBody, SLASH_CHAR_MS, isAlive);
    const rest = full.slice(activeSlash.length);
    if (rest) await typeText(textEl, rest, USER_CHAR_MS, isAlive);
  } else {
    await typeText(textEl, full, USER_CHAR_MS, isAlive);
  }

  if (!isAlive()) return;
  textEl.classList.remove("home-hero-demo-bubble-text--cursor");
  row.classList.remove("home-hero-demo-msg--composing");
  refreshStackLayout(viewport, stack);
}

function refreshStackLayout(viewport: HTMLElement, stack: HTMLElement) {
  const msgs = [...stack.querySelectorAll<HTMLElement>(".home-hero-demo-msg:not(.home-hero-demo-msg--typing)")];
  const count = msgs.length;

  msgs.forEach((msg, index) => {
    const depth = count - 1 - index;
    msg.dataset.depth = String(depth);
  });

  const typing = stack.querySelector<HTMLElement>(".home-hero-demo-msg--typing");
  if (typing) typing.dataset.depth = "0";

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
  let engageArmed = false;

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

  // iOS fires scroll on load (address bar, layout) — ignore until armed and past a real offset.
  window.setTimeout(() => {
    engageArmed = true;
  }, 2500);

  const onScroll = () => {
    if (!engageArmed || !running) return;
    if (window.scrollY < 48) return;
    window.removeEventListener("scroll", onScroll);
    stop();
  };
  window.addEventListener("scroll", onScroll, { passive: true });

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
        const pause =
          turn.pauseMs ??
          (turn.role === "assistant" ? DEFAULT_THINK_MS : DEFAULT_USER_PAUSE_MS);
        await wait(pause);
      }
      if (!running) return;

      if (turn.role === "user") {
        await playUserTurn(turn, root, sceneEl, viewport, stack, reducedMotion, () => running);
        continue;
      }

      if (!reducedMotion) {
        const typing = createTypingIndicator(root);
        typing.classList.add("home-hero-demo-msg--enter");
        sceneEl.appendChild(typing);
        refreshStackLayout(viewport, stack);
        await wait(TYPING_MS);
        if (!running) return;
        typing.remove();
      }

      const row = createMessage(turn, root);
      if (!reducedMotion) row.classList.add("home-hero-demo-msg--enter");
      sceneEl.appendChild(row);
      refreshStackLayout(viewport, stack);

      if (turn.actions?.length) {
        await wait(ACTION_PRESS_MS + 400);
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
