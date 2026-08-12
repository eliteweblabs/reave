/**
 * Homepage hero idle demo — scenes loop indefinitely; chat scrolls up from the
 * bottom and fades gradually under the icon. Stops when the visitor leaves the hero.
 */

import {
  HERO_DEMO_MENTION_PICKER,
  HERO_DEMO_SLASH_PICKER,
  heroDemoMentionKind,
  heroDemoMentionNames,
  type HeroDemoAction,
  type HeroDemoMentionOption,
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
/** Outro fade when a mock conversation ends — keep in sync with CSS. */
const SCENE_EXIT_MS = 350;
/** Dwell after action chips appear (all idle) before the hover scan starts. */
const ACTION_APPEAR_MS = 700;
/** How long each chip stays “hovered” during a random hop. */
const ACTION_HOVER_MS = 260;
/** Hold on the chosen chip after the scan, before the click. */
const ACTION_HOVER_SETTLE_MS = 420;
/** Simulated click / press duration. */
const ACTION_PRESS_MS = 520;
/** Random hops before settling on the intended chip (inclusive range, capped to chip count). */
const ACTION_HOVER_HOPS_MIN = 2;
const ACTION_HOVER_HOPS_MAX = 4;
const SLASH_PICKER_ARROW_MS = 380;
const SLASH_PICKER_SELECT_HOLD_MS = 520;
const SLASH_PICKER_OPEN_MS = 200;
const MENTION_PICKER_ARROW_MS = 320;
const MENTION_PICKER_SELECT_HOLD_MS = 560;
const MENTION_PICKER_OPEN_MS = 220;
const USER_COMPOSE_MS = 520;
const USER_CHAR_MS = 42;
const USER_CHAR_MS_FAST = 14;
const SLASH_CHAR_MS = 38;
const MENTION_CHAR_MS = 36;
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

/**
 * One rect per rendered line box of the bubble's text.
 * `Range#getClientRects()` returns a box per inline fragment (mention chips,
 * punctuation runs, etc.), so merge fragments that share a line before measuring.
 */
function bubbleLineRects(textEl: HTMLElement): DOMRect[] {
  const range = document.createRange();
  range.selectNodeContents(textEl);
  const lines: DOMRect[] = [];
  for (const rect of range.getClientRects()) {
    if (rect.width <= 0 && rect.height <= 0) continue;
    const line = lines.find((l) => Math.abs(l.top - rect.top) < 1);
    if (!line) {
      lines.push(new DOMRect(rect.left, rect.top, rect.width, rect.height));
      continue;
    }
    const left = Math.min(line.left, rect.left);
    const right = Math.max(line.right, rect.right);
    const top = Math.min(line.top, rect.top);
    const bottom = Math.max(line.bottom, rect.bottom);
    lines[lines.indexOf(line)] = new DOMRect(left, top, right - left, bottom - top);
  }
  return lines;
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

/** Build a mention chip matching the real agent chat look (demo-only styling). */
function createMentionChip(name: string): HTMLElement {
  const chip = document.createElement("span");
  const kind = heroDemoMentionKind(name);
  chip.className = `home-hero-demo-mention-chip home-hero-demo-mention-chip--${kind}`;
  chip.textContent = `@${name}`;
  return chip;
}

/**
 * Fill a bubble text node, turning known `@Name` tokens into mention chips.
 * Unknown `@…` stays plain text.
 */
function fillBubbleText(el: HTMLElement, text: string): void {
  el.replaceChildren();
  if (!text.includes("@")) {
    el.textContent = text;
    return;
  }

  const names = heroDemoMentionNames();
  let i = 0;
  while (i < text.length) {
    const at = text.indexOf("@", i);
    if (at < 0) {
      el.appendChild(document.createTextNode(text.slice(i)));
      break;
    }
    if (at > i) el.appendChild(document.createTextNode(text.slice(i, at)));

    const after = text.slice(at + 1);
    const match = names.find((name) => after.startsWith(name));
    if (!match) {
      el.appendChild(document.createTextNode("@"));
      i = at + 1;
      continue;
    }

    el.appendChild(createMentionChip(match));
    i = at + 1 + match.length;
  }
}

/** Append characters without wiping existing mention chips. */
function appendBubbleChars(el: HTMLElement, chunk: string): void {
  const last = el.lastChild;
  if (last && last.nodeType === Node.TEXT_NODE) {
    last.textContent = `${last.textContent ?? ""}${chunk}`;
  } else {
    el.appendChild(document.createTextNode(chunk));
  }
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
    fillBubbleText(text, stripStatusEllipsis(turn.text));
    const ellipsis = document.createElement("span");
    ellipsis.className = "home-hero-demo-ellipsis";
    ellipsis.setAttribute("aria-hidden", "true");
    text.appendChild(ellipsis);
    row.classList.add("home-hero-demo-msg--status");
  } else {
    fillBubbleText(text, turn.text);
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
  fillBubbleText(text, turn.text);
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
    // Primary marks the intended click target for the demo loop — no visual
    // pre-highlight; hover/press classes are applied during the scan.
    if (action.variant === "primary") chip.dataset.heroPrimary = "1";
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

  /*
   * Payment block starts collapsed — three bones (label / detail / amount)
   * stagger in L→R after the card pop, pushing the footer/total down.
   */
  const payments = document.createElement("div");
  payments.className =
    "home-hero-demo-sk-invoice-payments home-hero-demo-sk-invoice-payments--pending";

  const payRow = document.createElement("div");
  payRow.className = "home-hero-demo-sk-invoice-payment";
  payRow.innerHTML =
    '<span class="home-hero-demo-sk-bone home-hero-demo-sk-bone--pay-label" data-hero-sk-pay></span>' +
    '<span class="home-hero-demo-sk-bone home-hero-demo-sk-bone--pay-detail" data-hero-sk-pay></span>' +
    '<span class="home-hero-demo-sk-bone home-hero-demo-sk-bone--pay-amt" data-hero-sk-pay></span>';
  payments.appendChild(payRow);

  const footer = document.createElement("div");
  footer.className = "home-hero-demo-sk-invoice-footer";
  footer.innerHTML =
    '<span class="home-hero-demo-sk-bone home-hero-demo-sk-bone--label"></span>' +
    '<span class="home-hero-demo-sk-bone home-hero-demo-sk-bone--total" data-hero-sk-total></span>';

  card.appendChild(header);
  card.appendChild(client);
  card.appendChild(lines);
  card.appendChild(payments);
  card.appendChild(footer);
  row.appendChild(card);

  return row;
}

/** Beat after the total pulse before the card swipes away. */
const INVOICE_SIT_MS = 120;
/** Swipe-off duration (CSS + wait). */
const INVOICE_SWIPE_MS = 500;

/**
 * After "View invoice": bounce a full-width skeleton invoice in, stagger a
 * payment row L→R, pulse the total, then swipe the card off to the right.
 * Marks the scene for a fade outro (no stack settle / cascade).
 */
async function playInvoicePaymentSkeleton(
  sceneEl: HTMLElement,
  relayout: Relayout,
  reducedMotion: boolean,
  isAlive: () => boolean,
): Promise<void> {
  const row = createInvoiceSkeletonCard();
  const card = row.querySelector<HTMLElement>(".home-hero-demo-sk-invoice");
  const payments = row.querySelector<HTMLElement>(".home-hero-demo-sk-invoice-payments");
  const payBones = Array.from(row.querySelectorAll<HTMLElement>("[data-hero-sk-pay]"));
  const total = row.querySelector<HTMLElement>("[data-hero-sk-total]");

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
    payments?.classList.remove("home-hero-demo-sk-invoice-payments--pending");
    payments?.classList.add("home-hero-demo-sk-invoice-payments--open");
    for (const bone of payBones) bone.classList.add("home-hero-demo-sk-bone--pay-in");
    total?.classList.add("home-hero-demo-sk-bone--total-pulse");
    await wait(INVOICE_SIT_MS);
    card?.classList.add("home-hero-demo-sk-invoice--exit");
    await wait(INVOICE_SWIPE_MS);
    // Fade the remaining chat next — don't relayout or bubbles drop down.
    sceneEl.dataset.heroHardCut = "1";
    return;
  }

  // Wait for the scale bounce to settle.
  await wait(780);
  if (!isAlive()) return;

  if (payments) {
    void payments.offsetHeight;
    payments.classList.remove("home-hero-demo-sk-invoice-payments--pending");
    payments.classList.add("home-hero-demo-sk-invoice-payments--open");
    relayout(true);
  }

  // Stagger the three payment bones left → right; each one grows the row.
  for (const bone of payBones) {
    if (!isAlive()) return;
    bone.classList.add("home-hero-demo-sk-bone--pay-in");
    relayout(true);
    await wait(170);
  }

  await wait(220);
  if (!isAlive()) return;

  if (total) {
    total.classList.remove("home-hero-demo-sk-bone--total-pulse");
    void total.offsetWidth;
    total.classList.add("home-hero-demo-sk-bone--total-pulse");
  }

  // Match the CSS pulse (unscaled) so we don't sit past the animation.
  await sleep(850);
  if (!isAlive()) return;
  await wait(INVOICE_SIT_MS);
  if (!isAlive()) return;

  if (card) {
    card.classList.remove("home-hero-demo-sk-invoice--pop");
    card.classList.add("home-hero-demo-sk-invoice--settled");
    void card.offsetWidth;
    card.classList.remove("home-hero-demo-sk-invoice--settled");
    card.style.setProperty("--hero-sk-invoice-exit-ms", `${scaleMs(INVOICE_SWIPE_MS)}ms`);
    card.classList.add("home-hero-demo-sk-invoice--exit");
  }
  await wait(INVOICE_SWIPE_MS);
  if (!isAlive()) return;

  // Signal playScene to fade the rest of the chat (no settle / cascade).
  sceneEl.dataset.heroHardCut = "1";
}

type DashboardNotificationIcon = { iconEmoji?: string; iconUrl?: string };

/** Compact dashboard toast — mirrors admin review alerts (brand icon + copy). */
function createDashboardNotificationCard(
  title: string,
  detail: string,
  icon?: DashboardNotificationIcon,
): HTMLElement {
  const row = document.createElement("div");
  row.className =
    "home-hero-demo-msg home-hero-demo-msg--assistant home-hero-demo-msg--artifact";
  row.setAttribute("role", "listitem");
  row.setAttribute("aria-hidden", "true");

  const card = document.createElement("div");
  card.className = "home-hero-demo-sk-notif";

  const head = document.createElement("div");
  head.className = "home-hero-demo-sk-notif-head";

  const iconUrl = icon?.iconUrl?.trim();
  const iconEmoji = icon?.iconEmoji?.trim();
  if (iconUrl) {
    const brand = document.createElement("img");
    brand.className = "home-hero-demo-sk-notif-icon";
    brand.src = iconUrl;
    brand.alt = "";
    brand.setAttribute("aria-hidden", "true");
    head.appendChild(brand);
  } else if (iconEmoji) {
    const brand = document.createElement("span");
    brand.className =
      "home-hero-demo-sk-notif-icon home-hero-demo-sk-notif-icon--emoji";
    brand.textContent = iconEmoji;
    brand.setAttribute("aria-hidden", "true");
    head.appendChild(brand);
  }

  const copy = document.createElement("div");
  copy.className = "home-hero-demo-sk-notif-copy";

  const titleEl = document.createElement("strong");
  titleEl.className = "home-hero-demo-sk-notif-title";
  titleEl.textContent = title;

  const detailEl = document.createElement("p");
  detailEl.className = "home-hero-demo-sk-notif-detail";
  detailEl.textContent = detail;

  copy.appendChild(titleEl);
  copy.appendChild(detailEl);
  head.appendChild(copy);
  card.appendChild(head);
  row.appendChild(card);
  return row;
}

/** Contract artifact — line bones draw in, then a signature strokes at the bottom. */
function createContractSkeletonCard(): HTMLElement {
  const row = document.createElement("div");
  row.className =
    "home-hero-demo-msg home-hero-demo-msg--assistant home-hero-demo-msg--artifact";
  row.setAttribute("role", "listitem");
  row.setAttribute("aria-hidden", "true");

  const card = document.createElement("div");
  card.className = "home-hero-demo-sk-contract";

  const header = document.createElement("div");
  header.className = "home-hero-demo-sk-contract-header";
  header.innerHTML =
    '<span class="home-hero-demo-sk-bone home-hero-demo-sk-bone--title"></span>' +
    '<span class="home-hero-demo-sk-bone home-hero-demo-sk-bone--meta"></span>';

  const body = document.createElement("div");
  body.className = "home-hero-demo-sk-contract-body";
  const widths = ["92%", "86%", "78%", "90%", "64%"];
  for (const width of widths) {
    const line = document.createElement("span");
    line.className = "home-hero-demo-sk-contract-line";
    line.style.setProperty("--hero-contract-line-w", width);
    body.appendChild(line);
  }

  const signBlock = document.createElement("div");
  signBlock.className = "home-hero-demo-sk-contract-sign";
  signBlock.innerHTML =
    '<span class="home-hero-demo-sk-contract-sign-label"></span>' +
    '<svg class="home-hero-demo-sk-contract-signature" viewBox="0 0 160 36" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
    '<path class="home-hero-demo-sk-contract-signature-path" d="M8 24 C18 8, 28 8, 36 20 C42 30, 48 30, 56 18 C64 6, 74 10, 82 22 C90 34, 102 28, 112 16 C120 8, 132 12, 148 22" />' +
    "</svg>" +
    '<span class="home-hero-demo-sk-contract-sign-rule"></span>';

  card.appendChild(header);
  card.appendChild(body);
  card.appendChild(signBlock);
  row.appendChild(card);
  return row;
}

async function appendAssistantChat(
  root: HTMLElement,
  sceneEl: HTMLElement,
  relayout: Relayout,
  text: string,
  reducedMotion: boolean,
  isAlive: () => boolean,
  opts?: { status?: boolean; pauseMs?: number; priorRow?: HTMLElement | null },
): Promise<HTMLElement | null> {
  const isStatus = opts?.status === true || isStatusMessage(text);

  // Status → reply in the same bubble (matches the main assistant turn path).
  if (!isStatus && opts?.priorRow?.dataset.heroAwaitingReply === "1") {
    await wait(ASSISTANT_RESPONSE_DELAY_MS);
    if (!isAlive()) return opts.priorRow;
    morphStatusToReply(opts.priorRow, { role: "assistant", text });
    relayout(true);
    if (opts.pauseMs != null) await wait(opts.pauseMs);
    return opts.priorRow;
  }

  const typing = createTypingIndicator(root);
  typing.classList.add("home-hero-demo-msg--enter");
  sceneEl.appendChild(typing);
  relayout(true);

  await wait(reducedMotion ? 280 : TYPING_DOTS_MS);
  if (!isAlive()) return null;

  morphTypingToMessage(typing, { role: "assistant", text }, isStatus);
  relayout(true);

  if (isStatus) {
    typing.dataset.heroAwaitingReply = "1";
    await wait(opts?.pauseMs ?? STATUS_HOLD_MS);
    if (!isAlive()) return typing;
  } else if (opts?.pauseMs != null) {
    await wait(opts.pauseMs);
    if (!isAlive()) return typing;
  }

  return typing;
}

async function playDashboardNotification(
  sceneEl: HTMLElement,
  relayout: Relayout,
  reducedMotion: boolean,
  isAlive: () => boolean,
  title: string,
  detail: string,
  icon?: DashboardNotificationIcon,
): Promise<void> {
  const row = createDashboardNotificationCard(title, detail, icon);
  const card = row.querySelector<HTMLElement>(".home-hero-demo-sk-notif");
  sceneEl.appendChild(row);
  relayout(true);

  if (card) {
    if (reducedMotion) {
      card.classList.add("home-hero-demo-sk-notif--settled");
    } else {
      void card.offsetWidth;
      card.classList.add("home-hero-demo-sk-notif--pop");
    }
  }

  await wait(reducedMotion ? 700 : 1100);
  if (!isAlive()) return;
}

async function playContractSkeleton(
  sceneEl: HTMLElement,
  relayout: Relayout,
  reducedMotion: boolean,
  isAlive: () => boolean,
): Promise<void> {
  const row = createContractSkeletonCard();
  const card = row.querySelector<HTMLElement>(".home-hero-demo-sk-contract");
  const lines = Array.from(row.querySelectorAll<HTMLElement>(".home-hero-demo-sk-contract-line"));
  const signature = row.querySelector<HTMLElement>(".home-hero-demo-sk-contract-signature");

  sceneEl.appendChild(row);
  relayout(true);

  if (card) {
    if (reducedMotion) {
      card.classList.add("home-hero-demo-sk-contract--settled");
      for (const line of lines) line.classList.add("home-hero-demo-sk-contract-line--in");
      signature?.classList.add("home-hero-demo-sk-contract-signature--drawn");
      await wait(900);
      return;
    }
    void card.offsetWidth;
    card.classList.add("home-hero-demo-sk-contract--pop");
  }

  await wait(720);
  if (!isAlive()) return;

  for (const line of lines) {
    if (!isAlive()) return;
    line.classList.add("home-hero-demo-sk-contract-line--in");
    relayout(true);
    await wait(140);
  }

  await wait(280);
  if (!isAlive()) return;

  signature?.classList.add("home-hero-demo-sk-contract-signature--drawn");
  await wait(1400);
  if (!isAlive()) return;
}

/**
 * After Silver template press: send proposal → viewed/accepted toasts →
 * contract draw + signature. Ends with a hard cut like the invoice beat.
 */
async function playProposalFlow(
  root: HTMLElement,
  sceneEl: HTMLElement,
  relayout: Relayout,
  reducedMotion: boolean,
  isAlive: () => boolean,
): Promise<void> {
  const sendingRow = await appendAssistantChat(
    root,
    sceneEl,
    relayout,
    "Sending Silver proposal to susie@susiescookies.com…",
    reducedMotion,
    isAlive,
    { status: true, pauseMs: 900 },
  );
  if (!isAlive()) return;

  await appendAssistantChat(
    root,
    sceneEl,
    relayout,
    "Proposal sent to susie@susiescookies.com.",
    reducedMotion,
    isAlive,
    { pauseMs: 900, priorRow: sendingRow },
  );
  if (!isAlive()) return;

  await playDashboardNotification(
    sceneEl,
    relayout,
    reducedMotion,
    isAlive,
    "👀 Proposal viewed",
    "Susie's Cookies",
    { iconEmoji: "🍪" },
  );
  if (!isAlive()) return;

  await wait(650);
  if (!isAlive()) return;

  await playDashboardNotification(
    sceneEl,
    relayout,
    reducedMotion,
    isAlive,
    "✅ Proposal accepted",
    "Susie's Cookies",
    { iconEmoji: "🍪" },
  );
  if (!isAlive()) return;

  await wait(550);
  if (!isAlive()) return;

  const contractStatus = await appendAssistantChat(
    root,
    sceneEl,
    relayout,
    "Sending contract…",
    reducedMotion,
    isAlive,
    { status: true, pauseMs: 850 },
  );
  if (!isAlive()) return;

  await appendAssistantChat(
    root,
    sceneEl,
    relayout,
    "Service agreement ready for signature.",
    reducedMotion,
    isAlive,
    { pauseMs: 500, priorRow: contractStatus },
  );
  if (!isAlive()) return;

  await playContractSkeleton(sceneEl, relayout, reducedMotion, isAlive);
  if (!isAlive()) return;

  await wait(1200);
  if (!isAlive()) return;

  sceneEl.dataset.heroHardCut = "1";
}

const MAPBOX_CSS = "https://api.mapbox.com/mapbox-gl-js/v3.9.0/mapbox-gl.css";
const MAPBOX_JS = "https://cdn.jsdelivr.net/npm/mapbox-gl@3.9.0/+esm";
/** Dark basemap — static + GL share the same look. */
const MAPBOX_STYLE = "mapbox/dark-v11";

let mapboxLoadPromise: Promise<any> | null = null;

function ensureMapboxCss() {
  if (document.querySelector("link[data-hero-mapbox-css]")) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = MAPBOX_CSS;
  link.setAttribute("data-hero-mapbox-css", "1");
  document.head.appendChild(link);
}

async function loadMapboxGl(): Promise<any> {
  ensureMapboxCss();
  if (!mapboxLoadPromise) {
    mapboxLoadPromise = import(/* @vite-ignore */ MAPBOX_JS).then((mod: any) => mod.default || mod);
  }
  return mapboxLoadPromise;
}

/**
 * iOS Safari WebGL maps mis-size under ancestor transforms (our bubble pop /
 * stack depth). Prefer Mapbox Static Images there — still Mapbox, no WebGL.
 */
function preferStaticMapbox(): boolean {
  return isIOSDevice();
}

/** Mapbox Static Images URL — fills the letterbox via object-fit: cover. */
function mapboxStaticUrl(opts: {
  token: string;
  lng: number;
  lat: number;
  zoom: number;
  bearing?: number;
  pitch?: number;
  width: number;
  height: number;
}): string {
  const width = Math.min(1280, Math.max(64, Math.round(opts.width)));
  const height = Math.min(1280, Math.max(64, Math.round(opts.height)));
  const bearing = opts.bearing ?? 0;
  const pitch = opts.pitch ?? 0;
  const path =
    `${opts.lng},${opts.lat},${opts.zoom},${bearing},${pitch}/${width}x${height}@2x`;
  return (
    `https://api.mapbox.com/styles/v1/${MAPBOX_STYLE}/static/${path}` +
    `?access_token=${encodeURIComponent(opts.token)}&attribution=false&logo=false`
  );
}

function preloadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("map image failed"));
    img.src = src;
  });
}

