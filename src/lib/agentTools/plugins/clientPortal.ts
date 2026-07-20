import { summarizeKnowledgeIndex } from '../../localKnowledge';
import {
  storeListKnowledge,
  storeReadKnowledge,
  storeSearchKnowledge,
  storeWriteKnowledge,
  isKnowledgeDbConfigured,
} from '../../knowledgeStore';
import {
  isSafeWorkSlug,
  slugFromTitle,
  storeDeleteWork,
  storeListWork,
  storeReadWork,
  storeWriteWork,
  storeToggleWorkCheckbox,
  patchWorkSourceChatId,
  WORK_PRIORITIES,
  WORK_STATUSES,
  type WorkPriority,
  type WorkStatus,
} from '../../workStore';
import {
  completedItemsToInvoiceSuggestions,
  groupedInvoiceDescription,
  parseMarkdownCheckboxes,
} from '../../workChecklist';
import { findCheckboxByText } from '../../markdownCheckboxes';
import {
  isTodoDbConfigured,
  normalizeTodoPriority,
  normalizeTodoStatus,
  storeCreateTodo,
  storeDeleteTodo,
  storeListTodos,
  storeMarkTodoDone,
  storeUpdateTodo,
  TODO_PRIORITIES,
  TODO_STATUSES,
  type TodoPriority,
  type TodoStatus,
} from '../../todoStore';
import { getContactDeleteBlockers, executeContactDelete } from '../../contactDeleteGuard';
import {
  isContactApiConfigured,
  resolveContact,
  listContacts,
  createContact,
  updateContact,
  getContact,
  setContactPortal,
  extractPortal,
  clientPortalUrl,
  type ClientPortal,
  type ClientPortalField,
  type ClientDataEntry,
} from '../../contactApi';
import {
  extractClientSearchTerms,
  formatClientCandidate,
  primaryClientSearchTerm,
  resolveContactEnhanced,
  resolveWorkClientDecision,
  searchClientsEnhanced,
} from '../../clientSearch';
import {
  isCraterConfigured,
  craterCreateInvoice,
  craterSearchCustomers,
  craterListInvoices,
  craterGetInvoice,
  craterUpdateInvoice,
  craterDeleteInvoice,
  craterAddInvoiceItems,
  craterSearchLineItems,
  craterRecordPayment,
  craterListRecurringInvoices,
  craterCreateRecurringInvoice,
  craterRepairInvoiceNumbers,
  craterRepairPaymentNumbers,
  craterResetInvoices,
} from '../../craterClient';
import {
  isEmailSendConfigured,
  isSmsSendConfigured,
  sendEmail,
  sendSms,
} from '../../outbound';
import { DEV_TASK_NAMES, isDevTaskName, runDevTask } from '../../devTaskRunner';
import {
  formatRailwayNetworkingSummary,
  isRailwayConfigured,
  railwayListProjectNetworking,
} from '../../railwayClient';
import {
  formatKinstaSitesSummary,
  isKinstaConfigured,
  kinstaClearCache,
  kinstaCreateManualBackup,
  kinstaCreateSite,
  kinstaDeleteSite,
  kinstaGetOperation,
  kinstaGetSite,
  kinstaListBackups,
  kinstaListSites,
} from '../../kinstaClient';
import { getGitStatus, getRecentCommits, listOpenBranches, checkDeploymentStatus } from '../../devStatus';
import { githubCreateBranch, githubCreatePullRequest, githubDefaultBranch, githubRepoSlug, githubWriteFile } from '../../githubClient';
import { describeSafeShell, runSafeShellCommand } from '../../safeShell';
import {
  codeDevExecCommand,
  codeDevListFiles,
  codeDevReadFile,
  codeDevWriteFile,
} from '../../codeDevTools';
import { deliverShare } from '../../shareDelivery';
import { braveSearch, formatBraveResults, isBraveConfigured } from '../../braveClient';
import { fetchUrl } from '../../fetchUrlClient';
import {
  storeDeleteEmailInbox,
  storeListEmailInbox,
  storeUpdateEmailInbox,
  storeGetEmailInbox,
  type EmailInboxPatch,
} from '../../emailInboxStore';
import { extractMonetaryAmountFromEmail, formatUsdAmount } from '../../emailMoney';
import { buildReplyEmailHeaders } from '../../emailReply';
import { brandedPlainTextEmail } from '../../inboundEmailReply';
import { assignEmailToJob, linkProjectItem, linkWorkFromAgentContext } from '../../projectLinks';
import { markInboxEmailAsProject } from '../../emailProjectCategory';
import { importEmailAttachmentsToProject } from '../../emailProjectAttachments';
import {
  storeAddChatImagesToProject,
  storeListProjectFiles,
} from '../../projectFiles';
import { logOutboundEmailForProject } from '../../logOutboundEmailForProject';
import { recordProjectOutboundEmail } from '../../projectOutboundEmail';
import { getAgentContext } from '../../agentContext';
import { defaultBrandContext, getCompanyBrandContext, type CompanyBrandContext } from '../../companyConfig';
import { syncVapiAssistantBrand } from '../../vapiAssistantSync';
import { isVapiAdminConfigured } from '../../vapiPlugin';
import { storeCreateEmailRule, storeListEmailRules } from '../../emailRuleStore';
import type { RuleField } from '../../emailRules';
import { MAX_AGENT_EMAIL_BODY } from '../../emailAgentContext';
import { formatLighthouseResults, lighthouseAudit } from '../../lighthouseClient';
import { sslCheck, formatSslCheckResults } from '../../sslCheckClient';
import { checkLinks, formatCheckLinksResults } from '../../checkLinksClient';
import { dnsCheck, formatDnsCheckResults } from '../../dnsCheckClient';
import { syncAllResendDnsToCloudflare, syncResendDnsToCloudflare } from '../../resendDnsSync';
import { hasFeature } from '../../features';
import { syncUptimeMonitorsFromApi } from '../../uptimeMonitoring';
import { isUptimeRobotConfigured } from '../../uptimerobotClient';
import { isUptimeDbConfigured } from '../../pgUptime';
import {
  isChangeDetectionConfigured,
  cdGetWatch,
  cdRecheckWatch,
} from '../../changedetectionClient';
import {
  portalSiteUrl,
  SITE_URL_FIELD_LABEL,
} from '../../siteMonitoring';
import {
  isBookingConfigured,
  bookingList,
  bookingGet,
  bookingEventTypes,
  publicBookingPageUrl,
  formatBookingLine,
  calcomWebappUrl,
} from '../../bookingClient';

