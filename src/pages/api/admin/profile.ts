import type { APIContext } from "astro";
import { clerkClient } from "@clerk/astro/server";

export const prerender = false;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function GET(context: APIContext): Promise<Response> {
  const { userId } = context.locals.auth();
  if (!userId) return json({ error: "Unauthorized" }, 401);

  try {
    const client = clerkClient(context);
    const user = await client.users.getUser(userId);
    const meta = (user.publicMetadata ?? {}) as Record<string, string>;
    return json({
      ok: true,
      profile: {
        firstName: user.firstName ?? "",
        lastName: user.lastName ?? "",
        email: user.emailAddresses?.[0]?.emailAddress ?? "",
        phone: meta.phone ?? "",
        timezone: meta.timezone ?? "",
        address: meta.address ?? "",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return json({ error: message }, 500);
  }
}

export async function POST(context: APIContext): Promise<Response> {
  const { userId } = context.locals.auth();

  if (!userId) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: Record<string, string>;
  try {
    body = await context.request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { firstName, lastName, phone, timezone, address } = body;

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
