import { serverEnv } from './serverEnv';
import { parseSenderEmail } from './emailAddress';

function parseList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function senderDomain(from: string): string {
  const at = from.lastIndexOf('@');
  return at >= 0 ? from.slice(at + 1).toLowerCase() : '';
}

/** If neither allowlist env is set, all senders pass. */
export function isAllowedSender(from: string): boolean {
  const senders = parseList(serverEnv('EMAIL_ALLOWED_SENDERS'));
  const domains = parseList(serverEnv('EMAIL_ALLOWED_DOMAINS'));
  if (senders.length === 0 && domains.length === 0) return true;
  const addr = parseSenderEmail(from);
  if (senders.includes(addr)) return true;
  return domains.includes(senderDomain(addr));
}
