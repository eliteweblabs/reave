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
/**
 * Extra slowdown on iOS only. Mobile Safari reads the same ms as faster (and the
 * right-growing bubble made typing feel rushed); gate the fix so desktop stays put.
 */
const IOS_TIMING_SCALE = 1.75;

let timingScale = TIMING_SCALE;

function scaleMs(ms: number): number {
  return Math.round(ms * timingScale);
}

/** iPhone / iPod / iPad (including iPadOS that reports as Macintosh + touch). */
function isIOSDevice(): boolean {
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  // iPadOS 13+ spoofs Macintosh in the UA; touch points distinguish real Macs.
  return /Macintosh/i.test(ua) && navigator.maxTouchPoints > 1;
}

const DEFAULT_THINK_MS = 1500;
const DEFAULT_USER_PAUSE_MS = 1300;
const DEFAULT_HOLD_MS = 900;
const SCENE_GAP_MS = 350;
const SCENE_EXIT_MS = 500;
const ACTION_PRESS_MS = 900;
/** Full hero background bright pulse after a simulated action click. */
const SECTION_PULSE_MS = 1000;
const SLASH_PICKER_ARROW_MS = 380;
const SLASH_PICKER_SELECT_HOLD_MS = 520;
const SLASH_PICKER_OPEN_MS = 200;
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

/**
 * Soft clock for admin play/pause/next. `wait()` freezes while paused and
 * bails early when a scene skip is requested.
 */
type DemoClock = {
  userPaused: boolean;
  skipScene: boolean;
};

let demoClock: DemoClock = { userPaused: false, skipScene: false };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function wait(ms: number): Promise<void> {
  let remaining = scaleMs(ms);
  while (remaining > 0) {
    while (demoClock.userPaused && !demoClock.skipScene) {
      await sleep(40);
    }
    if (demoClock.skipScene) return;
    const slice = Math.min(40, remaining);
    await sleep(slice);
    remaining -= slice;
  }
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

/** One rect per rendered line box of the bubble's text. */
function bubbleLineRects(textEl: HTMLElement): DOMRect[] {
  const range = document.createRange();
  range.selectNodeContents(textEl);
  return Array.from(range.getClientRects());
}

/**
 * Collapse a wrapped bubble onto its longest line, so a turn whose last line is
 * short hugs its own side instead of filling the lane. Backs off rather than
 * buy the tighter box with an extra line.
 */
function fitBubble(bubble: HTMLElement, textEl: HTMLElement): void {
  bubble.style.maxWidth = "";
  const baseline = bubbleLineRects(textEl).length;
  if (baseline < 2) return;

  const previous = bubble.style.maxWidth;

  let widest = 0;
  for (const line of bubbleLineRects(textEl)) widest = Math.max(widest, line.width);
  // Never squash an action chip to fit the text.
  for (const chip of bubble.querySelectorAll<HTMLElement>(".home-hero-demo-action")) {
    widest = Math.max(widest, chip.getBoundingClientRect().width);
  }

  const inset = bubble.getBoundingClientRect().width - textEl.getBoundingClientRect().width;
  bubble.style.maxWidth = `${Math.ceil(widest + inset)}px`;

  if (bubbleLineRects(textEl).length > baseline) {
    bubble.style.maxWidth = previous;
  }
}

/** Collapse an already-rendered bubble onto its longest line. */
function fitBubbleToRenderedText(bubble: HTMLElement): void {
  const textEl = bubble.querySelector<HTMLElement>(".home-hero-demo-bubble-text");
  if (textEl) fitBubble(bubble, textEl);
}

/**
 * Lock a bubble to the width its *final* text will need, before that text is
 * typed. User turns are right-aligned, so a shrink-wrapping bubble expands
 * leftward as characters arrive, then jumps to full width on wrap — locking
 * `width` (not just max-width) keeps every character painting left-to-right.
 */
function fitBubbleToFinalText(row: HTMLElement, finalText: string): void {
  const bubble = row.querySelector<HTMLElement>(".home-hero-demo-bubble");
  const textEl = bubble?.querySelector<HTMLElement>(".home-hero-demo-bubble-text");
  if (!bubble || !textEl) return;

  // Measured and restored synchronously, so the full text never paints.
  const typed = textEl.textContent;
  textEl.textContent = finalText;
  fitBubble(bubble, textEl);

  const fittedMax = bubble.style.maxWidth;
  if (fittedMax) {
    bubble.style.width = fittedMax;
  } else {
    // Single-line messages skip the max-width pass — measure natural width.
    bubble.style.width = `${Math.ceil(bubble.getBoundingClientRect().width)}px`;
  }

  textEl.textContent = typed;
}

/** Drop the compose-time width lock and re-hug the finished text. */
function releaseBubbleWidthLock(row: HTMLElement): void {
  const bubble = row.querySelector<HTMLElement>(".home-hero-demo-bubble");
  if (!bubble) return;
  bubble.style.width = "";
  fitBubbleToRenderedText(bubble);
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

  fitBubbleToRenderedText(bubble);
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

  fitBubbleToRenderedText(bubble);
}

function renderActions(actions: HeroDemoAction[]): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "home-hero-demo-actions";

  for (const action of actions) {
    const chip = document.createElement("span");
    chip.className = "home-hero-demo-action";
    if (action.variant === "primary") chip.classList.add("home-hero-demo-action--primary");
    if (action.variant === "secondary") chip.classList.add("home-hero-demo-action--secondary");
    if (action.effect) chip.dataset.heroEffect = action.effect;
    chip.textContent = action.label;
    wrap.appendChild(chip);
  }

  return wrap;
}

