/**
 * Homepage hero idle demo — scenes loop indefinitely; chat scrolls up from the
 * bottom and fades gradually under the icon. Stops when the visitor leaves the hero.
 */

import {
  HERO_DEMO_SLASH_PICKER,
  type HeroDemoAction,
  type HeroDemoScene,
  type HeroDemoTurn,
} from "./heroDemoConversation";

/** Demo pacing (~33% slower than baseline). Applied in wait() and exit timeouts. */
const TIMING_SCALE = 1.33;

function scaleMs(ms: number): number {
  return Math.round(ms * TIMING_SCALE);
}

const DEFAULT_THINK_MS = 1500;
const DEFAULT_USER_PAUSE_MS = 1300;
const DEFAULT_HOLD_MS = 900;
const SCENE_GAP_MS = 350;
const SCENE_EXIT_MS = 500;
const ACTION_PRESS_MS = 900;
const SLASH_PICKER_SHOW_MS = 1100;
const SLASH_PICKER_HIDE_MS = 280;
const USER_COMPOSE_MS = 520;
const USER_CHAR_MS = 42;
const USER_CHAR_MS_FAST = 14;
const SLASH_CHAR_MS = 38;
/** Beat after the user finishes before the agent starts responding. */
const ASSISTANT_RESPONSE_DELAY_MS = 420;
/** Short generic typing dots — not the full "thinking" duration. */
const TYPING_DOTS_MS = 480;
/** Gap between dots disappearing and the reply appearing. */
const MESSAGE_REVEAL_PAUSE_MS = 320;
/** How long in-progress status lines show animated ellipsis. */
const STATUS_HOLD_MS = 950;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, scaleMs(ms)));
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

function isStatusMessage(text: string): boolean {
  return text.endsWith("…") || text.endsWith("...");
}

function stripStatusEllipsis(text: string): string {
  if (text.endsWith("…")) return text.slice(0, -1);
  if (text.endsWith("...")) return text.slice(0, -3);
  return text;
}

function createStatusMessage(turn: HeroDemoTurn, root: HTMLElement): HTMLElement {
  const row = createMessage({ ...turn, text: stripStatusEllipsis(turn.text) }, root);
  row.classList.add("home-hero-demo-msg--status");

  const textEl = row.querySelector<HTMLElement>(".home-hero-demo-bubble-text");
  if (textEl) {
    const ellipsis = document.createElement("span");
    ellipsis.className = "home-hero-demo-ellipsis";
    ellipsis.setAttribute("aria-hidden", "true");
    textEl.appendChild(ellipsis);
  }

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
  onTick?: () => void,
): Promise<void> {
  for (const ch of chunk) {
    if (!isAlive()) return;
    el.textContent += ch;
    onTick?.();
    await wait(msPerChar);
  }
}

