/**
 * Structured @-mentions from agent chat — contacts and Clerk team users.
 * Composer stores durable `@[Name](contact:uid)` / `@[Name](user:id)` tokens
 * so the agent always gets stable ids. The composer editor renders those as
 * chips (label only). On send we also rewrite leftover plain `@Name` picks.
 */

export type ChatContactMention = {
  kind: 'contact';
  uid: string;
  name: string;
  email?: string;
  company?: string;
};

export type ChatUserMention = {
  kind: 'user';
  userId: string;
  name: string;
  email?: string;
};

export type ChatMention = ChatContactMention | ChatUserMention;

export type MentionableClientKind = 'professional' | 'proposed';

export type PeopleSearchContact = ChatContactMention & {
  phone?: string;
  clientKind?: MentionableClientKind;
};

export type PeopleSearchUser = ChatUserMention & {
  username?: string;
};

export type PeopleSearchResult = PeopleSearchContact | PeopleSearchUser;

/** @-mention roster: project clients and proposed prospects — not personal or service. */
export function isMentionableClientKind(kind: string | null | undefined): kind is MentionableClientKind {
  return kind === 'professional' || kind === 'proposed';
}

/** Durable mention token: `@[Display Name](contact:uuid)` or `@[Display Name](user:id)`. */
export const MENTION_TOKEN_RE =
  /@\[([^\]\n]{1,256})\]\((contact|user):([^\s)]{1,128})\)/g;

export function mentionTokenRe(): RegExp {
  return new RegExp(MENTION_TOKEN_RE.source, 'g');
}

export type MentionTextSegment =
  | { type: 'text'; value: string }
  | { type: 'mention'; label: string; kind: 'contact' | 'user'; id: string; token: string };

/** Split composer / bubble text into plain runs and durable mention tokens. */
export function splitMentionText(text: string): MentionTextSegment[] {
  if (!text) return [];
  const out: MentionTextSegment[] = [];
  let last = 0;
  for (const match of text.matchAll(mentionTokenRe())) {
    const start = match.index ?? 0;
    if (start > last) out.push({ type: 'text', value: text.slice(last, start) });
    const label = match[1] ?? '';
    const kind = match[2] === 'user' ? 'user' : 'contact';
    const id = (match[3] ?? '').trim();
    if (label && id) {
      out.push({ type: 'mention', label, kind, id, token: match[0] });
    } else {
      out.push({ type: 'text', value: match[0] });
    }
    last = start + match[0].length;
  }
  if (last < text.length) out.push({ type: 'text', value: text.slice(last) });
  return out;
}

function optionalTrimmed(value: unknown): string | undefined {
  if (value == null) return undefined;
  const s = String(value).trim();
  return s || undefined;
}

export function mentionKey(m: ChatMention): string {
  return m.kind === 'contact' ? `contact:${m.uid}` : `user:${m.userId}`;
}

/** Labels must not contain `]` or newlines or the token grammar breaks. */
export function sanitizeMentionLabel(name: string): string {
  return name.replace(/[\[\]\n\r]/g, '').trim() || 'Unknown';
}

export function serializeMentionToken(m: ChatMention): string {
  const label = sanitizeMentionLabel(m.name);
  if (m.kind === 'contact') return `@[${label}](contact:${m.uid})`;
  return `@[${label}](user:${m.userId})`;
}

/** Validate and normalize mentions from a chat POST body. */
export function parseChatMentions(raw: unknown): ChatMention[] {
  if (!Array.isArray(raw)) return [];
  const out: ChatMention[] = [];
  const seen = new Set<string>();

  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const kind = String(rec.kind ?? '').trim();
    const name = sanitizeMentionLabel(optionalTrimmed(rec.name) || 'Unknown');

    if (kind === 'contact') {
      const uid = optionalTrimmed(rec.uid);
      if (!uid) continue;
      const key = `contact:${uid}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        kind: 'contact',
        uid,
        name,
        email: optionalTrimmed(rec.email),
        company: optionalTrimmed(rec.company),
      });
      continue;
    }

    if (kind === 'user') {
      const userId = optionalTrimmed(rec.userId);
      if (!userId) continue;
      const key = `user:${userId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        kind: 'user',
        userId,
        name,
        email: optionalTrimmed(rec.email),
      });
    }
  }

  return out;
}