/** Full-width illegible invoice card — static bones, no shimmer. */
function createInvoiceSkeletonCard(): HTMLElement {
  const row = document.createElement("div");
  row.className =
    "home-hero-demo-msg home-hero-demo-msg--assistant home-hero-demo-msg--artifact";
  row.setAttribute("role", "listitem");
  row.setAttribute("aria-hidden", "true");

  const card = document.createElement("div");
  card.className = "home-hero-demo-sk-invoice";

  const header = document.createElement("div");
  header.className = "home-hero-demo-sk-invoice-header";
  header.innerHTML =
    '<span class="home-hero-demo-sk-bone home-hero-demo-sk-bone--title"></span>' +
    '<span class="home-hero-demo-sk-bone home-hero-demo-sk-bone--meta"></span>';

  const client = document.createElement("div");
  client.className = "home-hero-demo-sk-invoice-client";
  client.innerHTML = '<span class="home-hero-demo-sk-bone home-hero-demo-sk-bone--client"></span>';

  const lines = document.createElement("div");
  lines.className = "home-hero-demo-sk-invoice-lines";
  for (let i = 0; i < 3; i++) {
    const line = document.createElement("div");
    line.className = "home-hero-demo-sk-invoice-line";
    line.innerHTML =
      '<span class="home-hero-demo-sk-bone home-hero-demo-sk-bone--line"></span>' +
      '<span class="home-hero-demo-sk-bone home-hero-demo-sk-bone--amt"></span>';
    lines.appendChild(line);
  }

  const payments = document.createElement("div");
  payments.className = "home-hero-demo-sk-invoice-payments";

  const payLabel = document.createElement("div");
  payLabel.className = "home-hero-demo-sk-invoice-section-label";
  payLabel.innerHTML = '<span class="home-hero-demo-sk-bone home-hero-demo-sk-bone--label"></span>';
  payments.appendChild(payLabel);

  const payRow = document.createElement("div");
  payRow.className = "home-hero-demo-sk-invoice-payment home-hero-demo-sk-invoice-payment--pending";
  payRow.innerHTML =
    '<span class="home-hero-demo-sk-bone home-hero-demo-sk-bone--line"></span>' +
    '<span class="home-hero-demo-sk-bone home-hero-demo-sk-bone--amt"></span>';
  payments.appendChild(payRow);

  const footer = document.createElement("div");
  footer.className = "home-hero-demo-sk-invoice-footer";
  footer.innerHTML =
    '<span class="home-hero-demo-sk-bone home-hero-demo-sk-bone--label"></span>' +
    '<span class="home-hero-demo-sk-bone home-hero-demo-sk-bone--total"></span>';

  card.appendChild(header);
  card.appendChild(client);
  card.appendChild(lines);
  card.appendChild(payments);
  card.appendChild(footer);
  row.appendChild(card);

  return row;
}

