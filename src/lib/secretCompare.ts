import { timingSafeEqual } from 'crypto';

/** Constant-time string compare for secrets, API keys, and webhook ingress keys. */
export function secretMatches(provided: string | null | undefined, expected: string | null | undefined): boolean {
  const a = (provided ?? '').trim();
  const b = (expected ?? '').trim();
  if (!a || !b) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
