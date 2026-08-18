/**
 * Agent tools: gmail_dkim + google_workspace_domains
 *
 * gmail_dkim — Manage Google Workspace DKIM keys for a domain via the Gmail Admin API.
 * google_workspace_domains — List/inspect all domains on the Google Workspace account
 *   (primary, secondary, aliases) so the agent knows the domain type without asking the user.
 *
 * Requires:
 *   - GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET (existing Google OAuth)
 *   - Google account authorized with admin.directory.domain scope
 *   - CLOUDFLARE_API_TOKEN (for auto-publish action on gmail_dkim)
 */
import {
  AnalyticsApiError,
  AnalyticsAuthError,
  analyticsFailedPayload,
  isGoogleWebmasterOAuthConfigured,
} from '../../src/lib/googleWebmasterAuth';
import {
  buildDkimTxtRecord,
  disableDkim,
  enableDkim,
  generateDkimKey,
  getDkimSettings,
} from '../../src/lib/googleWorkspaceDkimClient';
import {
  getWorkspaceDomain,
  listWorkspaceDomains,
} from '../../src/lib/googleWorkspaceDomainsClient';
import { cloudflareDnsManage } from '../../src/lib/cloudflareDnsManage';
import { isCloudflareConfigured } from '../../src/lib/cloudflareClient';
import type { AgentToolDef, AgentToolModule, ToolContext } from '../../src/lib/agentTools/types';

function catchAnalytics(e: unknown): string {
  if (e instanceof AnalyticsAuthError || e instanceof AnalyticsApiError) {
    return analyticsFailedPayload(e.message, {
      code: e instanceof AnalyticsAuthError ? e.code : e.code,
      status: e instanceof AnalyticsApiError ? e.status : null,
    });
  }
  return analyticsFailedPayload(e instanceof Error ? e.message : String(e));
}

// ─────────────────────────────────────────────────────────────────────────────
// gmail_dkim handler
// ─────────────────────────────────────────────────────────────────────────────

