import type { APIContext } from "astro";
import { clerkClient } from "@clerk/astro/server";
import { requireDashboardUser } from '../../../lib/dashboardAuth';
import { getCompanyConfig } from '../../../lib/companyConfig';
import { hasFeature } from '../../../lib/features';
import {
  parseEmailSignaturePrefs,
  emailSignaturePrefsToMetadata,
  renderEmailSignature,
  type EmailSignaturePerson,
} from '../../../lib/emailSignature';

export const prerender = false;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function asMeta(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
}

function boolFromBody(raw: unknown, fallback: boolean): boolean {
  if (raw == null || raw === '') return fallback;
  if (typeof raw === 'boolean') return raw;
  const s = String(raw).trim().toLowerCase();
  if (s === '0' || s === 'false' || s === 'no' || s === 'off') return false;
  if (s === '1' || s === 'true' || s === 'yes' || s === 'on') return true;
  return fallback;
}

function profilePayload(user: {
  firstName?: string | null;
  lastName?: string | null;
  emailAddresses?: Array<{ emailAddress?: string | null }> | null;
  publicMetadata?: unknown;
}) {
  const meta = asMeta(user.publicMetadata);
  const prefs = parseEmailSignaturePrefs(meta);
  return {
    firstName: user.firstName ?? "",
    lastName: user.lastName ?? "",
    email: user.emailAddresses?.[0]?.emailAddress ?? "",
    phone: String(meta.phone ?? ""),
    timezone: String(meta.timezone ?? ""),
    address: String(meta.address ?? ""),
    jobTitle: prefs.jobTitle,
    signatureEnabled: prefs.enabled,
    signatureIncludeLogo: prefs.includeLogo,
  };
}

async function signaturePayload(profile: ReturnType<typeof profilePayload>) {
  if (!hasFeature('email_signature')) return null;
  const company = await getCompanyConfig();
  const person: EmailSignaturePerson = {
    name: [profile.firstName, profile.lastName].filter(Boolean).join(' ').trim(),
    email: profile.email,
    phone: profile.phone,
    jobTitle: profile.jobTitle,
    includeLogo: profile.signatureIncludeLogo,
    enabled: profile.signatureEnabled,
  };
  const rendered = renderEmailSignature({ person, company });
  return {
    enabled: person.enabled,
    includeLogo: person.includeLogo,
    jobTitle: person.jobTitle,
    html: rendered.html,
    text: rendered.text,
    logoUrl: rendered.logoUrl,
    companyName: rendered.companyName,
    brandPrimary: company.brandPrimary || '#c026d3',
    website: rendered.website,
    publicUrl: rendered.publicUrl,
  };
}

export async function GET(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  const { userId } = auth;

  try {
    const client = clerkClient(context);
    const user = await client.users.getUser(userId);
    const profile = profilePayload(user);
    return json({
      ok: true,
      profile,
      signature: await signaturePayload(profile),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return json({ error: message }, 500);
  }
}

export async function POST(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  const { userId } = auth;

  let body: Record<string, unknown>;
  try {
    body = await context.request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const firstName = typeof body.firstName === 'string' ? body.firstName : undefined;
  const lastName = typeof body.lastName === 'string' ? body.lastName : undefined;
  const phone = typeof body.phone === 'string' ? body.phone : undefined;
  const timezone = typeof body.timezone === 'string' ? body.timezone : undefined;
  const address = typeof body.address === 'string' ? body.address : undefined;
  const jobTitle = typeof body.jobTitle === 'string' ? body.jobTitle : undefined;

  try {
    const client = clerkClient(context);
    const user = await client.users.getUser(userId);
    const existing = asMeta(user.publicMetadata);
    const currentPrefs = parseEmailSignaturePrefs(existing);
    const nextPrefs = emailSignaturePrefsToMetadata({
      jobTitle: jobTitle ?? currentPrefs.jobTitle,
      enabled: boolFromBody(body.signatureEnabled, currentPrefs.enabled),
      includeLogo: boolFromBody(body.signatureIncludeLogo, currentPrefs.includeLogo),
    });

    await client.users.updateUser(userId, {
      firstName: firstName ?? undefined,
      lastName: lastName ?? undefined,
      publicMetadata: {
        ...existing,
        phone: phone ?? existing.phone ?? "",
        timezone: timezone ?? existing.timezone ?? "",
        address: address ?? existing.address ?? "",
        ...nextPrefs,
      },
    });

    const profile = profilePayload({
      firstName: firstName ?? user.firstName,
      lastName: lastName ?? user.lastName,
      emailAddresses: user.emailAddresses,
      publicMetadata: {
        ...existing,
        phone: phone ?? existing.phone ?? "",
        timezone: timezone ?? existing.timezone ?? "",
        address: address ?? existing.address ?? "",
        ...nextPrefs,
      },
    });

    return new Response(JSON.stringify({
      ok: true,
      profile,
      signature: await signaturePayload(profile),
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
