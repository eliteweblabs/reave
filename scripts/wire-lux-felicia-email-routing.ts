/**
 * Route felicia@lux.cleaning → inbox@inbound.lux.cleaning via Cloudflare Email Routing
 * (Resend account is at domain limit — cannot add apex lux.cleaning as a second domain).
 *
 * Run: set -a && source .env && set +a && npx tsx scripts/wire-lux-felicia-email-routing.ts
 */
import { cloudflareFindZone } from '../src/lib/cloudflareClient.ts';
import { serverEnv } from '../src/lib/serverEnv.ts';

const CF_API = 'https://api.cloudflare.com/client/v4';

async function cfFetch<T>(path: string, init?: RequestInit): Promise<
  { ok: true; data: T } | { ok: false; error: string }
> {
  const apiToken = serverEnv('CLOUDFLARE_API_TOKEN')?.trim();
  if (!apiToken) return { ok: false, error: 'CLOUDFLARE_API_TOKEN is not set' };
  const res = await fetch(`${CF_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  const raw = await res.text();
  let body: { success?: boolean; errors?: { message: string }[]; result?: T };
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return { ok: false, error: 'Invalid JSON from Cloudflare' };
  }
  if (!res.ok || body.success === false) {
    const msg = body.errors?.map((e) => e.message).join('; ') || `HTTP ${res.status}`;
    return { ok: false, error: msg };
  }
  return { ok: true, data: body.result as T };
}

const APEX = 'lux.cleaning';
const FROM = 'felicia@lux.cleaning';
const TO = 'inbox@inbound.lux.cleaning';

async function main() {
  const zone = await cloudflareFindZone(APEX);
  if (!zone.ok) throw new Error(zone.error);

  const enable = await cfFetch<{ id?: string; enabled?: boolean; name?: string }>(
    `/zones/${zone.data.id}/email/routing/enable`,
    { method: 'POST' },
  );
  if (!enable.ok) throw new Error(`enable routing: ${enable.error}`);
  console.log('[lux-routing] ✓ Email Routing enabled on zone', zone.data.name);

  const accounts = await cfFetch<{ id: string; name: string }[]>('/accounts?per_page=5');
  if (!accounts.ok || !accounts.data?.length) throw new Error('Could not list Cloudflare account');
  const accountId = accounts.data[0]!.id;

  type Dest = { id: string; email: string; verified?: string; created?: string };
  const listed = await cfFetch<Dest[]>(
    `/accounts/${accountId}/email/routing/addresses`,
  );
  if (!listed.ok) throw new Error(`list destinations: ${listed.error}`);

  let dest = (listed.data ?? []).find((d) => d.email.toLowerCase() === TO.toLowerCase());
  if (!dest) {
    const created = await cfFetch<Dest>(`/accounts/${accountId}/email/routing/addresses`, {
      method: 'POST',
      body: JSON.stringify({ email: TO }),
    });
    if (!created.ok) throw new Error(`create destination ${TO}: ${created.error}`);
    dest = created.data;
    console.log(`[lux-routing] ✓ Added destination ${TO} (verify via email Cloudflare sent to that inbox)`);
  } else {
    console.log(`[lux-routing] ✓ Destination ${TO} already exists (${dest.verified ?? 'unknown'})`);
  }

  type Rule = { id: string; matchers?: { value?: string }[] };
  const rules = await cfFetch<Rule[]>(`/zones/${zone.data.id}/email/routing/rules`);
  if (!rules.ok) throw new Error(`list rules: ${rules.error}`);
  const existing = (rules.data ?? []).find((r) =>
    r.matchers?.some((m) => m.value?.toLowerCase() === FROM.toLowerCase()),
  );
  if (existing) {
    console.log(`[lux-routing] ✓ Rule for ${FROM} already exists (${existing.id})`);
    return;
  }

  const rule = await cfFetch<Rule>(`/zones/${zone.data.id}/email/routing/rules`, {
    method: 'POST',
    body: JSON.stringify({
      name: 'Felicia → REΛVE Resend inbound',
      enabled: true,
      matchers: [{ type: 'literal', field: 'to', value: FROM }],
      actions: [{ type: 'forward', value: [TO] }],
    }),
  });
  if (!rule.ok) throw new Error(`create rule: ${rule.error}`);
  console.log(`[lux-routing] ✓ ${FROM} → ${TO}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
