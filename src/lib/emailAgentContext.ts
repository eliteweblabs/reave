import type { EmailInboxRecord } from './emailInboxStore';

function joinAddrs(addrs: string[] | undefined): string | null {
  if (!addrs?.length) return null;
  return addrs.join(', ');
}

/** Full email + headers formatted for the agent (not a recap prompt). */
export function formatEmailForAgent(email: EmailInboxRecord): string {
  const lines = [
    `Message ID: ${email.id}`,
    `From: ${email.from || '(unknown)'}`,
  ];
  const to = joinAddrs(email.to);
  if (to) lines.push(`To: ${to}`);
  const cc = joinAddrs(email.cc);
  if (cc) lines.push(`Cc: ${cc}`);
  const bcc = joinAddrs(email.bcc);
  if (bcc) lines.push(`Bcc: ${bcc}`);
  const replyTo = joinAddrs(email.replyTo);
  if (replyTo) lines.push(`Reply-To: ${replyTo}`);
  if (email.messageId) lines.push(`Message-ID: ${email.messageId}`);
  lines.push(`Subject: ${email.subject || '(no subject)'}`);
  lines.push(`Received: ${email.receivedAt}`);
  if (email.category) lines.push(`Category: ${email.category}`);
  if (email.routeNote) lines.push(`Route: ${email.routeNote}`);
  if (email.summary?.trim()) {
    lines.push('', 'Summary:', email.summary.trim());
  }
  if (email.headers && Object.keys(email.headers).length > 0) {
    lines.push('', 'Headers:');
    for (const [key, value] of Object.entries(email.headers)) {
      lines.push(`${key}: ${value}`);
    }
  }
  const body = email.bodyText?.trim() || email.bodySnippet?.trim();
  if (body) {
    lines.push('', 'Body:', body);
  }
  return lines.join('\n');
}
