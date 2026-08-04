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

function cloneAvatar(
  role: "user" | "assistant",
  root: HTMLElement,
  userAvatarUrl?: string,
): HTMLElement {
  if (role === "user" && userAvatarUrl) {
    const span = document.createElement("span");
    span.className = "home-hero-demo-avatar home-hero-demo-avatar--user";
    span.setAttribute("aria-hidden", "true");
    const img = document.createElement("img");
    img.className = "home-hero-demo-avatar-photo";
    img.src = userAvatarUrl;
    img.alt = "";
    img.loading = "lazy";
    img.decoding = "async";
    span.appendChild(img);
    return span;
  }

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

function morphTypingToMessage(row: HTMLElement, turn: HeroDemoTurn, isStatus: boolean): void {
  row.classList.remove("home-hero-demo-msg--typing");
  row.removeAttribute("aria-label");

  const bubble = row.querySelector<HTMLElement>(".home-hero-demo-bubble");
  if (!bubble) return;

  bubble.classList.remove("home-hero-demo-bubble--typing");
  bubble.removeAttribute("aria-hidden");
  bubble.replaceChildren();

  const text = document.createElement("p");
  text.className = "home-hero-demo-bubble-text";

  if (isStatus) {
    text.textContent = stripStatusEllipsis(turn.text);
    const ellipsis = document.createElement("span");
    ellipsis.className = "home-hero-demo-ellipsis";
    ellipsis.setAttribute("aria-hidden", "true");
    text.appendChild(ellipsis);
    row.classList.add("home-hero-demo-msg--status");
  } else {
    text.textContent = turn.text;
  }

  bubble.appendChild(text);

  if (turn.actions?.length) {
    bubble.appendChild(renderActions(turn.actions));
  }
}

function morphStatusToReply(row: HTMLElement, turn: HeroDemoTurn): void {
  row.classList.remove("home-hero-demo-msg--status");
  delete row.dataset.heroAwaitingReply;

  const bubble = row.querySelector<HTMLElement>(".home-hero-demo-bubble");
  if (!bubble) return;

  bubble.replaceChildren();

  const text = document.createElement("p");
  text.className = "home-hero-demo-bubble-text";
  text.textContent = turn.text;
  bubble.appendChild(text);

  if (turn.actions?.length) {
    bubble.appendChild(renderActions(turn.actions));
  }
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

function createUserComposingShell(
  root: HTMLElement,
  kind: "voice" | "slash",
  userAvatarUrl?: string,
): HTMLElement {
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

  const avatar = cloneAvatar("user", root, userAvatarUrl);
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

/** 0 = foreground (below icon), 1 = fully under the icon (top). */
function messageDepth(msgCenterY: number, iconBottom: number): number {
  if (iconBottom <= 0) return 0;
  if (msgCenterY >= iconBottom) return 0;
  return 1 - smoothstep(msgCenterY / iconBottom);
}

function applyMessageFocus(msg: HTMLElement) {
  msg.style.transformOrigin = msg.classList.contains("home-hero-demo-msg--user")
    ? "bottom right"
    : "bottom left";
  msg.style.transform = "scale(1)";
  msg.style.opacity = "1";
  msg.style.filter = "none";
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
  const nextTransform = overflow > 0 ? `translateY(${-overflow}px)` : "";

  // Snap instantly — the stack's CSS transition was leaving new messages mid-scroll
  // so depth blur was applied before they settled on the bottom edge.
  stack.style.transition = "none";
  stack.style.transform = nextTransform;
  void stack.offsetHeight;

  const iconRect = iconEl?.getBoundingClientRect();
  const iconBottom = iconRect
    ? iconRect.bottom - vRect.top
    : vRect.height * 0.35;

  const messages = stack.querySelectorAll<HTMLElement>(".home-hero-demo-msg");
  const lastMessage = messages[messages.length - 1] ?? null;

  for (const msg of messages) {
    const isActive =
      msg.classList.contains("home-hero-demo-msg--typing") ||
      msg.classList.contains("home-hero-demo-msg--composing") ||
      msg.classList.contains("home-hero-demo-msg--status");

    const rect = msg.getBoundingClientRect();
    const msgCenterY = (rect.top + rect.bottom) / 2 - vRect.top;

    // Newest + in-progress turns stay crisp; readable area below the icon stays crisp too.
    if (msg === lastMessage || isActive || msgCenterY >= iconBottom - 6) {
      applyMessageFocus(msg);
      continue;
    }

    const depth = messageDepth(msgCenterY, iconBottom);
    applyMessageDepth(msg, depth);
  }
}

/** Run layout now and again after paint (avoids stale geometry). */
function relayoutStack(
  viewport: HTMLElement,
  stack: HTMLElement,
  iconEl: HTMLElement | null,
  flush = false,
) {
  refreshStackLayout(viewport, stack, iconEl);
  if (flush) {
    requestAnimationFrame(() => {
      refreshStackLayout(viewport, stack, iconEl);
      requestAnimationFrame(() => refreshStackLayout(viewport, stack, iconEl));
    });
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
  userAvatarUrl?: string,
): Promise<void> {
  const relayout = (flush = false) => relayoutStack(viewport, stack, iconEl, flush);
  const charMs = reducedMotion ? USER_CHAR_MS_FAST : USER_CHAR_MS;

  const kind = turn.kind ?? "voice";
  const row = createUserComposingShell(root, kind, userAvatarUrl);
  row.classList.add("home-hero-demo-msg--enter");
  sceneEl.appendChild(row);
  relayout(true);

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
  relayout(true);
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
  priorAssistantRow: HTMLElement | null,
): Promise<HTMLElement | null> {
  const relayout = (flush = false) => relayoutStack(viewport, stack, iconEl, flush);
  const isStatus = isStatusMessage(turn.text);
  const thinkMs = turn.pauseMs ?? DEFAULT_THINK_MS;

  // Status line → reply in the same bubble (no second bubble).
  if (!isStatus && priorAssistantRow?.dataset.heroAwaitingReply === "1") {
    await wait(ASSISTANT_RESPONSE_DELAY_MS);
    if (!isAlive()) return priorAssistantRow;
    morphStatusToReply(priorAssistantRow, turn);
    relayout(true);

    if (turn.actions?.length) {
      await wait(ACTION_PRESS_MS + 400);
      if (!isAlive()) return priorAssistantRow;
      await simulateActionPress(priorAssistantRow);
    }

    return priorAssistantRow;
  }

  await wait(ASSISTANT_RESPONSE_DELAY_MS);
  if (!isAlive()) return null;

  const dotsMs = isStatus
    ? TYPING_DOTS_MS
    : reducedMotion
      ? Math.max(320, thinkMs * 0.45)
      : Math.max(TYPING_DOTS_MS, thinkMs);

  const typing = createTypingIndicator(root);
  typing.classList.add("home-hero-demo-msg--enter");
  sceneEl.appendChild(typing);
  relayout(true);
  await wait(dotsMs);
  if (!isAlive()) return null;

  morphTypingToMessage(typing, turn, isStatus);
  relayout(true);

  if (isStatus) {
    typing.dataset.heroAwaitingReply = "1";
    await wait(turn.pauseMs ?? STATUS_HOLD_MS);
    if (!isAlive()) return typing;
    relayout();
  }

  if (turn.actions?.length) {
    await wait(ACTION_PRESS_MS + 400);
    if (!isAlive()) return typing;
    await simulateActionPress(typing);
  }

  return typing;
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

function syncHeroBrandBottom(hero: HTMLElement, brand: HTMLElement | null) {
  if (!brand) return;
  const heroRect = hero.getBoundingClientRect();
  const brandRect = brand.getBoundingClientRect();
  hero.style.setProperty("--home-hero-brand-bottom", `${brandRect.bottom - heroRect.top}px`);
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
  const brandEl = hero?.querySelector<HTMLElement>("[data-hero-brand]") ?? null;
  const focusEl = brandEl ?? iconEl;
  const copyEl = hero?.querySelector<HTMLElement>("[data-hero-copy]") ?? null;
  if (!viewport || !stack || !hero) return;

  const relayout = (flush = false) => {
    syncHeroCopyHeight(hero, copyEl);
    syncHeroBrandBottom(hero, brandEl);
    relayoutStack(viewport, stack, focusEl, flush);
  };
  relayout(true);
  if (copyEl) new ResizeObserver(() => relayout()).observe(copyEl);
  if (brandEl) new ResizeObserver(() => relayout()).observe(brandEl);
  else if (iconEl) new ResizeObserver(() => relayout()).observe(iconEl);
  new ResizeObserver(() => relayout()).observe(viewport);
  window.addEventListener("resize", () => relayout(), { passive: true });
  document.fonts?.ready?.then(() => relayout(true));
  requestAnimationFrame(() => relayout(true));
  window.setTimeout(() => relayout(true), 150);

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

    let lastAssistantRow: HTMLElement | null = null;

    for (let i = 0; i < scene.turns.length; i++) {
      const turn = scene.turns[i]!;
      if (!running) return;

      if (turn.role === "user") {
        lastAssistantRow = null;
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
          focusEl,
          reducedMotion,
          () => running,
          scene.userAvatar,
        );
        continue;
      }

      lastAssistantRow = await playAssistantTurn(
        turn,
        root,
        sceneEl,
        viewport,
        stack,
        focusEl,
        reducedMotion,
        () => running,
        lastAssistantRow,
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