async function handle_gmail_dkim(
  args: Record<string, unknown>,
  _ctx: ToolContext,
): Promise<string> {
  const action = String(args.action ?? '').trim();
  const domain = String(args.domain ?? '').trim().toLowerCase();

  if (!domain) return JSON.stringify({ ok: false, error: 'domain is required' });

  try {
    // ── get_status ───────────────────────────────────────────────────────────
    if (action === 'get_status') {
      const settings = await getDkimSettings(domain);
      const txt = buildDkimTxtRecord(settings);
      return JSON.stringify({
        ok: true,
        domain,
        dkim_enabled: settings.dkimEnabled,
        selector: txt?.selector ?? settings.publicKeyTagName ?? null,
        dns_record_name: txt ? `${txt.name}.${domain}` : null,
        dns_record_value: txt?.value ?? null,
        public_key_present: Boolean(settings.rsa2048BitKey),
        updated_at: settings.dkimUpdatedTime,
      });
    }

    // ── generate_key ──────────────────────────────────────────────────────────
    if (action === 'generate_key') {
      const settings = await generateDkimKey(domain);
      const txt = buildDkimTxtRecord(settings);
      return JSON.stringify({
        ok: true,
        domain,
        message: 'DKIM key generated. Publish the DNS TXT record, then call action: enable_dkim.',
        selector: txt?.selector ?? null,
        dns_record_name: txt ? `${txt.name}.${domain}` : null,
        dns_record_value: txt?.value ?? null,
        dkim_enabled: settings.dkimEnabled,
      });
    }

    // ── publish_to_cloudflare ─────────────────────────────────────────────────
    if (action === 'publish_to_cloudflare') {
      if (!isCloudflareConfigured()) {
        return JSON.stringify({
          ok: false,
          error: 'CLOUDFLARE_API_TOKEN is not set — cannot auto-publish.',
        });
      }
      const settings = await getDkimSettings(domain);
      const txt = buildDkimTxtRecord(settings);
      if (!txt) {
        return JSON.stringify({
          ok: false,
          error: 'No DKIM public key found for this domain. Call generate_key first.',
        });
      }
      const result = await cloudflareDnsManage({
        action: 'upsert_record',
        domain,
        type: 'TXT',
        name: txt.name,
        content: txt.value,
      });
      if (!result.ok) {
        return JSON.stringify({ ok: false, error: (result as any).error });
      }
      return JSON.stringify({
        ok: true,
        domain,
        message: `DKIM TXT record published to Cloudflare for ${domain}.`,
        dns_record_name: `${txt.name}.${domain}`,
        dns_record_value: txt.value,
        cloudflare: result,
        next_step:
          'Wait for DNS propagation (usually 1–5 minutes on Cloudflare), ' +
          'then call action: enable_dkim to activate signing.',
      });
    }

    // ── enable_dkim ───────────────────────────────────────────────────────────
    if (action === 'enable_dkim') {
      const settings = await enableDkim(domain);
      return JSON.stringify({
        ok: true,
        domain,
        dkim_enabled: settings.dkimEnabled,
        message: settings.dkimEnabled
          ? `DKIM signing is now enabled for ${domain}.`
          : 'Google could not enable DKIM — the TXT record may not have propagated yet. Try again in a few minutes.',
      });
    }

    // ── disable_dkim ──────────────────────────────────────────────────────────
    if (action === 'disable_dkim') {
      const settings = await disableDkim(domain);
      return JSON.stringify({
        ok: true,
        domain,
        dkim_enabled: settings.dkimEnabled,
        message: `DKIM signing has been disabled for ${domain}.`,
      });
    }

    return JSON.stringify({ ok: false, error: `Unknown action: ${action}` });
  } catch (e) {
    return catchAnalytics(e);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// google_workspace_domains handler
// ─────────────────────────────────────────────────────────────────────────────

async function handle_google_workspace_domains(
  args: Record<string, unknown>,
  _ctx: ToolContext,
): Promise<string> {
  const action = String(args.action ?? 'list').trim();
  const domain = String(args.domain ?? '').trim().toLowerCase();

  try {
    if (action === 'list') {
      const resp = await listWorkspaceDomains();
      const domains = (resp.domains ?? []).map((d) => ({
        domain: d.domainName,
        type: d.isPrimary ? 'primary' : 'secondary',
        is_verified: d.isVerified,
        aliases: (d.domainAliases ?? []).map((a) => ({
          alias: a.domainAliasName,
          is_verified: a.isVerified,
          parent: a.parentDomainName,
        })),
      }));
      return JSON.stringify({ ok: true, domains });
    }

    if (action === 'get') {
      if (!domain) return JSON.stringify({ ok: false, error: 'domain is required for action: get' });
      const d = await getWorkspaceDomain(domain);
      return JSON.stringify({
        ok: true,
        domain: d.domainName,
        type: d.isPrimary ? 'primary' : 'secondary',
        is_verified: d.isVerified,
        aliases: (d.domainAliases ?? []).map((a) => ({
          alias: a.domainAliasName,
          is_verified: a.isVerified,
          parent: a.parentDomainName,
        })),
      });
    }

    return JSON.stringify({ ok: false, error: `Unknown action: ${action}` });
  } catch (e) {
    return catchAnalytics(e);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool definitions
// ─────────────────────────────────────────────────────────────────────────────

const gmailDkimDefinition: AgentToolDef = {
  type: 'function',
  function: {
    name: 'gmail_dkim',
    description:
      'Manage Google Workspace DKIM keys for a domain. ' +
      'get_status: fetch current DKIM config and the DNS TXT record value. ' +
      'generate_key: generate a new 2048-bit RSA keypair via Google Admin SDK. ' +
      'publish_to_cloudflare: auto-publish the DKIM TXT record to Cloudflare DNS (requires CLOUDFLARE_API_TOKEN). ' +
      'enable_dkim: turn on DKIM signing once the TXT record is live. ' +
      'disable_dkim: turn off DKIM signing. ' +
      'Typical flow: generate_key → publish_to_cloudflare → enable_dkim. ' +
      'Requires Google re-auth with admin.directory.domain scope.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          description: 'Action to perform.',
          enum: [
            'get_status',
            'generate_key',
            'publish_to_cloudflare',
            'enable_dkim',
            'disable_dkim',
          ],
        },
        domain: {
          type: 'string',
          description: 'Bare domain name, e.g. "rothcollc.com"',
        },
      },
      required: ['action', 'domain'],
      additionalProperties: false,
    },
  },
};

const googleWorkspaceDomainsDefinition: AgentToolDef = {
  type: 'function',
  function: {
    name: 'google_workspace_domains',
    description:
      'List or inspect all domains on the Google Workspace account (primary, secondary, aliases). ' +
      'action "list": returns all domains with their type (primary/secondary) and any aliases. ' +
      'action "get": returns details for a specific domain including whether it is primary or secondary. ' +
      'Use this before gmail_dkim to confirm a domain exists and its type — secondary domains get their own DKIM key; aliases share the primary domain DKIM. ' +
      'Requires Google re-auth with admin.directory.domain scope.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          description: 'list = all domains; get = one domain by name',
          enum: ['list', 'get'],
        },
        domain: {
          type: 'string',
          description: 'Bare domain name — required for action: get',
        },
      },
      required: ['action'],
      additionalProperties: false,
    },
  },
};

export const gmailDkimAgentTools: AgentToolModule = {
  id: 'google-workspace-dkim',
  enabled: (_ctx: ToolContext) => isGoogleWebmasterOAuthConfigured(),
  definitions(_ctx: ToolContext): AgentToolDef[] {
    return [gmailDkimDefinition, googleWorkspaceDomainsDefinition];
  },
  handlers: {
    gmail_dkim: handle_gmail_dkim,
    google_workspace_domains: handle_google_workspace_domains,
  },
};