/** Extract durable mention tokens from composed / stored message text. */
export function parseMentionTokensFromText(text: string): ChatMention[] {
  if (!text) return [];
  const out: ChatMention[] = [];
  const seen = new Set<string>();
  for (const match of text.matchAll(MENTION_TOKEN_RE)) {
    const label = sanitizeMentionLabel(match[1] ?? '');
    const kind = match[2];
    const id = (match[3] ?? '').trim();
    if (!label || !id) continue;
    if (kind === 'contact') {
      const key = `contact:${id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ kind: 'contact', uid: id, name: label });
    } else if (kind === 'user') {
      const key = `user:${id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ kind: 'user', userId: id, name: label });
    }
  }
  return out;
}

export function mergeChatMentions(...lists: ChatMention[][]): ChatMention[] {
  const byKey = new Map<string, ChatMention>();
  for (const list of lists) {
    for (const m of list) {
      const key = mentionKey(m);
      const prev = byKey.get(key);
      if (!prev) {
        byKey.set(key, m);
        continue;
      }
      // Prefer the copy that still has email/company extras.
      if (prev.kind === 'contact' && m.kind === 'contact') {
        byKey.set(key, {
          kind: 'contact',
          uid: m.uid,
          name: m.name || prev.name,
          email: m.email || prev.email,
          company: m.company || prev.company,
        });
      } else if (prev.kind === 'user' && m.kind === 'user') {
        byKey.set(key, {
          kind: 'user',
          userId: m.userId,
          name: m.name || prev.name,
          email: m.email || prev.email,
        });
      }
    }
  }
  return [...byKey.values()];
}

function textHasMention(text: string, m: ChatMention): boolean {
  if (text.includes(serializeMentionToken(m))) return true;
  const plain = `@${m.name}`;
  if (!text.includes(plain)) return false;
  // Avoid treating `@[Name](…)` as a plain `@Name` hit on the label alone.
  let from = 0;
  while (from < text.length) {
    const at = text.indexOf(plain, from);
    if (at < 0) return false;
    const after = text.slice(at + plain.length);
    // Plain `@Name` is followed by end, whitespace, or punctuation — not `](`.
    if (!after.startsWith('](')) return true;
    from = at + plain.length;
  }
  return false;
}

/** Keep mentions whose plain @Name or durable token still appears in the message. */
export function mentionsPresentInText(mentions: ChatMention[], text: string): ChatMention[] {
  if (!mentions.length || !text) return [];
  return mentions.filter((m) => textHasMention(text, m));
}

/**
 * Rewrite plain `@Name` picks into durable `@[Name](contact:uid)` tokens so the
 * UUID rides along in the message body (and survives if the side-channel is lost).
 */
export function embedMentionTokens(text: string, mentions: ChatMention[]): string {
  if (!text || !mentions.length) return text;
  const sorted = [...mentions].sort((a, b) => b.name.length - a.name.length);
  let result = text;
  for (const m of sorted) {
    const token = serializeMentionToken(m);
    if (result.includes(token)) continue;
    const plain = `@${m.name}`;
    let out = '';
    let from = 0;
    while (from < result.length) {
      const at = result.indexOf(plain, from);
      if (at < 0) {
        out += result.slice(from);
        break;
      }
      out += result.slice(from, at);
      const afterStart = at + plain.length;
      const after = result.slice(afterStart);
      if (after.startsWith('](')) {
        // Already inside / part of a token label — leave it.
        out += plain;
        from = afterStart;
        continue;
      }
      out += token;
      from = afterStart;
    }
    result = out;
  }
  return result;
}

/** Collapse durable tokens to `@Name` for UI / copy. */
export function stripMentionTokensForDisplay(text: string): string {
  if (!text || !text.includes('](')) return text;
  return text.replace(MENTION_TOKEN_RE, '@$1');
}