/** Smoothstep 0–1. */
function smoothstep(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

/** 0 = foreground (bottom), 1 = receding under the icon (top). */
function messageDepth(msgCenterY: number, depthTop: number, depthBottom: number): number {
  const span = Math.max(1, depthBottom - depthTop);
  return 1 - smoothstep((msgCenterY - depthTop) / span);
}

function applyMessageDepth(msg: HTMLElement, depth: number) {
  const isUser = msg.classList.contains("home-hero-demo-msg--user");
  const origin = isUser ? "bottom right" : "bottom left";
  const scale = 1 - depth * 0.054;
  const opacity = 1 - depth * 0.55;
  const blur = depth * 1.88;

  msg.style.transformOrigin = origin;
  msg.style.transform = `scale(${scale.toFixed(3)})`;
  msg.style.opacity = opacity.toFixed(3);
  msg.style.filter = blur > 0.12 ? `blur(${blur.toFixed(2)}px)` : "none";
}

function refreshStackLayout(
  viewport: HTMLElement,
  stack: HTMLElement,
  iconEl: HTMLElement | null,
) {
  const vRect = viewport.getBoundingClientRect();
  if (vRect.height < 8) return;

  const overflow = Math.max(0, stack.scrollHeight - vRect.height);
  stack.style.transform = overflow > 0 ? `translateY(${-overflow}px)` : "";

  const iconRect = iconEl?.getBoundingClientRect();
  const depthTop = iconRect
    ? Math.max(-24, iconRect.bottom - vRect.top - 12)
    : vRect.height * 0.32;
  const depthBottom = vRect.height + 8;

  for (const msg of stack.querySelectorAll<HTMLElement>(".home-hero-demo-msg")) {
    if (
      msg.classList.contains("home-hero-demo-msg--typing") ||
      msg.classList.contains("home-hero-demo-msg--composing") ||
      msg.classList.contains("home-hero-demo-msg--status")
    ) {
      msg.style.transformOrigin = msg.classList.contains("home-hero-demo-msg--user")
        ? "bottom right"
        : "bottom left";
      msg.style.transform = "scale(1)";
      msg.style.opacity = "1";
      msg.style.filter = "none";
      continue;
    }

    const rect = msg.getBoundingClientRect();
    const msgCenterY = (rect.top + rect.bottom) / 2 - vRect.top;
    const depth = messageDepth(msgCenterY, depthTop, depthBottom);
    applyMessageDepth(msg, depth);
  }
}

async function playUserTurn(
  turn: HeroDemoTurn,
  root: HTMLElement,
  sceneEl: HTMLElement,
  viewport: HTMLElement,
  stack: HTMLElement,
  iconEl: HTMLElement | null,
  reducedMotion: boolean,
  isAlive: () => boolean,
): Promise<void> {
  const relayout = () => refreshStackLayout(viewport, stack, iconEl);
  const charMs = reducedMotion ? USER_CHAR_MS_FAST : USER_CHAR_MS;

  const kind = turn.kind ?? "voice";
  const row = createUserComposingShell(root, kind);
  row.classList.add("home-hero-demo-msg--enter");
  sceneEl.appendChild(row);
  relayout();

  // Empty bubble + blinking cursor before characters appear.
  await wait(reducedMotion ? 180 : USER_COMPOSE_MS);
  if (!isAlive()) return;

  const textEl = row.querySelector<HTMLElement>(".home-hero-demo-bubble-text")!;
  const full = turn.text;

  if (kind === "slash") {
    const activeSlash = full.trim().split(/\s/)[0] ?? "/document";

    await typeText(textEl, "/", SLASH_CHAR_MS, isAlive, relayout);
    if (!isAlive()) return;
    relayout();

    const picker = buildSlashPicker(activeSlash);
    row.appendChild(picker);
    requestAnimationFrame(() => {
      picker.classList.add("home-hero-demo-slash-picker--visible");
    });
    relayout();
    await wait(SLASH_PICKER_SHOW_MS);
    if (!isAlive()) return;

    picker.classList.remove("home-hero-demo-slash-picker--visible");
    picker.classList.add("home-hero-demo-slash-picker--exit");
    await wait(SLASH_PICKER_HIDE_MS);
    picker.remove();

    const slashBody = activeSlash.slice(1);
    await typeText(textEl, slashBody, SLASH_CHAR_MS, isAlive, relayout);
    const rest = full.slice(activeSlash.length);
    if (rest) await typeText(textEl, rest, charMs, isAlive, relayout);
  } else {
    await typeText(textEl, full, charMs, isAlive, relayout);
  }

  if (!isAlive()) return;
  textEl.classList.remove("home-hero-demo-bubble-text--cursor");
  row.classList.remove("home-hero-demo-msg--composing");
  relayout();
}

async function playAssistantTurn(
  turn: HeroDemoTurn,
  root: HTMLElement,
  sceneEl: HTMLElement,
  viewport: HTMLElement,
  stack: HTMLElement,
  iconEl: HTMLElement | null,
  reducedMotion: boolean,
  isAlive: () => boolean,
): Promise<void> {
  const relayout = () => refreshStackLayout(viewport, stack, iconEl);
  const isStatus = isStatusMessage(turn.text);
  const thinkMs = turn.pauseMs ?? DEFAULT_THINK_MS;

  await wait(ASSISTANT_RESPONSE_DELAY_MS);
  if (!isAlive()) return;

  const dotsMs = isStatus
    ? TYPING_DOTS_MS
    : reducedMotion
      ? Math.max(320, thinkMs * 0.45)
      : Math.max(TYPING_DOTS_MS, thinkMs);

  const typing = createTypingIndicator(root);
  typing.classList.add("home-hero-demo-msg--enter");
  sceneEl.appendChild(typing);
  relayout();
  await wait(dotsMs);
  if (!isAlive()) return;
  typing.remove();

  await wait(MESSAGE_REVEAL_PAUSE_MS);
  if (!isAlive()) return;

  const row = isStatus ? createStatusMessage(turn, root) : createMessage(turn, root);
  if (!reducedMotion) row.classList.add("home-hero-demo-msg--enter");
  sceneEl.appendChild(row);
  relayout();

  if (isStatus) {
    await wait(turn.pauseMs ?? STATUS_HOLD_MS);
    if (!isAlive()) return;
    row.classList.remove("home-hero-demo-msg--status");
    relayout();
  }

  if (turn.actions?.length) {
    await wait(ACTION_PRESS_MS + 400);
    if (!isAlive()) return;
    await simulateActionPress(row);
  }
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
    }, scaleMs(SCENE_EXIT_MS));
  });
}

