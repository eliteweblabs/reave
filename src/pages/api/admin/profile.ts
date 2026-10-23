import type { APIContext } from "astro";
import { clerkClient } from "@clerk/astro/server";
import { requireDashboardUser } from '../../../lib/dashboardAuth';
import {
  isHtmlSignature,
  sanitizeSignatureHtml,
} from '../../../lib/userEmailSignature';
import { parseFormBool, parseMetaBool } from '../../../lib/metaBool';
import { jsonResponse } from '../../../lib/apiResponse';
import { ensureFeatureOverridesLoaded, hasEmailInbox } from '../../../lib/features';

export const prerender = false;


export async function GET(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  const { userId } = auth;

  try {
    await ensureFeatureOverridesLoaded();
    const inboxOn = hasEmailInbox();
    const client = clerkClient(context);
    const user = await client.users.getUser(userId);
    const meta = (user.publicMetadata ?? {}) as Record<string, string>;
    return jsonResponse({
      ok: true,
      profile: {
        firstName: user.firstName ?? "",
        lastName: user.lastName ?? "",
        email: user.emailAddresses?.[0]?.emailAddress ?? "",
        phone: meta.phone ?? "",
        cardPhoneMobile: parseMetaBool(meta.cardPhoneMobile, true),
        timezone: meta.timezone ?? "",
        address: meta.address ?? "",
        ...(inboxOn ? { emailSignature: meta.emailSignature ?? "" } : {}),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return jsonResponse({ error: message }, 500);
  }
}

export async function POST(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  const { userId } = auth;

  let body: Record<string, string>;
  try {
    body = await context.request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { firstName, lastName, phone, timezone, address, emailSignature } = body;
  const cardPhoneMobile =
    'cardPhoneMobile' in body ? parseFormBool(body.cardPhoneMobile) : undefined;

  try {
    await ensureFeatureOverridesLoaded();
    const inboxOn = hasEmailInbox();
    const client = clerkClient(context);
    const user = await client.users.getUser(userId);
    const existing = (user.publicMetadata ?? {}) as Record<string, string>;

    let signatureStored: string | undefined;
    if (inboxOn && emailSignature !== undefined) {
      const signatureRaw = emailSignature ?? '';
      signatureStored =
        signatureRaw && isHtmlSignature(signatureRaw)
          ? sanitizeSignatureHtml(signatureRaw)
          : signatureRaw;
    }

    await client.users.updateUser(userId, {
      firstName: firstName ?? undefined,
      lastName: lastName ?? undefined,
      publicMetadata: {
        ...existing,
        phone: phone ?? "",
        ...(cardPhoneMobile !== undefined ? { cardPhoneMobile } : {}),
        timezone: timezone ?? "",
        address: address ?? "",
        ...(signatureStored !== undefined ? { emailSignature: signatureStored } : {}),
      },
    });

    return new Response(JSON.stringify({ ok: true }), {
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
