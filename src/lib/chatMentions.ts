/**
 * Structured @-mentions from agent chat — contacts (clients) and Clerk team users.
 * Sent with the chat POST so the agent gets stable ids instead of fuzzy name resolve.
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

export type PeopleSearchContact = ChatContactMention & {
  phone?: string;
};

export type PeopleSearchUser = ChatUserMention & {
  username?: string;
};

export type PeopleSearchResult = PeopleSearchContact | PeopleSearchUser;

function optionalTrimmed(value: unknown): string | undefined {
  if (value == null) return undefined;
  const s = String(value).trim();
  return s || undefined;
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
    const name = optionalTrimmed(rec.name) || 'Unknown';

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

/** Keep mentions whose @DisplayName token still appears in the composed message. */
export function mentionsPresentInText(mentions: ChatMention[], text: string): ChatMention[] {
  if (!mentions.length || !text) return [];
  return mentions.filter((m) => {
    const token = `@${m.name}`;
    return text.includes(token);
  });
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