/** One-line context for the agent system prompt. */
export function formatMentionsContextLine(mentions: ChatMention[]): string | null {
  if (!mentions.length) return null;
  const parts = mentions.map((m) => {
    if (m.kind === 'contact') {
      const extras = [m.email, m.company].filter(Boolean).join(', ');
      return extras
        ? `${m.name} (contact uid=${m.uid}; ${extras})`
        : `${m.name} (contact uid=${m.uid})`;
    }
    const extras = m.email ? `; ${m.email}` : '';
    return `${m.name} (user id=${m.userId}${extras})`;
  });
  return (
    `User @-mentioned: ${parts.join('; ')}. ` +
    'Prefer these exact ids over fuzzy resolve_contact when acting on the mentioned people. ' +
    'Contact mentions use contact_uid; team mentions use Clerk user id (not a contact uid).'
  );
}

/** Display name for a Clerk-like user record. */
export function clerkUserDisplayName(user: {
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
  emailAddresses?: Array<{ emailAddress?: string | null }> | null;
}): string {
  const full = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  if (full) return full;
  if (user.username?.trim()) return user.username.trim();
  const email = user.emailAddresses?.[0]?.emailAddress?.trim();
  if (email) return email.split('@')[0] || email;
  return 'Team member';
}

export type ActiveMentionQuery = {
  /** Index where the replaceable token starts (`@` for explicit, first query char for soft). */
  start: number;
  query: string;
  /** True when the picker opened from to/from/for after an action verb (no `@` typed). */
  soft?: boolean;
};

/** Active `@query` token ending at caret (token-scoped, not whole-string). */
export function activeMentionAt(text: string, caret: number): ActiveMentionQuery | null {
  const before = text.slice(0, Math.max(0, Math.min(caret, text.length)));
  const match = before.match(/(?:^|[\s\n])@([^\s@]*)$/);
  if (!match) return null;
  const start = before.lastIndexOf('@');
  if (start < 0) return null;
  return { start, query: match[1] ?? '', soft: false };
}

/**
 * Action verbs that commonly introduce a person/company recipient.
 * Used with to/from/for so "send contract to The" opens mentions without `@`.
 */
const SOFT_MENTION_VERBS =
  /\b(send|bill|text|email|invoice|pay|payment|add|apply|message|forward|remind|schedule)\b/i;

/** Preposition + name fragment at the caret (single token — still typing the name). */
const SOFT_MENTION_TAIL = /\b(to|from|for)\s+([A-Za-z][A-Za-z0-9'’.|-]*)$/i;

/**
 * Fragments that are almost never a contact search after to/from/for.
 * Intentionally omits "the" — many CRM names start with "The …".
 */
const SOFT_MENTION_QUERY_STOPWORDS = new Set([
  'a',
  'an',
  'my',
  'our',
  'your',
  'this',
  'that',
  'me',
  'us',
  'them',
  'him',
  'her',
  'it',
  'all',
  'each',
  'every',
  'approval',
  'review',
  'signing',
  'signature',
  'everyone',
  'someone',
  'anyone',
  'today',
  'tomorrow',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
]);

/**
 * Soft mention: after send/bill/… + to/from/for, treat the name fragment as a
 * people search even when the user has not typed `@`.
 *
 * Example: "send contract to The" → query "The".
 */
export function activeSoftMentionAt(text: string, caret: number): ActiveMentionQuery | null {
  const before = text.slice(0, Math.max(0, Math.min(caret, text.length)));
  if (!before || before.startsWith('/')) return null;
  // Explicit @ token owns the caret.
  if (/(?:^|[\s\n])@[^\s@]*$/.test(before)) return null;
  if (!SOFT_MENTION_VERBS.test(before)) return null;

  const match = before.match(SOFT_MENTION_TAIL);
  if (!match) return null;

  const query = match[2] ?? '';
  if (query.length < 2) return null;
  if (/^\d+$/.test(query)) return null;
  if (SOFT_MENTION_QUERY_STOPWORDS.has(query.toLowerCase())) return null;

  const start = before.length - query.length;
  if (start < 0) return null;
  return { start, query, soft: true };
}

/** Prefer an explicit `@` token; otherwise a soft to/from/for name fragment. */
export function activeMentionQueryAt(text: string, caret: number): ActiveMentionQuery | null {
  return activeMentionAt(text, caret) ?? activeSoftMentionAt(text, caret);
}
