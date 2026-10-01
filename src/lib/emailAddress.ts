function trailingAngleAddr(from: string): { email: string; prefix: string } | null {
  const raw = from.trim();
  const lastGt = raw.lastIndexOf('>');
  if (lastGt <= 0) return null;
  const lastLt = raw.lastIndexOf('<', lastGt);
  if (lastLt < 0) return null;
  const email = raw.slice(lastLt + 1, lastGt).trim();
  if (!email.includes('@')) return null;
  const prefix = raw.slice(0, lastLt).trim();
  return { email, prefix };
}

function unquoteDisplayName(prefix: string): string {
  const p = prefix.trim();
  if (p.length >= 2 && p.startsWith('"') && p.endsWith('"')) {
    return p.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
  return p.replace(/^['"]|['"]$/g, '');
}

/** Extract bare email from RFC-style From headers. */
export function parseSenderEmail(from: string): string {
  const raw = from.trim();
  const trailing = trailingAngleAddr(raw);
  if (trailing?.email.includes('@')) return trailing.email.toLowerCase();
  if (/^[^\s@]+@[^\s@]+$/.test(raw)) return raw.toLowerCase();
  return raw.toLowerCase();
}

/** Display name from RFC-style From headers, or empty when only an address. */
export function parseSenderName(from: string): string {
  const raw = from.trim();
  const trailing = trailingAngleAddr(raw);
  if (trailing?.prefix) return unquoteDisplayName(trailing.prefix);
  if (/^[^\s@]+@[^\s@]+$/.test(raw)) return '';
  return raw.includes('@') ? '' : raw;
}

/**
 * Resend rejects display names that contain literal &lt; or &gt; even when RFC-quoted.
 * Fold the official re&gt;I&lt;o mark to reΛve and strip any remaining angle brackets.
 */
export function resendSafeDisplayName(displayName: string): string {
  let name = displayName.trim();
  if (!name) return name;
  name = name.replace(/re\s*>\s*I\s*<\s*o/gi, 'reΛve');
  name = name.replace(/[<>]/g, '');
  return name.replace(/\s+/g, ' ').trim();
}

/** Build a Resend-safe RFC 5322 From (quote names that contain quotes or commas). */
export function formatSenderEmail(displayName: string, email: string): string {
  const addr = email.trim();
  const name = resendSafeDisplayName(displayName);
  if (!addr.includes('@')) return name || addr;
  if (!name) return addr;
  if (/["\\]/.test(name) || /[,;]/.test(name)) {
    const escaped = name.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return `"${escaped}" <${addr}>`;
  }
  return `${name} <${addr}>`;
}

/** Re-format a From header so display names with &lt; &gt; do not break Resend. */
export function normalizeResendFromHeader(from: string): string {
  const raw = from.trim();
  if (!raw) return raw;
  const email = parseSenderEmail(raw);
  if (!email.includes('@')) return raw;
  const name = parseSenderName(raw);
  if (!name) return email;
  return formatSenderEmail(name, email);
}