/** Hide everything except land + water. No labels, roads, buildings, etc. */
function stripMapToLandAndWater(map: any) {
  const layers = map.getStyle()?.layers;
  if (!Array.isArray(layers)) return;
  for (const layer of layers) {
    const id = String(layer.id || "");
    const keep =
      id === "background" ||
      id === "land" ||
      id === "national-park" ||
      id.startsWith("landcover") ||
      id.startsWith("landuse") ||
      id.startsWith("water");
    if (!keep) {
      try {
        map.setLayoutProperty(id, "visibility", "none");
      } catch {
        /* layer may not support layout visibility */
      }
    }
  }
}

/** Default male stock headshot for the GPS person pin (field-checkin scene). */
const GPS_PIN_FACE_FALLBACK = "/images/hero-demo/field-checkin.png";

/** Fixed center reticle — not a Mapbox HTML marker (parent transforms break those). */
function createGpsPinOverlay(faceUrl?: string): HTMLElement {
  const el = document.createElement("div");
  el.className = "home-hero-demo-sk-gps-marker";
  el.setAttribute("data-hero-gps-marker", "");
  const src = (faceUrl || "").trim() || GPS_PIN_FACE_FALLBACK;
  const safeSrc = src.replace(/"/g, "");
  el.innerHTML =
    '<span class="home-hero-demo-sk-gps-ring"></span>' +
    '<span class="home-hero-demo-sk-gps-ring home-hero-demo-sk-gps-ring--mid"></span>' +
    '<span class="home-hero-demo-sk-gps-ring home-hero-demo-sk-gps-ring--late"></span>' +
    '<span class="home-hero-demo-sk-gps-pin" aria-hidden="true">' +
    `<img class="home-hero-demo-sk-gps-pin-face" src="${safeSrc}" alt="" loading="lazy" decoding="async" />` +
    "</span>";
  return el;
}

/** Agent-bubble letterbox for Mapbox fly-in — avatar + map + centered face pin. */
function createGpsLocateCard(root: HTMLElement, faceUrl?: string): HTMLElement {
  const row = document.createElement("div");
  row.className =
    "home-hero-demo-msg home-hero-demo-msg--assistant home-hero-demo-msg--gps home-hero-demo-msg--enter";
  row.setAttribute("role", "listitem");
  row.setAttribute("aria-hidden", "true");

  const card = document.createElement("div");
  card.className = "home-hero-demo-sk-gps";

  const viewport = document.createElement("div");
  viewport.className = "home-hero-demo-sk-gps-viewport";

  const mapEl = document.createElement("div");
  mapEl.className = "home-hero-demo-sk-gps-map";
  mapEl.setAttribute("data-hero-gps-map", "");

  viewport.appendChild(mapEl);
  viewport.appendChild(createGpsPinOverlay(faceUrl));
  card.appendChild(viewport);

  row.appendChild(cloneAvatar("assistant", root));
  row.appendChild(card);
  return row;
}

function gpsLetterboxSize(mapEl: HTMLElement): { width: number; height: number } {
  const rect = mapEl.getBoundingClientRect();
  // Static API max 1280; request retina via @2x. Floor so a pre-layout 0 doesn't 404.
  const width = Math.max(320, Math.round(rect.width || mapEl.clientWidth || 320));
  const height = Math.max(180, Math.round(rect.height || mapEl.clientHeight || 180));
  return { width, height };
}

/**
 * iOS-safe Mapbox path: Static Images + CSS fly/crossfade. Avoids WebGL canvas
 * sizing bugs when the bubble/stack use CSS transforms.
 */
async function playGpsStaticFly(
  mapEl: HTMLElement,
  pinEl: HTMLElement | null,
  card: HTMLElement | null,
  opts: {
    token: string;
    target: [number, number];
    start: [number, number];
    endZoom: number;
    endPitch: number;
    endBearing: number;
    flyMs: number;
    markerAt: number;
    reducedMotion: boolean;
    isAlive: () => boolean;
    relayout: Relayout;
  },
): Promise<void> {
  const { width, height } = gpsLetterboxSize(mapEl);
  const overviewUrl = mapboxStaticUrl({
    token: opts.token,
    lng: opts.start[0],
    lat: opts.start[1],
    zoom: 2.6,
    width,
    height,
  });
  const detailUrl = mapboxStaticUrl({
    token: opts.token,
    lng: opts.target[0],
    lat: opts.target[1],
    zoom: opts.endZoom,
    bearing: opts.endBearing,
    pitch: opts.endPitch,
    width,
    height,
  });

  const [overviewImg, detailImg] = await Promise.all([
    preloadImage(overviewUrl),
    preloadImage(detailUrl),
  ]);
  if (!opts.isAlive()) return;

  mapEl.classList.add("home-hero-demo-sk-gps-map--static");
  mapEl.replaceChildren();

  const stage = document.createElement("div");
  stage.className = "home-hero-demo-sk-gps-static-stage";

  overviewImg.className = "home-hero-demo-sk-gps-static-img home-hero-demo-sk-gps-static-img--overview";
  overviewImg.alt = "";
  overviewImg.draggable = false;

  detailImg.className = "home-hero-demo-sk-gps-static-img home-hero-demo-sk-gps-static-img--detail";
  detailImg.alt = "";
  detailImg.draggable = false;

  stage.appendChild(overviewImg);
  stage.appendChild(detailImg);
  mapEl.appendChild(stage);

  opts.relayout(true);

  if (opts.reducedMotion) {
    stage.classList.add("home-hero-demo-sk-gps-static-stage--settled");
    pinEl?.classList.add("home-hero-demo-sk-gps-marker--in", "home-hero-demo-sk-gps-marker--active");
    card?.classList.remove("home-hero-demo-sk-gps--pop");
    card?.classList.add("home-hero-demo-sk-gps--settled");
    await wait(480);
    return;
  }

  const flyMs = scaleMs(opts.flyMs);
  stage.style.setProperty("--hero-gps-fly-ms", `${flyMs}ms`);
  void stage.offsetWidth;
  stage.classList.add("home-hero-demo-sk-gps-static-stage--fly");

  await wait(opts.markerAt);
  if (!opts.isAlive()) return;
  pinEl?.classList.add("home-hero-demo-sk-gps-marker--in", "home-hero-demo-sk-gps-marker--active");

  await wait(Math.max(0, flyMs - opts.markerAt) + 120);
  if (!opts.isAlive()) return;

  stage.classList.add("home-hero-demo-sk-gps-static-stage--settled");
  card?.classList.remove("home-hero-demo-sk-gps--pop");
  card?.classList.add("home-hero-demo-sk-gps--settled");
  opts.relayout(true);
}

/**
 * Status-line GPS beat: Mapbox fly-in. iOS uses Static Images (WebGL mis-sizes
 * under our transforms); desktop uses GL with land/water stripping. A fixed
 * center pin appears mid-flight. Letterbox stays in the stack for later turns.
 */
async function playGpsLocateSkeleton(
  root: HTMLElement,
  sceneEl: HTMLElement,
  relayout: Relayout,
  reducedMotion: boolean,
  isAlive: () => boolean,
  mapboxToken: string,
  faceUrl?: string,
): Promise<void> {
  const FLY_MS = 2600;
  const MARKER_AT = Math.round(FLY_MS * 0.66);
  const END_ZOOM = 13.4;
  const END_PITCH = 48;
  const END_BEARING = -22;
  // Arbitrary coastal job site — not meant to match a real address.
  const TARGET: [number, number] = [-70.255, 43.661];
  const START: [number, number] = [-95.7, 37.1];

  const row = createGpsLocateCard(root, faceUrl);
  const card = row.querySelector<HTMLElement>(".home-hero-demo-sk-gps");
  const mapEl = row.querySelector<HTMLElement>("[data-hero-gps-map]");
  const pinEl = row.querySelector<HTMLElement>("[data-hero-gps-marker]");

  sceneEl.appendChild(row);
  relayout(true);

  if (card) {
    void card.offsetWidth;
    card.classList.add(reducedMotion ? "home-hero-demo-sk-gps--settled" : "home-hero-demo-sk-gps--pop");
  }

  if (!mapboxToken || !mapEl) {
    pinEl?.classList.add("home-hero-demo-sk-gps-marker--in", "home-hero-demo-sk-gps-marker--active");
    await wait(reducedMotion ? 400 : 900);
    return;
  }

  // Let the bubble pop settle before measuring / painting map content.
  await wait(reducedMotion ? 80 : 420);
  if (!isAlive()) return;

  const staticOpts = {
    token: mapboxToken,
    target: TARGET,
    start: START,
    endZoom: END_ZOOM,
    endPitch: END_PITCH,
    endBearing: END_BEARING,
    flyMs: FLY_MS,
    markerAt: scaleMs(MARKER_AT),
    reducedMotion,
    isAlive,
    relayout,
  };

  if (preferStaticMapbox()) {
    try {
      await playGpsStaticFly(mapEl, pinEl, card, staticOpts);
    } catch {
      pinEl?.classList.add("home-hero-demo-sk-gps-marker--in", "home-hero-demo-sk-gps-marker--active");
      card?.classList.remove("home-hero-demo-sk-gps--pop");
      card?.classList.add("home-hero-demo-sk-gps--settled");
      await wait(reducedMotion ? 400 : 900);
    }
    return;
  }

  let map: any = null;

  const teardown = () => {
    try {
      map?.remove?.();
    } catch {
      /* ignore */
    }
    map = null;
  };

  // Scene resets remove the row — tear down the WebGL map when that happens.
  const orphanWatch = new MutationObserver(() => {
    if (!row.isConnected) {
      teardown();
      orphanWatch.disconnect();
    }
  });
  orphanWatch.observe(sceneEl, { childList: true });

  try {
    const mapboxgl = await loadMapboxGl();
    if (!isAlive()) {
      teardown();
      orphanWatch.disconnect();
      return;
    }

    // Drop the pop transform before WebGL init — scale() ancestors break canvas size.
    card?.classList.remove("home-hero-demo-sk-gps--pop");
    card?.classList.add("home-hero-demo-sk-gps--settled");
    relayout(true);
    await wait(32);
    if (!isAlive()) {
      teardown();
      orphanWatch.disconnect();
      return;
    }

    mapboxgl.accessToken = mapboxToken;
    map = new mapboxgl.Map({
      container: mapEl,
      style: `mapbox://styles/${MAPBOX_STYLE}`,
      center: reducedMotion ? TARGET : START,
      zoom: reducedMotion ? END_ZOOM : 2.4,
      pitch: reducedMotion ? END_PITCH : 0,
      bearing: reducedMotion ? END_BEARING : 0,
      interactive: false,
      attributionControl: false,
      fadeDuration: 0,
      fitBoundsOptions: { padding: 0 },
    });

    await new Promise<void>((resolve) => {
      const done = () => resolve();
      map.once("load", done);
      window.setTimeout(done, 4000);
    });
    if (!isAlive()) {
      teardown();
      orphanWatch.disconnect();
      return;
    }

    stripMapToLandAndWater(map);
    mapEl.querySelectorAll(".mapboxgl-ctrl, .mapboxgl-ctrl-logo, .mapboxgl-ctrl-attrib").forEach((node) => {
      (node as HTMLElement).style.display = "none";
    });

    map.resize();
    relayout(true);
    requestAnimationFrame(() => map?.resize());

    if (reducedMotion) {
      map.jumpTo({
        center: TARGET,
        zoom: END_ZOOM,
        pitch: END_PITCH,
        bearing: END_BEARING,
      });
      pinEl?.classList.add("home-hero-demo-sk-gps-marker--in", "home-hero-demo-sk-gps-marker--active");
      await wait(480);
    } else {
      const flyDuration = scaleMs(FLY_MS);
      const flyDone = new Promise<void>((resolve) => {
        map.once("moveend", () => resolve());
        window.setTimeout(() => resolve(), flyDuration + 240);
      });

      map.flyTo({
        center: TARGET,
        zoom: END_ZOOM,
        pitch: END_PITCH,
        bearing: END_BEARING,
        duration: flyDuration,
        essential: true,
        curve: 1.35,
      });

      await wait(scaleMs(MARKER_AT));
      if (!isAlive()) {
        teardown();
        orphanWatch.disconnect();
        return;
      }

      // Fixed center reticle — world flies under it; always letterbox-centered.
      pinEl?.classList.add("home-hero-demo-sk-gps-marker--in", "home-hero-demo-sk-gps-marker--active");

      await flyDone;
      if (!isAlive()) {
        teardown();
        orphanWatch.disconnect();
        return;
      }

      map.resize();
      map.jumpTo({
        center: TARGET,
        zoom: END_ZOOM,
        pitch: END_PITCH,
        bearing: END_BEARING,
      });
      await wait(420);
    }

    relayout(true);
    requestAnimationFrame(() => map?.resize());
    // Leave the letterbox in the stack — later turns scroll it up naturally.
  } catch {
    teardown();
    orphanWatch.disconnect();
    // Desktop WebGL failed — same static path iOS uses.
    if (isAlive() && mapEl.isConnected) {
      try {
        await playGpsStaticFly(mapEl, pinEl, card, staticOpts);
        return;
      } catch {
        /* fall through */
      }
    }
    pinEl?.classList.add("home-hero-demo-sk-gps-marker--in", "home-hero-demo-sk-gps-marker--active");
    card?.classList.remove("home-hero-demo-sk-gps--pop");
    card?.classList.add("home-hero-demo-sk-gps--settled");
  }
}

function createUserComposingShell(
  root: HTMLElement,
  kind: "voice" | "slash" | "mention" | "soft-mention",
  userAvatarUrl?: string,
): HTMLElement {
  const row = document.createElement("div");
  row.className = "home-hero-demo-msg home-hero-demo-msg--user home-hero-demo-msg--composing";
  row.setAttribute("role", "listitem");

  const bubble = document.createElement("div");
  bubble.className = "home-hero-demo-bubble";
  if (kind === "slash") bubble.classList.add("home-hero-demo-bubble--slash");
  if (kind === "mention" || kind === "soft-mention") {
    bubble.classList.add("home-hero-demo-bubble--mention");
  }

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

function mentionSubline(option: HeroDemoMentionOption): string {
  return [option.company, option.email, option.phone].filter(Boolean).join(" · ");
}

function buildMentionPicker(options: HeroDemoMentionOption[]): HTMLElement {
  const panel = document.createElement("div");
  panel.className = "home-hero-demo-mention-picker";
  panel.setAttribute("role", "listbox");
  panel.setAttribute("aria-label", "Mention people");

  const list = document.createElement("ul");
  list.className = "home-hero-demo-mention-picker-list";

  for (const option of options) {
    const item = document.createElement("li");
    item.className = "home-hero-demo-mention-option";

    const kind = document.createElement("span");
    kind.className = "home-hero-demo-mention-option-kind";
    kind.textContent = option.kind === "team" ? "Team" : "Contact";

    const body = document.createElement("span");
    body.className = "home-hero-demo-mention-option-body";

    const name = document.createElement("span");
    name.className = "home-hero-demo-mention-option-name";
    name.textContent = `@${option.name}`;

    const sub = mentionSubline(option);
    body.appendChild(name);
    if (sub) {
      const summary = document.createElement("span");
      summary.className = "home-hero-demo-mention-option-summary";
      summary.textContent = sub;
      body.appendChild(summary);
    }

    item.appendChild(kind);
    item.appendChild(body);
    list.appendChild(item);
  }

  panel.appendChild(list);
  return panel;
}

function setMentionPickerHighlight(picker: HTMLElement, index: number) {
  picker.querySelectorAll<HTMLElement>(".home-hero-demo-mention-option").forEach((item, i) => {
    item.classList.toggle("active", i === index);
    if (i === index) item.setAttribute("aria-selected", "true");
    else item.removeAttribute("aria-selected");
  });
}

/** Simulate ArrowDown until the intended contact is highlighted. */
async function animateMentionPickerToTarget(
  picker: HTMLElement,
  options: HeroDemoMentionOption[],
  targetName: string,
  reducedMotion: boolean,
  isAlive: () => boolean,
): Promise<void> {
  const targetIndex = options.findIndex((option) => option.name === targetName);
  if (targetIndex < 0) {
    await wait(reducedMotion ? 280 : MENTION_PICKER_SELECT_HOLD_MS);
    return;
  }

  const arrowMs = reducedMotion ? 100 : MENTION_PICKER_ARROW_MS;
  const holdMs = reducedMotion ? 220 : MENTION_PICKER_SELECT_HOLD_MS;

  await wait(reducedMotion ? 80 : MENTION_PICKER_OPEN_MS);
  if (!isAlive()) return;

  for (let i = 0; i <= targetIndex; i++) {
    setMentionPickerHighlight(picker, i);
    await wait(i === targetIndex ? holdMs : arrowMs);
    if (!isAlive()) return;
  }
}

/**
 * Parse a mention turn: prefix before `@`, the @Name token, and optional trailing copy.
 * Prefer the longest spoofed contact name that matches after `@`.
 */
function parseMentionTurn(full: string): {
  prefix: string;
  mentionName: string;
  query: string;
  suffix: string;
} {
  const at = full.indexOf("@");
  if (at < 0) {
    return { prefix: "", mentionName: full.trim(), query: "", suffix: "" };
  }
  const prefix = full.slice(0, at);
  const after = full.slice(at + 1);

  let mentionName = "";
  for (const name of heroDemoMentionNames()) {
    if (after.startsWith(name) && name.length > mentionName.length) {
      mentionName = name;
    }
  }
  if (!mentionName) {
    const tokenEnd = after.search(/\s/);
    mentionName = (tokenEnd < 0 ? after : after.slice(0, tokenEnd)).trim();
  }

  const suffix = after.slice(mentionName.length);
  // Typed filter query is the first word of the contact name (matches "to The…").
  const query = mentionName.split(/\s/)[0] ?? mentionName;
  return { prefix, mentionName, query, suffix };
}

function filterMentionOptions(query: string): HeroDemoMentionOption[] {
  const q = query.toLowerCase();
  const filtered = HERO_DEMO_MENTION_PICKER.filter(
    (option) =>
      option.name.toLowerCase().startsWith(q) ||
      option.company.toLowerCase().startsWith(q) ||
      option.name.toLowerCase().includes(` ${q}`),
  );
  return filtered.length ? filtered : HERO_DEMO_MENTION_PICKER;
}

/** Type prefix → open picker → highlight target → insert @Name → type suffix. */
async function playMentionPickerSegment(
  textEl: HTMLElement,
  relayout: Relayout,
  reducedMotion: boolean,
  isAlive: () => boolean,
  charMs: number,
  parsed: { prefix: string; mentionName: string; query: string; suffix: string },
  soft: boolean,
): Promise<void> {
  const { prefix, mentionName, query, suffix } = parsed;
  // Type a short filter fragment (e.g. "Sar", "The") — picker still targets the full name.
  const typedQuery = query.length > 3 ? query.slice(0, 3) : query;
  const pickerOptions = filterMentionOptions(typedQuery);
  // Preserve anything already typed (e.g. a slash command) before this segment.
  const beforeSegment = textEl.textContent ?? "";

  if (prefix) {
    await typeText(textEl, prefix, charMs, isAlive, relayout);
    if (!isAlive()) return;
  }

  if (!soft) {
    await typeText(textEl, "@", MENTION_CHAR_MS, isAlive, relayout);
    if (!isAlive()) return;
  }

  const bubble = textEl.closest<HTMLElement>(".home-hero-demo-bubble");
  if (!bubble) return;

  const picker = buildMentionPicker(pickerOptions);
  bubble.appendChild(picker);
  requestAnimationFrame(() => {
    picker.classList.add("home-hero-demo-mention-picker--visible");
  });

  if (typedQuery) {
    await typeText(textEl, typedQuery, MENTION_CHAR_MS, isAlive, relayout);
    if (!isAlive()) return;
  }

  await animateMentionPickerToTarget(
    picker,
    pickerOptions,
    mentionName,
    reducedMotion,
    isAlive,
  );
  if (!isAlive()) return;

  picker.classList.remove("home-hero-demo-mention-picker--visible");
  picker.classList.add("home-hero-demo-mention-picker--exit");
  await wait(280);
  picker.remove();

  // Selection replaces the partial query (and optional `@`) with a mention chip.
  fillBubbleText(textEl, `${beforeSegment}${prefix}@${mentionName}`);
  relayout();

  if (suffix) await typeText(textEl, suffix, charMs, isAlive, relayout);
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
    appendBubbleChars(el, ch);
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
    // Don't fight the outro — rewriting opacity mid-fade makes it look instant.
    if (msg.closest(".home-hero-demo-scene--exit")) return;
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
    if (rest.includes("@")) {
      await playMentionPickerSegment(
        textEl,
        relayout,
        reducedMotion,
        isAlive,
        charMs,
        parseMentionTurn(rest),
        true,
      );
    } else if (rest) {
      await typeText(textEl, rest, charMs, isAlive, relayout);
    }
  } else if (kind === "mention" || kind === "soft-mention") {
    await playMentionPickerSegment(
      textEl,
      relayout,
      reducedMotion,
      isAlive,
      charMs,
      parseMentionTurn(full),
      kind === "soft-mention",
    );
  } else {
    await typeText(textEl, full, charMs, isAlive, relayout);
  }

  if (!isAlive()) return;
  // Upgrade any remaining plain `@Name` tokens (e.g. voice turns) into chips.
  fillBubbleText(textEl, full);
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
  mapboxToken = "",
  userAvatarUrl?: string,
): Promise<HTMLElement | null> {
  const isStatus = isStatusMessage(turn.text);
  const thinkMs = turn.pauseMs ?? DEFAULT_THINK_MS;
  const isGpsOnly = turn.effect === "gps-locate" && !turn.text.trim();

  // Status line → reply in the same bubble (no second bubble).
  if (!isStatus && !isGpsOnly && priorAssistantRow?.dataset.heroAwaitingReply === "1") {
    await wait(ASSISTANT_RESPONSE_DELAY_MS);
    if (!isAlive()) return priorAssistantRow;
    morphStatusToReply(priorAssistantRow, turn);
    relayout(true);

    if (turn.actions?.length) {
      await wait(ACTION_APPEAR_MS);
      if (!isAlive()) return priorAssistantRow;
      await simulateActionPress(
        priorAssistantRow,
        sceneEl,
        root,
        relayout,
        reducedMotion,
        isAlive,
      );
    }

    return priorAssistantRow;
  }

  await wait(ASSISTANT_RESPONSE_DELAY_MS);
  if (!isAlive()) return null;

  // Visual-only GPS reply — typing dots, then the map bubble (no status copy).
  if (isGpsOnly) {
    const typing = createTypingIndicator(root);
    typing.classList.add("home-hero-demo-msg--enter");
    sceneEl.appendChild(typing);
    relayout(true);
    await wait(reducedMotion ? 320 : TYPING_DOTS_MS);
    if (!isAlive()) return null;
    typing.remove();
    await playGpsLocateSkeleton(
      root,
      sceneEl,
      relayout,
      reducedMotion,
      isAlive,
      mapboxToken,
      userAvatarUrl,
    );
    return null;
  }

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
    await wait(ACTION_APPEAR_MS);
    if (!isAlive()) return typing;
    await simulateActionPress(typing, sceneEl, root, relayout, reducedMotion, isAlive);
  }

  return typing;
}

