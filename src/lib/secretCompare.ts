/**
 * Timing-safe secret comparison helpers.
 *
 * Uses Node's `crypto.timingSafeEqual` to prevent timing-based side-channel
 * attacks when comparing API keys, webhook secrets, or other sensitive tokens.
 *
 * Always compare full-length buffers — padding both sides to the same length
 * before comparing prevents length-leaking attacks.
 */

import { timingSafeEqual, createHash } from 'crypto';

/**
 * Compare two strings in constant time.
 *
 * Pads both to the same byte length before calling `timingSafeEqual` so the
 * comparison time does not leak the length of either value.
 *
 * @returns `true` only when both strings are byte-for-byte identical.
 */
export function safeCompare(a: string, b: string): boolean {
  // Hash both sides to a fixed 32-byte digest so timingSafeEqual always sees
  // equal-length buffers regardless of input length.
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

/**
 * Verify an incoming key against an expected value from env/config.
 * Returns `false` (not throws) when either argument is missing/empty so
 * callers can treat it as a simple boolean gate.
 */
export function verifySecret(incoming: string | null | undefined, expected: string | null | undefined): boolean {
  if (!incoming || !expected) return false;
  return safeCompare(incoming, expected);
}

/** Alias used across webhook/auth routes — trims whitespace before comparing. */
export function secretMatches(provided: string | null | undefined, expected: string | null | undefined): boolean {
  const a = typeof provided === 'string' ? provided.trim() : provided;
  const b = typeof expected === 'string' ? expected.trim() : expected;
  return verifySecret(a, b);
}
