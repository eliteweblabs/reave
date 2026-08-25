import type { APIContext } from "astro";
import { clerkClient } from "@clerk/astro/server";
import { requireDashboardUser } from '../../../lib/dashboardAuth';
import { jsonResponse, readJsonBody } from '../../../lib/apiResponse';
import { isHtmlSignature, sanitizeSignatureHtml } from '../../../lib/userEmailSignature';

export const prerender = false;

export async function GET(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  const { userId } = auth;

  try {
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
        timezone: meta.timezone ?? "",
        address: meta.address ?? "",
        emailSignature: meta.emailSignature ?? "",
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

  const parsed = await readJsonBody(context.request);
  if (parsed instanceof Response) return parsed;
  const body = parsed.body as Record<string, string>;

  const { firstName, lastName, phone, timezone, address, emailSignature } = body;
  const rawSignature = emailSignature ?? "";
  const safeSignature =
    rawSignature && isHtmlSignature(rawSignature)
      ? sanitizeSignatureHtml(rawSignature)
      : rawSignature;

  try {
    const client = clerkClient(context);
    const user = await client.users.getUser(userId);
    const existing = (user.publicMetadata ?? {}) as Record<string, string>;

    await client.users.updateUser(userId, {
      firstName: firstName ?? undefined,
      lastName: lastName ?? undefined,
      publicMetadata: {
        ...existing,
        phone: phone ?? "",
        timezone: timezone ?? "",
        address: address ?? "",
        emailSignature: safeSignature,
      },
    });

    return jsonResponse({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return jsonResponse({ error: message }, 500);
  }
}