/**
 * After "View invoice": bounce a full-width skeleton invoice in from center,
 * then draw a new payment line. No shimmer / total flash.
 */
async function playInvoicePaymentSkeleton(
  sceneEl: HTMLElement,
  relayout: Relayout,
  reducedMotion: boolean,
  isAlive: () => boolean,
): Promise<void> {
  const row = createInvoiceSkeletonCard();
  const card = row.querySelector<HTMLElement>(".home-hero-demo-sk-invoice");
  sceneEl.appendChild(row);
  relayout(true);

  if (card) {
    if (reducedMotion) {
      card.classList.add("home-hero-demo-sk-invoice--settled");
    } else {
      void card.offsetWidth;
      card.classList.add("home-hero-demo-sk-invoice--pop");
    }
  }

  if (reducedMotion) {
    row
      .querySelector(".home-hero-demo-sk-invoice-payment--pending")
      ?.classList.remove("home-hero-demo-sk-invoice-payment--pending");
    await wait(480);
    return;
  }

  // Let the scale bounce land before drawing the payment line.
  await wait(720);
  if (!isAlive()) return;

  const payment = row.querySelector<HTMLElement>(".home-hero-demo-sk-invoice-payment--pending");
  if (payment) {
    void payment.offsetHeight;
    payment.classList.remove("home-hero-demo-sk-invoice-payment--pending");
    relayout(true);
  }

  await wait(1100);
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

function buildSlashPicker(): HTMLElement {
  const panel = document.createElement("div");
  panel.className = "home-hero-demo-slash-picker";
  panel.setAttribute("role", "listbox");
  panel.setAttribute("aria-label", "Slash commands");

  const list = document.createElement("ul");
  list.className = "home-hero-demo-slash-picker-list";

  for (const option of HERO_DEMO_SLASH_PICKER) {
    const item = document.createElement("li");
    item.className = "home-hero-demo-slash-option";

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

function setSlashPickerHighlight(picker: HTMLElement, index: number) {
  picker.querySelectorAll<HTMLElement>(".home-hero-demo-slash-option").forEach((item, i) => {
    item.classList.toggle("active", i === index);
    if (i === index) item.setAttribute("aria-selected", "true");
    else item.removeAttribute("aria-selected");
  });
}

/** Simulate ArrowDown until the intended slash command is highlighted. */
async function animateSlashPickerToTarget(
  picker: HTMLElement,
  targetSlash: string,
  reducedMotion: boolean,
  isAlive: () => boolean,
): Promise<void> {
  const targetIndex = HERO_DEMO_SLASH_PICKER.findIndex((option) => option.slash === targetSlash);
  if (targetIndex < 0) {
    await wait(reducedMotion ? 280 : SLASH_PICKER_SELECT_HOLD_MS);
    return;
  }

  const arrowMs = reducedMotion ? 110 : SLASH_PICKER_ARROW_MS;
  const holdMs = reducedMotion ? 220 : SLASH_PICKER_SELECT_HOLD_MS;

  await wait(reducedMotion ? 80 : SLASH_PICKER_OPEN_MS);
  if (!isAlive()) return;

  for (let i = 0; i <= targetIndex; i++) {
    setSlashPickerHighlight(picker, i);
    await wait(i === targetIndex ? holdMs : arrowMs);
    if (!isAlive()) return;
  }
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

/**
 * How much further each turn recedes behind the one in front of it. The newest
 * turn is fully present, the one before it is one step back, and so on.
 *
 * Depth is counted in turns rather than measured in pixels: the recession then
 * reads the same whether or not the lane has started to overflow, and a layout
 * pass costs no per-message geometry at all.
 */
const DEPTH_PER_MESSAGE = 0.05;
const DEPTH_SCALE = 0.24;
const DEPTH_BLUR_PX = 6;

/** Desktop + iOS Safari (not Chrome, Edge, Firefox, or in-app WebViews). */
function isSafariBrowser(): boolean {
  const ua = navigator.userAgent;
  return /Safari/i.test(ua) && !/Chrome|Chromium|CriOS|Edg|EdgiOS|OPR|FxiOS|Android/i.test(ua);
}

/** Blur reads ~2× heavier in Safari and its filter transitions snap; skip it there. */
let depthBlurEnabled = true;

const STACK_INSTANT_CLASS = "home-hero-demo-stack--instant";

/** 0 = the current turn. 1 = fully dissolved. */
function messageDepth(turnsBehindNewest: number): number {
  return Math.min(1, Math.max(0, turnsBehindNewest) * DEPTH_PER_MESSAGE);
}

function applyMessageFocus(msg: HTMLElement) {
  msg.style.opacity = "1";
  msg.style.transform = "scale(1)";
  if (depthBlurEnabled) msg.style.filter = "blur(0px)";
}

function applyMessageDepth(msg: HTMLElement, depth: number) {
  msg.style.opacity = (1 - depth).toFixed(3);
  msg.style.transform = `scale(${(1 - depth * DEPTH_SCALE).toFixed(3)})`;
  if (depthBlurEnabled) {
    msg.style.filter = `blur(${(depth * DEPTH_BLUR_PX).toFixed(2)}px)`;
  }
}

function refreshStackLayout(viewport: HTMLElement, stack: HTMLElement) {
  const vRect = viewport.getBoundingClientRect();
  if (vRect.height < 8) return;

  /*
   * The stack is top-anchored, so this single transform is the whole scroll
   * position: it parks the newest turn on the lane's bottom edge and carries
   * older turns up out of it.
   */
  const targetY = vRect.height - stack.scrollHeight;

  const messages = Array.from(stack.querySelectorAll<HTMLElement>(".home-hero-demo-msg"));
  const newest = messages.length - 1;

  stack.style.transform = `translateY(${targetY.toFixed(2)}px)`;
  messages.forEach((msg, i) => {
    const depth = messageDepth(newest - i);
    if (depth <= 0) applyMessageFocus(msg);
    else applyMessageDepth(msg, depth);
  });

  if (stack.classList.contains(STACK_INSTANT_CLASS)) {
    void stack.offsetHeight;
    stack.classList.remove(STACK_INSTANT_CLASS);
  }
}

/** Clear the stack and place the next scene without gliding it in. */
function resetStack(stack: HTMLElement) {
  stack.replaceChildren();
  stack.classList.add(STACK_INSTANT_CLASS);
}

type Relayout = (flush?: boolean) => void;

/** Run layout now, then once more after paint to pick up settled geometry. */
function relayoutStack(viewport: HTMLElement, stack: HTMLElement, flush = false) {
  refreshStackLayout(viewport, stack);
  if (flush) {
    requestAnimationFrame(() => refreshStackLayout(viewport, stack));
  }
}

async function playUserTurn(
  turn: HeroDemoTurn,
  root: HTMLElement,
  sceneEl: HTMLElement,
  relayout: Relayout,
  reducedMotion: boolean,
  isAlive: () => boolean,
  userAvatarUrl?: string,
): Promise<void> {
  const charMs = reducedMotion ? USER_CHAR_MS_FAST : USER_CHAR_MS;

  const kind = turn.kind ?? "voice";
  const row = createUserComposingShell(root, kind, userAvatarUrl);
  row.classList.add("home-hero-demo-msg--enter");
  sceneEl.appendChild(row);
  fitBubbleToFinalText(row, turn.text);
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

    const picker = buildSlashPicker();
    row.appendChild(picker);
    requestAnimationFrame(() => {
      picker.classList.add("home-hero-demo-slash-picker--visible");
    });
    relayout();
    await animateSlashPickerToTarget(picker, activeSlash, reducedMotion, isAlive);
    if (!isAlive()) return;

    picker.classList.remove("home-hero-demo-slash-picker--visible");
    picker.classList.add("home-hero-demo-slash-picker--exit");
    await wait(280);
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
  releaseBubbleWidthLock(row);
  relayout(true);
}

async function playAssistantTurn(
  turn: HeroDemoTurn,
  root: HTMLElement,
  sceneEl: HTMLElement,
  relayout: Relayout,
  reducedMotion: boolean,
  isAlive: () => boolean,
  priorAssistantRow: HTMLElement | null,
): Promise<HTMLElement | null> {
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
      await simulateActionPress(priorAssistantRow, sceneEl, relayout, reducedMotion, isAlive);
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
    await simulateActionPress(typing, sceneEl, relayout, reducedMotion, isAlive);
  }

  return typing;
}

async function simulateActionPress(
  row: HTMLElement,
  sceneEl: HTMLElement,
  relayout: Relayout,
  reducedMotion: boolean,
  isAlive: () => boolean,
): Promise<void> {
  const primary = row.querySelector<HTMLElement>(".home-hero-demo-action--primary");
  const target = primary ?? row.querySelector<HTMLElement>(".home-hero-demo-action");
  if (!target) return;

  const hero = row.closest<HTMLElement>(".home-hero");
  const effect = target.dataset.heroEffect;

  target.classList.add("home-hero-demo-action--pressed");

  if (hero && !reducedMotion) {
    hero.classList.remove("home-hero--action-pulse");
    void hero.offsetWidth;
    hero.classList.add("home-hero--action-pulse");
    window.setTimeout(() => hero.classList.remove("home-hero--action-pulse"), SECTION_PULSE_MS);
  }

  await wait(ACTION_PRESS_MS);
  if (!isAlive()) return;
  target.classList.remove("home-hero-demo-action--pressed");

  if (effect === "invoice-payment") {
    await playInvoicePaymentSkeleton(sceneEl, relayout, reducedMotion, isAlive);
  }
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
  const controls = hero?.querySelector<HTMLElement>("[data-hero-demo-controls]") ?? null;
  const iconEl = hero?.querySelector<HTMLElement>("[data-hero-icon]") ?? null;
  const brandEl = hero?.querySelector<HTMLElement>("[data-hero-brand]") ?? null;
  const copyEl = hero?.querySelector<HTMLElement>("[data-hero-copy]") ?? null;
  if (!viewport || !stack || !hero) return;

  depthBlurEnabled = !isSafariBrowser();
  if (!depthBlurEnabled) root.classList.add("home-hero-demo--safari");

  timingScale = isIOSDevice() ? TIMING_SCALE * IOS_TIMING_SCALE : TIMING_SCALE;

  const once = root.dataset.once === "1";
  const startSceneId = root.dataset.startScene?.trim() || "";
  const startIdx = startSceneId
    ? scenes.findIndex((scene) => scene.id === startSceneId)
    : -1;

  const relayout: Relayout = (flush = false) => {
    syncHeroCopyHeight(hero, copyEl);
    syncHeroBrandBottom(hero, brandEl);
    relayoutStack(viewport, stack, flush);
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
  let sceneIndex = startIdx >= 0 ? startIdx : Math.floor(Math.random() * scenes.length);
  let running = false;
  let offscreen = true;
  let loopGeneration = 0;
  let hideTimer = 0;

  const playBtn = controls?.querySelector<HTMLButtonElement>("[data-hero-demo-play]");
  const pauseBtn = controls?.querySelector<HTMLButtonElement>("[data-hero-demo-pause]");
  const nextBtn = controls?.querySelector<HTMLButtonElement>("[data-hero-demo-next]");

  const syncControls = () => {
    if (!controls) return;
    const frozen = demoClock.userPaused || !running;
    controls.dataset.state = frozen ? "paused" : "playing";
    if (playBtn) playBtn.hidden = !frozen;
    if (pauseBtn) pauseBtn.hidden = frozen;
  };

  const isAlive = () => running && !demoClock.skipScene && !offscreen;

  const pauseDemoOffscreen = () => {
    if (offscreen) return;
    offscreen = true;
    running = false;
    demoClock.userPaused = false;
    root.classList.add("home-hero-demo--stopped");
    window.clearTimeout(hideTimer);
    hideTimer = window.setTimeout(() => {
      root.hidden = true;
    }, scaleMs(SCENE_EXIT_MS));
    syncControls();
  };

  const resumeDemoOnscreen = () => {
    if (!offscreen && running) return;
    offscreen = false;
    window.clearTimeout(hideTimer);
    root.hidden = false;
    root.classList.remove("home-hero-demo--stopped");
    demoClock.userPaused = false;
    demoClock.skipScene = false;
    if (!running) {
      resetStack(stack);
      running = true;
      const gen = ++loopGeneration;
      void loop(gen);
    }
    syncControls();
  };

  const heroObserver = new IntersectionObserver(
    ([entry]) => {
      if (entry?.isIntersecting) resumeDemoOnscreen();
      else pauseDemoOffscreen();
    },
    { threshold: 0.22, rootMargin: "0px 0px -12% 0px" },
  );
  heroObserver.observe(hero);

  const playScene = async (scene: HeroDemoScene): Promise<void> => {
    if (!isAlive()) return;

    resetStack(stack);
    demoClock.skipScene = false;

    const sceneEl = document.createElement("div");
    sceneEl.className = "home-hero-demo-scene";
    sceneEl.dataset.sceneId = scene.id;
    stack.appendChild(sceneEl);

    let lastAssistantRow: HTMLElement | null = null;

    for (let i = 0; i < scene.turns.length; i++) {
      const turn = scene.turns[i]!;
      if (!isAlive()) return;

      if (turn.role === "user") {
        lastAssistantRow = null;
        if (i > 0 || turn.pauseMs != null) {
          const pause = turn.pauseMs ?? DEFAULT_USER_PAUSE_MS;
          await wait(pause);
        }
        if (!isAlive()) return;
        await playUserTurn(
          turn,
          root,
          sceneEl,
          relayout,
          reducedMotion,
          isAlive,
          scene.userAvatar,
        );
        continue;
      }

      lastAssistantRow = await playAssistantTurn(
        turn,
        root,
        sceneEl,
        relayout,
        reducedMotion,
        isAlive,
        lastAssistantRow,
      );
    }

    if (demoClock.skipScene || !running || offscreen) return;

    await wait(scene.holdMs ?? DEFAULT_HOLD_MS);
    if (!isAlive()) return;

    await animateSceneExit(sceneEl);
    if (!isAlive()) return;

    resetStack(stack);
  };

  const loop = async (gen: number) => {
    while (running && gen === loopGeneration && !offscreen) {
      const scene = scenes[sceneIndex]!;
      sceneIndex = (sceneIndex + 1) % scenes.length;
      demoClock.skipScene = false;
      await playScene(scene);

      const skipped = demoClock.skipScene;
      demoClock.skipScene = false;

      if (!running || gen !== loopGeneration || offscreen) break;

      if (skipped) {
        // Admin "next": replay the pinned test scene (or advance normally).
        if (startIdx >= 0) sceneIndex = startIdx;
        continue;
      }

      // Temporary testing: stop after the payment / invoice scene finishes.
      if (once || scene.id === "reggie-payment") {
        running = false;
        demoClock.userPaused = true;
        syncControls();
        break;
      }

      await wait(SCENE_GAP_MS);
    }
  };

  const userPlay = () => {
    if (offscreen) return;
    demoClock.userPaused = false;
    demoClock.skipScene = false;
    window.clearTimeout(hideTimer);
    root.hidden = false;
    root.classList.remove("home-hero-demo--stopped");
    if (!running) {
      resetStack(stack);
      // Replay the pinned test scene from the top.
      if (startIdx >= 0) sceneIndex = startIdx;
      running = true;
      const gen = ++loopGeneration;
      void loop(gen);
    }
    syncControls();
  };

  const userPause = () => {
    demoClock.userPaused = true;
    syncControls();
  };

  const userNext = () => {
    if (offscreen) return;
    demoClock.userPaused = false;
    demoClock.skipScene = true;
    window.clearTimeout(hideTimer);
    root.hidden = false;
    root.classList.remove("home-hero-demo--stopped");
    if (!running) {
      if (startIdx >= 0) sceneIndex = startIdx;
      running = true;
      const gen = ++loopGeneration;
      void loop(gen);
    }
    syncControls();
  };

  playBtn?.addEventListener("click", userPlay);
  pauseBtn?.addEventListener("click", userPause);
  nextBtn?.addEventListener("click", userNext);
  syncControls();
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
