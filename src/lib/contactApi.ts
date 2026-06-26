const BASE = import.meta.env.CONTACT_API_BASE_URL;
const KEY = import.meta.env.CONTACT_API_KEY;

function headers() {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (KEY) h["X-API-Key"] = KEY;
  return h;
}

export async function resolveContact(
  name?: string,
  email?: string,
  phone?: string
) {
  const res = await fetch(`${BASE}/api/contacts/resolve`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ name, email, phone }),
  });
  return res.json();
}

export async function listContacts(q?: string, limit = 50) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  params.set("limit", String(limit));
  const res = await fetch(`${BASE}/api/contacts?${params}`, {
    headers: headers(),
  });
  return res.json();
}

export async function createContact(data: {
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  notes?: string;
}) {
  const res = await fetch(`${BASE}/api/contacts`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function deleteContact(uid: string) {
  const res = await fetch(`${BASE}/api/contacts/${uid}`, {
    method: "DELETE",
    headers: headers(),
  });
  if (res.status === 204) return { ok: true };
  return res.json().catch(() => ({ ok: res.ok }));
}