import type { AgentToolDef, AgentToolModule, ToolContext } from '../types';
import {
  parseEmailListArg,
  parseLineItems,
  parsePortalFields,
  parsePortalData,
  plainTextFromHtml,
  resolvePortalTarget,
  workExtrasFromArgs,
} from '../shared';

async function handle_set_client_portal(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const target = await resolvePortalTarget(args);
  if (!target.ok) return target.payload;

  const current = await getContact(target.uid);
  if (!current.ok) return JSON.stringify({ error: current.error, status: current.status });
  const existing = extractPortal(current.data) ?? {};

  const fields = parsePortalFields(args.fields);
  const data = parsePortalData(args.data);
  const next: ClientPortal = {
    ...existing,
    enabled: typeof args.enabled === 'boolean' ? args.enabled : existing.enabled ?? true,
    headline: typeof args.headline === 'string' ? args.headline.trim() : existing.headline,
    body: typeof args.body === 'string' ? args.body : existing.body,
    fields: fields !== undefined ? fields : existing.fields,
    data: data !== undefined ? data : existing.data,
  };

  const saved = await setContactPortal(target.uid, next);
  if (!saved.ok) return JSON.stringify({ error: saved.error, status: saved.status });
  return JSON.stringify({
    success: true,
    uid: target.uid,
    name: current.data.name,
    url: clientPortalUrl(target.uid),
    enabled: next.enabled,
    portal: next,
  });
}

async function handle_get_client_portal(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const target = await resolvePortalTarget(args);
  if (!target.ok) return target.payload;

  const current = await getContact(target.uid);
  if (!current.ok) return JSON.stringify({ error: current.error, status: current.status });
  const portal = extractPortal(current.data);
  return JSON.stringify({
    uid: target.uid,
    name: current.data.name,
    url: clientPortalUrl(target.uid),
    live: portal?.enabled !== false,
    has_custom_content: Boolean(portal),
    portal: portal ?? null,
  });
}

async function handle_get_client_submit_link(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const target = await resolvePortalTarget(args);
  if (!target.ok) return target.payload;

  const current = await getContact(target.uid);
  if (!current.ok) return JSON.stringify({ error: current.error, status: current.status });
  const portal = extractPortal(current.data);
  if (portal?.enabled === false) {
    return JSON.stringify({ error: 'This client\'s page is hidden (enabled:false). Re-enable it before sending.' });
  }
  const submitUrl = `${clientPortalUrl(target.uid)}?submit`;
  return JSON.stringify({
    uid: target.uid,
    name: current.data.name,
    submit_url: submitUrl,
    note: 'Send this link to the client — they can paste credentials or any handoff data directly from their browser. Entries appear in their Data tab.',
  });
}