function clearActionHover(chips: HTMLElement[]): void {
  for (const chip of chips) chip.classList.remove("home-hero-demo-action--hover");
}

/** Pick the next hop — prefer unvisited chips; never the same chip twice in a row. */
function pickRandomHoverChip(
  chips: HTMLElement[],
  previous: HTMLElement | null,
  visited: ReadonlySet<HTMLElement> = new Set(),
): HTMLElement {
  if (chips.length === 1) return chips[0]!;
  const unvisited = chips.filter((chip) => !visited.has(chip) && chip !== previous);
  if (unvisited.length > 0) {
    return unvisited[Math.floor(Math.random() * unvisited.length)]!;
  }
  const pool = previous ? chips.filter((chip) => chip !== previous) : chips;
  return pool[Math.floor(Math.random() * pool.length)]!;
}

/**
 * Randomly hop the hover highlight across action chips, then settle on the
 * intended target. Chips render muted — nothing is pre-highlighted.
 */
async function simulateActionHoverScan(
  chips: HTMLElement[],
  target: HTMLElement,
  reducedMotion: boolean,
  isAlive: () => boolean,
): Promise<void> {
  if (chips.length === 0) return;

  if (reducedMotion || chips.length === 1) {
    clearActionHover(chips);
    target.classList.add("home-hero-demo-action--hover");
    await wait(reducedMotion ? 180 : ACTION_HOVER_SETTLE_MS);
    if (!isAlive()) {
      clearActionHover(chips);
      return;
    }
    return;
  }

  const cappedMax = Math.min(ACTION_HOVER_HOPS_MAX, chips.length);
  const cappedMin = Math.min(ACTION_HOVER_HOPS_MIN, cappedMax);
  const hopSpan = cappedMax - cappedMin + 1;
  const hops = cappedMin + Math.floor(Math.random() * hopSpan);

  let previous: HTMLElement | null = null;
  const visited = new Set<HTMLElement>();
  for (let i = 0; i < hops; i++) {
    // Last hop prefers an unvisited non-target so settling on the choice reads clearly.
    let chip: HTMLElement;
    if (i === hops - 1 && chips.length > 1) {
      const others = chips.filter(
        (c) => c !== target && c !== previous && !visited.has(c),
      );
      const pool =
        others.length > 0
          ? others
          : chips.filter((c) => c !== target && c !== previous);
      chip =
        pool.length > 0
          ? pool[Math.floor(Math.random() * pool.length)]!
          : pickRandomHoverChip(chips, previous, visited);
    } else {
      chip = pickRandomHoverChip(chips, previous, visited);
    }

    clearActionHover(chips);
    chip.classList.add("home-hero-demo-action--hover");
    previous = chip;
    visited.add(chip);
    await wait(ACTION_HOVER_MS);
    if (!isAlive()) {
      clearActionHover(chips);
      return;
    }
  }

  clearActionHover(chips);
  target.classList.add("home-hero-demo-action--hover");
  await wait(ACTION_HOVER_SETTLE_MS);
  if (!isAlive()) {
    clearActionHover(chips);
  }
}