function syncHeroCopyHeight(hero: HTMLElement, copy: HTMLElement | null) {
  if (!copy) return;
  hero.style.setProperty("--home-hero-copy-h", `${copy.offsetHeight}px`);
}

export function initHeroDemoLoop(root: HTMLElement) {
  if (root.dataset.heroDemoBound === "1") return;
  root.dataset.heroDemoBound = "1";

  const scenes = parseScenes(root.dataset.scenes);
  if (!scenes.length) return;

  const hero = root.closest<HTMLElement>(".home-hero");
  const viewport = root.querySelector<HTMLElement>("[data-hero-demo-viewport]");
  const stack = root.querySelector<HTMLElement>("[data-hero-demo-stack]");
  const iconEl = hero?.querySelector<HTMLElement>("[data-hero-icon]") ?? null;
  const copyEl = hero?.querySelector<HTMLElement>("[data-hero-copy]") ?? null;
  if (!viewport || !stack || !hero) return;

  const relayout = () => refreshStackLayout(viewport, stack, iconEl);
  syncHeroCopyHeight(hero, copyEl);
  if (copyEl) new ResizeObserver(() => syncHeroCopyHeight(hero, copyEl)).observe(copyEl);
  if (iconEl) new ResizeObserver(relayout).observe(iconEl);
  new ResizeObserver(relayout).observe(viewport);
  window.addEventListener("resize", relayout, { passive: true });
  document.fonts?.ready?.then(relayout);
  requestAnimationFrame(relayout);
  window.setTimeout(relayout, 150);
  window.setTimeout(relayout, 600);

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let sceneIndex = Math.floor(Math.random() * scenes.length);
  let running = false;
  let paused = true;
  let pauseTimer = 0;

  const pauseDemo = () => {
    if (paused) return;
    paused = true;
    running = false;
    root.classList.add("home-hero-demo--stopped");
    window.clearTimeout(pauseTimer);
    pauseTimer = window.setTimeout(() => {
      root.hidden = true;
    }, scaleMs(SCENE_EXIT_MS));
  };

  const resumeDemo = () => {
    if (!paused) return;
    paused = false;
    window.clearTimeout(pauseTimer);
    root.hidden = false;
    root.classList.remove("home-hero-demo--stopped");
    stack.replaceChildren();
    stack.style.transform = "";
    running = true;
    void loop();
  };

  const heroObserver = new IntersectionObserver(
    ([entry]) => {
      if (entry?.isIntersecting) resumeDemo();
      else pauseDemo();
    },
    { threshold: 0.22, rootMargin: "0px 0px -12% 0px" },
  );
  heroObserver.observe(hero);

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
      if (!running) return;

      if (turn.role === "user") {
        if (i > 0 || turn.pauseMs != null) {
          const pause = turn.pauseMs ?? DEFAULT_USER_PAUSE_MS;
          await wait(pause);
        }
        if (!running) return;
        await playUserTurn(
          turn,
          root,
          sceneEl,
          viewport,
          stack,
          iconEl,
          reducedMotion,
          () => running,
        );
        continue;
      }

      await playAssistantTurn(
        turn,
        root,
        sceneEl,
        viewport,
        stack,
        iconEl,
        reducedMotion,
        () => running,
      );
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
