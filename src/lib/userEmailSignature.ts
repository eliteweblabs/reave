/**
 * Per-user outgoing email signature — stored on Clerk publicMetadata
 * (Admin → Profile), not company settings.
 */
import type { APIContext } from 'astro';
import { clerkClient } from '@clerk/astro/server';
import { serverEnv } from './serverEnv';

function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function fetchClerkUserPublicMetadata(userId: string): Promise<Record<string, string>> {
  const secretKey = serverEnv('CLERK_SECRET_KEY') || serverEnv('CLERK_BACKEND_API_KEY');
  if (!secretKey) return {};
  try {
    const res = await fetch(`https://api.clerk.com/v1/users/${encodeURIComponent(userId)}`, {
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
      },
    });
    if (!res.ok) return {};
    const data = (await res.json()) as Record<string, unknown>;
    return ((data.public_metadata ?? {}) as Record<string, string>) || {};
  } catch {
    return {};
  }
}

/** Plain-text signature saved on the signed-in user's Clerk profile. */
export async function getUserEmailSignature(
  userId: string | null | undefined,
  context?: APIContext,
): Promise<string> {
  const id = userId?.trim();
  if (!id) return '';
  try {
    if (context) {
      const user = await clerkClient(context).users.getUser(id);
      const meta = (user.publicMetadata ?? {}) as Record<string, string>;
      return (meta.emailSignature ?? '').trim();
    }
    const meta = await fetchClerkUserPublicMetadata(id);
    return (meta.emailSignature ?? '').trim();
  } catch {
    return '';
  }
}

export function signatureToHtml(signature: string): string {
  return signature
    .split('\n')
    .map((line) => escHtml(line.trimEnd()))
    .join('<br />');
}

export function appendSignatureToPlainText(body: string, signature: string): string {
  const sig = signature.trim();
  if (!sig) return body;
  const trimmed = body.trimEnd();
  if (trimmed.endsWith(sig)) return body;
  return `${trimmed}\n\n${sig}`;
}

export function appendSignatureToHtmlFragment(html: string, signature: string): string {
  const sig = signature.trim();
  if (!sig) return html;
  const block =
    `<div style="margin-top:24px;color:#444444;font-size:14px;line-height:1.55;font-family:Arial,Helvetica,sans-serif">${signatureToHtml(sig)}</div>`;
  return `${html}${block}`;
}