async function simulateActionPress(
  row: HTMLElement,
  sceneEl: HTMLElement,
  root: HTMLElement,
  relayout: Relayout,
  reducedMotion: boolean,
  isAlive: () => boolean,
): Promise<void> {
  const chips = [
    ...row.querySelectorAll<HTMLElement>(".home-hero-demo-action"),
  ];
  if (chips.length === 0) return;

  const withEffect = row.querySelector<HTMLElement>(".home-hero-demo-action[data-hero-effect]");
  const primary = row.querySelector<HTMLElement>(".home-hero-demo-action[data-hero-primary]");
  const target = withEffect ?? primary ?? chips[0]!;

  await simulateActionHoverScan(chips, target, reducedMotion, isAlive);
  if (!isAlive()) return;

  clearActionHover(chips);
  target.classList.add("home-hero-demo-action--pressed");

  const effect = target.dataset.heroEffect;

  await wait(ACTION_PRESS_MS);
  if (!isAlive()) return;
  target.classList.remove("home-hero-demo-action--pressed");

  if (effect === "invoice-payment") {
    await playInvoicePaymentSkeleton(sceneEl, relayout, reducedMotion, isAlive);
  } else if (effect === "proposal-flow") {
    await playProposalFlow(root, sceneEl, relayout, reducedMotion, isAlive);
  } else {
    const label = (target.textContent || "Open").trim() || "Open";
    await playActionPlaceholder(sceneEl, relayout, reducedMotion, isAlive, label);
  }
}

