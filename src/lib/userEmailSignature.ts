/**
 * Per-user outgoing email signature — stored on Clerk publicMetadata
 * (Admin → Profile), not company settings.
 */
import type { APIContext } from 'astro';
import { clerkClient } from '@clerk/astro/server';
import { clerkSecretKey } from './clerkClient';
import { escHtml } from './escHtml';

async function fetchClerkUserPublicMetadata(userId: string): Promise<Record<string, string>> {
  const secretKey = clerkSecretKey();
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

export function isHtmlSignature(signature: string): boolean {
  return /<[a-z][\s\S]*>/i.test(signature.trim());
}

/** Strip scripts and inline handlers from admin-authored signature HTML. */
export function sanitizeSignatureHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<\/?(?:iframe|object|embed|form|meta|link|base|svg|math)[\s>]/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s(href|src)\s*=\s*["']\s*(javascript|vbscript|data):[^"']*["']/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/vbscript:/gi, '')
    .trim();
}

export function signatureToPlainText(signature: string): string {
  const trimmed = signature.trim();
  if (!trimmed) return '';
  if (!isHtmlSignature(trimmed)) return trimmed;
  return trimmed
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr)>/gi, '\n')
    .replace(/<img[^>]*alt=["']([^"']*)["'][^>]*>/gi, (_, alt) => (alt ? `[${alt}]` : '[Logo]'))
    .replace(/<img[^>]*>/gi, '[Logo]')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function signatureHtmlForEmail(signature: string): string {
  const trimmed = signature.trim();
  if (!trimmed) return '';
  if (isHtmlSignature(trimmed)) return sanitizeSignatureHtml(trimmed);
  return signatureToHtml(trimmed);
}

export function signatureToHtml(signature: string): string {
  return signature
    .split('\n')
    .map((line) => escHtml(line.trimEnd()))
    .join('<br />');
}

export function appendSignatureToPlainText(body: string, signature: string): string {
  const sig = signatureToPlainText(signature);
  if (!sig) return body;
  const trimmed = body.trimEnd();
  if (trimmed.endsWith(sig)) return body;
  return `${trimmed}\n\n${sig}`;
}

export function appendSignatureToHtmlFragment(html: string, signature: string): string {
  const sigHtml = signatureHtmlForEmail(signature);
  if (!sigHtml) return html;
  const block =
    `<div style="margin-top:24px;color:#444444;font-size:14px;line-height:1.55;font-family:Arial,Helvetica,sans-serif">${sigHtml}</div>`;
  return `${html}${block}`;
}