async function handle_send_client_portal(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const target = await resolvePortalTarget(args);
  if (!target.ok) return target.payload;

  const current = await getContact(target.uid);
  if (!current.ok) return JSON.stringify({ error: current.error, status: current.status });
  const c = current.data;

  const channel = String(args.channel ?? 'auto');
  let useEmail = false;
  let useSms = false;
  if (channel === 'email') useEmail = true;
  else if (channel === 'sms') useSms = true;
  else if (c.email) useEmail = true;
  else if (c.phone) useSms = true;

  if (useEmail && !c.email) {
    return JSON.stringify({ error: 'No email on file for this client. Try channel "sms" or add an email.' });
  }
  if (useSms && !c.phone) {
    return JSON.stringify({ error: 'No phone on file for this client. Try channel "email" or add a phone.' });
  }
  if (!useEmail && !useSms) {
    return JSON.stringify({ error: 'This client has no email or phone on file to send to.' });
  }

  const jobSlug = typeof args.job_slug === 'string' ? args.job_slug.trim() : '';
  const message =
    typeof args.message === 'string' && args.message.trim() ? args.message.trim() : undefined;
  const sent: Record<string, unknown> = {};
  let url = clientPortalUrl(target.uid);
  let tracked: { token?: string; job_slug?: string } | undefined;

  if (useEmail) {
    const r = await deliverShare({
      kind: 'portal',
      channel: 'email',
      recipient: { contactUid: target.uid },
      message,
      jobSlug: jobSlug || undefined,
      sentBy: getAgentContext().userId ?? null,
      source: 'agent_send_client_portal',
    });
    sent.email = r.ok
      ? { ok: true, to: c.email, id: undefined }
      : { ok: false, error: r.error };
    if (r.ok) {
      url = r.url;
      if (r.tracked) tracked = { token: r.tracked.token, job_slug: r.tracked.job_slug };
    }
  }
  if (useSms) {
    const r = await deliverShare({
      kind: 'portal',
      channel: 'sms',
      recipient: { contactUid: target.uid },
      message,
      jobSlug: jobSlug || undefined,
      url: useEmail && sent.email && (sent.email as { ok?: boolean }).ok ? url : undefined,
      sentBy: getAgentContext().userId ?? null,
      source: 'agent_send_client_portal',
    });
    sent.sms = r.ok ? { ok: true, to: c.phone, id: undefined } : { ok: false, error: r.error };
    if (r.ok && !useEmail) {
      url = r.url;
      if (r.tracked) tracked = { token: r.tracked.token, job_slug: r.tracked.job_slug };
    }
  }

  const anyOk = Object.values(sent).some((v) => (v as { ok?: boolean }).ok);
  return JSON.stringify({ success: anyOk, uid: target.uid, name: c.name, url, tracked, sent });
}

