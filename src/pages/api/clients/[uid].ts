import type { APIRoute } from "astro";

const CONTACT_API_BASE_URL = import.meta.env.CONTACT_API_BASE_URL;
const CONTACT_API_KEY = import.meta.env.CONTACT_API_KEY;

function contactHeaders() {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (CONTACT_API_KEY) h["X-API-Key"] = CONTACT_API_KEY;
  return h;
}

export const GET: APIRoute = async ({ params }) => {
  const { uid } = params;
  const res = await fetch(`${CONTACT_API_BASE_URL}/api/contacts/${uid}`, {
    headers: contactHeaders(),
  });
  const data = await res.json();
  return new Response(JSON.stringify(data), {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
};

export const PUT: APIRoute = async ({ params, request }) => {
  const { uid } = params;
  const body = await request.json();
  const res = await fetch(`${CONTACT_API_BASE_URL}/api/contacts/${uid}`, {
    method: "PUT",
    headers: contactHeaders(),
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return new Response(JSON.stringify(data), {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
};

export const DELETE: APIRoute = async ({ params }) => {
  const { uid } = params;
  const res = await fetch(`${CONTACT_API_BASE_URL}/api/contacts/${uid}`, {
    method: "DELETE",
    headers: contactHeaders(),
  });

  // contact-api may return 204 No Content on success
  if (res.status === 204 || res.status === 200) {
    const body = res.status === 204 ? { ok: true } : await res.json();
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const data = await res.json().catch(() => ({ error: "Unknown error" }));
  return new Response(JSON.stringify(data), {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
};
