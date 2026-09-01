/**
 * Shared Cloudflare zone + registrar nameserver provisioning for deploy Apply and go-live.
 */
import {
  cloudflareCreateZone,
  cloudflareFindZone,
  cloudflareGetZone,
  cloudflareZoneName,
} from './cloudflareClient';
import {
  namecomPing,
  namecomSetNameservers,
  resolveNamecomCredentials,
  type NamecomCredentials,
} from './namecomClient';

export type ClientCloudflareZone = {
  zoneId: string;
  zoneName: string;
  nameservers: string[];
  created: boolean;
};

export async function ensureClientCloudflareZone(
  domain: string,
): Promise<{ ok: true; data: ClientCloudflareZone } | { ok: false; error: string }> {
  const apex = cloudflareZoneName(domain);
  const existing = await cloudflareFindZone(apex);
  if (existing.ok) {
    const detail = await cloudflareGetZone(existing.data.id);
    return {
      ok: true,
      data: {
        zoneId: existing.data.id,
        zoneName: existing.data.name,
        nameservers: detail.ok ? detail.data.name_servers ?? [] : [],
        created: false,
      },
    };
  }

  const created = await cloudflareCreateZone(apex, { jump_start: true });
  if (!created.ok) return created;
  return {
    ok: true,
    data: {
      zoneId: created.data.id,
      zoneName: created.data.name,
      nameservers: created.data.name_servers ?? [],
      created: true,
    },
  };
}

export async function provisionNamecomNameservers(opts: {
  domain: string;
  nameservers: string[];
  username?: string;
  token?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const creds: NamecomCredentials | null = resolveNamecomCredentials({
    username: opts.username,
    token: opts.token,
  });
  if (!creds) return { ok: false, error: 'Name.com username and API token are required' };
  const ping = await namecomPing(creds);
  if (!ping.ok) return { ok: false, error: `Name.com: ${ping.error}` };
  if (!opts.nameservers.length) {
    return { ok: false, error: 'Cloudflare zone has no nameservers to assign' };
  }
  const ns = await namecomSetNameservers(opts.domain, opts.nameservers, creds);
  if (!ns.ok) return { ok: false, error: `Name.com: ${ns.error}` };
  return { ok: true };
}