/** Generic beat when a demo action chip has no bespoke skeleton yet. */
async function playActionPlaceholder(
  sceneEl: HTMLElement,
  relayout: Relayout,
  reducedMotion: boolean,
  isAlive: () => boolean,
  label: string,
): Promise<void> {
  await playDashboardNotification(
    sceneEl,
    relayout,
    reducedMotion,
    isAlive,
    label,
    "Opening…",
  );
  await wait(reducedMotion ? 400 : 650);
}

function animateSceneExit(sceneEl: HTMLElement): Promise<void> {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced) {
    sceneEl.remove();
    return Promise.resolve();
  }

  /*
   * Fade the bubbles themselves. A scene-level class toggle was easy to miss —
   * the depth pass already writes inline opacity on each message, so dissolving
   * those values to 0 is what actually reads as an outro. Pin each bubble's
   * current opacity with transition disabled, reflow, then ease to 0 over 350ms.
   */
  const ms = SCENE_EXIT_MS;
  const messages = Array.from(sceneEl.querySelectorAll<HTMLElement>(".home-hero-demo-msg"));

  sceneEl.style.setProperty("--hero-scene-exit-ms", `${ms}ms`);
  sceneEl.classList.add("home-hero-demo-scene--exit");

  for (const msg of messages) {
    const current = msg.style.opacity || getComputedStyle(msg).opacity || "1";
    msg.style.transition = "none";
    msg.style.opacity = current;
  }
  void sceneEl.offsetWidth;

  for (const msg of messages) {
    msg.style.transition = `opacity ${ms}ms ease`;
    msg.style.opacity = "0";
  }

  // No message rows (shouldn't happen) — fall back to fading the scene wrapper.
  if (!messages.length) {
    sceneEl.style.transition = "none";
    sceneEl.style.opacity = "1";
    void sceneEl.offsetWidth;
    sceneEl.style.transition = `opacity ${ms}ms ease`;
    sceneEl.style.opacity = "0";
  }

  return new Promise((resolve) => {
    window.setTimeout(() => {
      sceneEl.remove();
      resolve();
    }, ms);
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

  const mapboxToken = (root.dataset.mapboxToken || "").trim();
  const hero = root.closest<HTMLElement>(".home-hero");
  const viewport = root.querySelector<HTMLElement>("[data-hero-demo-viewport]");
  const stack = root.querySelector<HTMLElement>("[data-hero-demo-stack]");
  const controls = hero?.querySelector<HTMLElement>("[data-hero-demo-controls]") ?? null;
  const iconEl = hero?.querySelector<HTMLElement>("[data-hero-icon]") ?? null;
  const brandEl = hero?.querySelector<HTMLElement>("[data-hero-brand]") ?? null;
  // CTAs are a sibling of the chat stack inside .home-hero-demo.
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

      const hadActionChips = Boolean(turn.actions?.length);
      lastAssistantRow = await playAssistantTurn(
        turn,
        root,
        sceneEl,
        relayout,
        reducedMotion,
        isAlive,
        lastAssistantRow,
        mapboxToken,
        scene.userAvatar,
      );

      // The chip press is the user's choice — don't follow with a mock user bubble.
      if (hadActionChips) {
        while (i + 1 < scene.turns.length && scene.turns[i + 1]!.role === "user") {
          i++;
        }
      }

      if (sceneEl.dataset.heroHardCut === "1") {
        // Invoice already swiped away — fade the remaining chat, then next scene.
        await animateSceneExit(sceneEl);
        resetStack(stack);
        return;
      }
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

      // Temporary testing: stop after a single pass when data-once is set.
      if (once) {
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