export const clientPortalModule: AgentToolModule = {
  id: 'clientPortal',
  enabled: (ctx) => isContactApiConfigured() && hasFeature('client_portal'),
  definitions(ctx: ToolContext): AgentToolDef[] {
    const brand = ctx.brand;
    const domainExample = brand.domain || 'example.com';
    void domainExample;
    const out: AgentToolDef[] = [];
    out.push(
            {
              type: 'function',
              function: {
                name: 'set_client_portal',
                description:
                  'Customize a client’s shareable portal page (every client already HAS a page; this sets optional content). Overview = headline/body/fields. Billing = automatic from Crater. Data tab = web-design handoff items (passwords, DNS, hosting) via the `data` param. The link is mobile-friendly and great for iOS "Add to Home Screen". Identify the client by uid or by name (fuzzy-resolved; if ambiguous it returns candidates to confirm). Text updates merge; fields/data replace the prior list when provided. Set enabled:false to hide/revoke the page. Returns the shareable URL. Client-facing — does NOT expose the internal private notes field.',
                parameters: {
                  type: 'object',
                  properties: {
                    uid: { type: 'string', description: 'Contact uid (preferred if known)' },
                    name: { type: 'string', description: 'Client name to resolve when uid is unknown' },
                    email: { type: 'string', description: 'Optional, improves name resolution' },
                    phone: { type: 'string', description: 'Optional, improves name resolution' },
                    headline: { type: 'string', description: 'Short title shown at the top of the portal' },
                    body: {
                      type: 'string',
                      description: 'Main client-facing text (project status, links, instructions). Newlines and URLs are preserved.',
                    },
                    fields: {
                      type: 'array',
                      description: 'Optional labeled key/value rows shown in Overview (e.g. "Site URL" → "https://…", "Plan" → "Annual").',
                      items: {
                        type: 'object',
                        properties: {
                          label: { type: 'string' },
                          value: { type: 'string' },
                        },
                        required: ['label', 'value'],
                        additionalProperties: false,
                      },
                    },
                    data: {
                      type: 'array',
                      description:
                        'Web-design handoff items shown in the client’s DATA tab (passwords, DNS records, hosting/login info, etc.). Each entry has a label plus any of: value, username, password, url. Passwords are masked on the page (reveal/copy). Replaces the existing data list when provided.',
                      items: {
                        type: 'object',
                        properties: {
                          label: { type: 'string', description: 'e.g. "WordPress admin", "DNS — A record", "Hosting"' },
                          value: { type: 'string', description: 'Free-form value/notes (e.g. a DNS record or instructions)' },
                          username: { type: 'string' },
                          password: { type: 'string' },
                          url: { type: 'string' },
                        },
                        required: ['label'],
                        additionalProperties: false,
                      },
                    },
                    enabled: {
                      type: 'boolean',
                      description: 'Set false to revoke/hide the portal (link returns 404). Defaults to true.',
                    },
                  },
                  additionalProperties: false,
                },
              },
            }
    );
    out.push(
            {
              type: 'function',
              function: {
                name: 'get_client_portal',
                description:
                  'Get a client’s shareable portal link and its current custom content. Every client has a page by default, so the link is always valid unless the page was explicitly hidden (enabled:false). Identify by uid or name (fuzzy-resolved). Use to retrieve the link to send to a client or to review what they currently see.',
                parameters: {
                  type: 'object',
                  properties: {
                    uid: { type: 'string', description: 'Contact uid (preferred if known)' },
                    name: { type: 'string', description: 'Client name to resolve when uid is unknown' },
                    email: { type: 'string' },
                    phone: { type: 'string' },
                  },
                  additionalProperties: false,
                },
              },
            }
    );
    out.push(
            {
              type: 'function',
              function: {
                name: 'get_client_submit_link',
                description:
                  'Get the data-submission link for a client (/c/:uid?submit). Send them this URL and they can paste hosting credentials, passwords, DNS records, or any other handoff info directly from their browser — entries are appended to their Data tab. Use this when you need to collect info FROM the client (e.g. "send John a link so he can give us his cPanel password"). Identify by uid or name (fuzzy-resolved).',
                parameters: {
                  type: 'object',
                  properties: {
                    uid: { type: 'string', description: 'Contact uid (preferred if known)' },
                    name: { type: 'string', description: 'Client name to resolve when uid is unknown' },
                    email: { type: 'string' },
                    phone: { type: 'string' },
                  },
                  additionalProperties: false,
                },
              },
            }
    );
    if (isEmailSendConfigured() || isSmsSendConfigured()) out.push(
      {
              type: 'function',
              function: {
                name: 'send_client_portal',
                description:
                  'Send a client their portal link directly to them via email (Resend) and/or SMS (Twilio). This is the "send the client link to <name>" command. Identify by uid or name (fuzzy-resolved). channel "auto" (default) emails them if an email is on file, otherwise texts them. Use the message field to add a short personal note. The page shows their details and any outstanding Crater invoices.',
                parameters: {
                  type: 'object',
                  properties: {
                    uid: { type: 'string', description: 'Contact uid (preferred if known)' },
                    name: { type: 'string', description: 'Client name to resolve when uid is unknown' },
                    email: { type: 'string', description: 'Optional, improves name resolution' },
                    phone: { type: 'string', description: 'Optional, improves name resolution' },
                    channel: {
                      type: 'string',
                      enum: ['auto', 'email', 'sms'],
                      description: 'auto = email if available else SMS. Defaults to auto.',
                    },
                    message: { type: 'string', description: 'Optional short personal note prepended to the message.' },
                    job_slug: {
                      type: 'string',
                      description:
                        'Optional work/project slug — when set, the sent link is tracked so you can see if the client opened it.',
                    },
                  },
                  additionalProperties: false,
                },
              },
            }
    );
    return out;
  },
  handlers: {
    'set_client_portal': handle_set_client_portal,
    'get_client_portal': handle_get_client_portal,
    'get_client_submit_link': handle_get_client_submit_link,
    'send_client_portal': handle_send_client_portal,
  },
};
