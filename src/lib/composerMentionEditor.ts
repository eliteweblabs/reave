import { mentionTokenRe, splitMentionText } from './chatMentions';

export const MENTION_TOKEN_ATTR = 'data-mention-token';

export type ComposerFieldHandle = {
  focus: () => void;
  getValue: () => string;
  getCaret: () => number;
  setCaret: (offset: number) => void;
  getElement: () => HTMLElement | null;
};

function isBlockEl(el: HTMLElement): boolean {
  return el.tagName === 'DIV' || el.tagName === 'P';
}

function walkEditor(
  root: HTMLElement,
  caretNode: Node | null,
  caretOffset: number,
): { text: string; caret: number } {
  let text = '';
  let caret: number | null = null;

  const markCaret = (at: number) => {
    if (caret == null) caret = at;
  };

  const walk = (node: Node, nodeIsCaret: boolean) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const start = text.length;
      const value = (node.textContent ?? '').replace(/\u00a0/g, ' ');
      text += value;
      if (node === caretNode) markCaret(start + Math.min(Math.max(caretOffset, 0), value.length));
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    const token = el.getAttribute(MENTION_TOKEN_ATTR);
    if (token) {
      const start = text.length;
      text += token;
      if (el === caretNode || (caretNode != null && el.contains(caretNode))) {
        markCaret(start + token.length);
      }
      return;
    }
    if (el.tagName === 'BR') {
      if (node === caretNode) markCaret(text.length);
      text += '\n';
      return;
    }
    if (isBlockEl(el) && text.length > 0 && !text.endsWith('\n')) text += '\n';

    const kids = el.childNodes;
    if (nodeIsCaret || node === caretNode) {
      for (let i = 0; i < kids.length; i++) {
        if (i === caretOffset) markCaret(text.length);
        walk(kids[i]!, false);
      }
      if (caretOffset >= kids.length) markCaret(text.length);
      return;
    }
    for (const child of kids) walk(child, false);
  };

  if (root === caretNode) {
    walk(root, true);
  } else {
    for (const child of root.childNodes) walk(child, false);
    if (caretNode && root.contains(caretNode) === false) caret = text.length;
  }

  if (text === '\n') text = '';
  return { text, caret: caret ?? text.length };
}

export function serializeMentionEditor(el: HTMLElement): string {
  return walkEditor(el, null, 0).text;
}

export function getMentionEditorCaret(el: HTMLElement): number {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return serializeMentionEditor(el).length;
  const range = sel.getRangeAt(0);
  const node = range.startContainer;
  if (!el.contains(node) && node !== el) return serializeMentionEditor(el).length;
  return walkEditor(el, node, range.startOffset).caret;
}

export function renderMentionEditor(el: HTMLElement, text: string): void {
  el.replaceChildren();
  const segments = splitMentionText(text);
  if (!segments.length) return;

  const appendText = (value: string, target: HTMLElement) => {
    const parts = value.split('\n');
    parts.forEach((part, i) => {
      if (i > 0) target.appendChild(document.createElement('br'));
      if (part) target.appendChild(document.createTextNode(part));
    });
  };

  for (const seg of segments) {
    if (seg.type === 'text') {
      appendText(seg.value, el);
      continue;
    }
    const chip = document.createElement('span');
    chip.className = `aui-mention-chip aui-mention-chip--${seg.kind === 'user' ? 'team' : 'contact'}`;
    chip.contentEditable = 'false';
    chip.setAttribute(MENTION_TOKEN_ATTR, seg.token);
    chip.textContent = `@${seg.label}`;
    chip.title = seg.kind === 'contact' ? `Contact ${seg.id}` : `Team ${seg.id}`;
    el.appendChild(chip);
  }
}

export function setMentionEditorCaret(el: HTMLElement, offset: number): void {
  let remaining = Math.max(0, offset);

  const place = (node: Node, at: number) => {
    const range = document.createRange();
    range.setStart(node, at);
    range.collapse(true);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  };

  const placeAfter = (node: Node) => {
    const parent = node.parentNode;
    if (!parent) return false;
    const idx = Array.from(parent.childNodes).indexOf(node as ChildNode) + 1;
    place(parent, idx);
    return true;
  };

  const walk = (node: Node): boolean => {
    if (node.nodeType === Node.TEXT_NODE) {
      const len = (node.textContent ?? '').length;
      if (remaining <= len) {
        place(node, remaining);
        return true;
      }
      remaining -= len;
      return false;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return false;
    const html = node as HTMLElement;
    const token = html.getAttribute(MENTION_TOKEN_ATTR);
    if (token) {
      if (remaining <= token.length) return placeAfter(html);
      remaining -= token.length;
      return false;
    }
    if (html.tagName === 'BR') {
      if (remaining <= 1) return placeAfter(html);
      remaining -= 1;
      return false;
    }
    if (isBlockEl(html) && remaining > 0) {
      // serializeMentionEditor inserts a newline before a block when prior text
      // does not already end in \n — consume that virtual newline if present.
    }
    for (const child of html.childNodes) {
      if (walk(child)) return true;
    }
    return false;
  };

  for (const child of el.childNodes) {
    if (walk(child)) return;
  }
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
}

export function mentionEditorHasRawTokens(el: HTMLElement): boolean {
  const re = mentionTokenRe();
  const walk = (node: Node): boolean => {
    if (node.nodeType === Node.TEXT_NODE) return re.test(node.textContent ?? '');
    if (node.nodeType !== Node.ELEMENT_NODE) return false;
    const html = node as HTMLElement;
    if (html.getAttribute(MENTION_TOKEN_ATTR)) return false;
    for (const child of html.childNodes) {
      if (walk(child)) return true;
    }
    return false;
  };
  return walk(el);
}

export function syncMentionEditorEmpty(el: HTMLElement, text: string): void {
  el.dataset.empty = text.trim() ? '0' : '1';
}
