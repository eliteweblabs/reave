/**
 * Admin agent tool definitions (JSON schema) and dispatch.
 * Single source of truth for buildTools / runTool.
 */
import { summarizeKnowledgeIndex } from './localKnowledge';
import {
  storeListKnowledge,
  storeReadKnowledge,
  storeSearchKnowledge,
  storeWriteKnowledge,
  isKnowledgeDbConfigured,
} from './knowledgeStore';
import {
  isSafeWorkSlug,
  slugFromTitle,
  storeDeleteWork,
  storeListWork,
  storeReadWork,
  storeWriteWork,
  WORK_PRIORITIES,
  WORK_STATUSES,
  type WorkPriority,
  type WorkStatus,
} from './workStore';
import { getContactDeleteBlockers, executeContactDelete } from './contactDeleteGuard';
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
} from './contactApi';
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
} from './craterClient';
import {
  isEmailSendConfigured,
  isSmsSendConfigured,
  sendEmail,
  sendSms,
} from './outbound';
import { DEV_TASK_NAMES, isDevTaskName, runDevTask } from './devTaskRunner';
import {
  formatRailwayNetworkingSummary,
  isRailwayConfigured,
  railwayListProjectNetworking,
} from './railwayClient';
import {
  formatKinstaSitesSummary,
  isKinstaConfigured,
  kinstaClearCache,
  kinstaGetOperation,
  kinstaGetSite,
  kinstaListSites,
} from './kinstaClient';
import { getGitStatus, getRecentCommits, listOpenBranches, checkDeploymentStatus } from './devStatus';
import { githubCreateBranch, githubCreatePullRequest, githubDefaultBranch, githubRepoSlug, githubWriteFile } from './githubClient';
import { describeSafeShell, runSafeShellCommand } from './safeShell';
import { brandedEmailHtml } from './emailTemplates';
import { braveSearch, formatBraveResults, isBraveConfigured } from './braveClient';
import { fetchUrl } from './fetchUrlClient';
import {
  storeDeleteEmailInbox,
  storeListEmailInbox,
  storeUpdateEmailInbox,
} from './emailInboxStore';
import { storeCreateEmailRule, storeListEmailRules } from './emailRuleStore';
import type { RuleField } from './emailRules';
import { formatLighthouseResults, lighthouseAudit } from './lighthouseClient';
import { sslCheck, formatSslCheckResults } from './sslCheckClient';
import { checkLinks, formatCheckLinksResults } from './checkLinksClient';
import { dnsCheck, formatDnsCheckResults } from './dnsCheckClient';
import { hasFeature } from './features';
import {
  isChangeDetectionConfigured,
  cdGetWatch,
  cdRecheckWatch,
} from './changedetectionClient';
import {
  portalSiteUrl,
  SITE_URL_FIELD_LABEL,
} from './siteMonitoring';
import {
  isBookingConfigured,
  bookingList,
  bookingGet,
  bookingEventTypes,
  publicBookingPageUrl,
  formatBookingLine,
  calcomWebappUrl,
} from './bookingClient';

export type AgentToolDef = {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
};

const INVOICE_STATUS_ENUM = ['DRAFT', 'SENT', 'VIEWED', 'OVERDUE', 'COMPLETED'] as const;
const PAYMENT_MODE_ENUM = ['CASH', 'CHECK', 'CREDIT_CARD', 'BANK_TRANSFER', 'OTHER'] as const;
const RECURRING_STATUS_ENUM = ['ACTIVE', 'ON_HOLD', 'COMPLETED'] as const;

const lineItemSchema = {
  type: 'object',
  properties: {
    name: { type: 'string', description: 'Line item name' },
    description: { type: 'string' },
    quantity: { type: 'number', description: 'Defaults to 1 if omitted' },
    price: { type: 'number', description: 'Unit price in whole dollars' },
  },
  required: ['name', 'price'],
  additionalProperties: false,
};

export function buildTools(): AgentToolDef[] {
  const base: AgentToolDef[] = [
    {
      type: 'function',
      function: {
        name: 'list_knowledge',
        description:
          'List all knowledge entries (live DB + bundled fallback) with one-line previews. Use this to discover what internal docs exist before calling read_knowledge.',
        parameters: { type: 'object', properties: {}, additionalProperties: false },
      },
    },
    {
      type: 'function',
      function: {
        name: 'read_knowledge',
        description:
          'Read the full content of a knowledge entry by slug. Checks the live database first, then bundled docs.',
        parameters: {
          type: 'object',
          properties: { slug: { type: 'string', description: 'Entry slug (no .md extension)' } },
          required: ['slug'],
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'search_knowledge',
        description:
          'Search knowledge entries by keyword or topic. Returns matching titles + previews from both the live DB and bundled docs. Use instead of list_knowledge when you have a specific topic in mind.',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search terms — keywords, topic names, or a short natural-language phrase',
            },
          },
          required: ['query'],
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'list_work',
        description:
          'List work/job records (metadata only — no full notes). Jobs live in src/knowledge/jobs/ and are tied to a contact. Use to discover open jobs; call read_work for full details when a job is referenced.',
        parameters: {
          type: 'object',
          properties: {
            contact_uid: {
              type: 'string',
              description: 'Optional contact-api uid — list jobs for one client only',
            },
            status: {
              type: 'string',
              enum: [...WORK_STATUSES],
              description: 'Optional status filter',
            },
            q: {
              type: 'string',
              description: 'Optional search on title, client name, or slug',
            },
          },
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'read_work',
        description:
          'Read the full markdown for one work/job by slug. Loads on demand — use after list_work or when the user asks about a specific job.',
        parameters: {
          type: 'object',
          properties: {
            slug: { type: 'string', description: 'Job slug (filename without .md)' },
          },
          required: ['slug'],
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'create_work',
        description:
          'Create a new work/job markdown file tied to a client. Resolves the client name via contact-api (must already exist). Use when an inbound request, email, or conversation should become a tracked job.',
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Job title, e.g. "New website for Acme"' },
            client: {
              type: 'string',
              description: 'Client name — fuzzy-matched against contact-api on save',
            },
            body: {
              type: 'string',
              description: 'Optional markdown notes (scope, request details, links). Omit for a blank stub.',
            },
            status: {
              type: 'string',
              enum: [...WORK_STATUSES],
              description: 'Defaults to inquiry',
            },
            priority: {
              type: 'string',
              enum: [...WORK_PRIORITIES],
              description: 'Defaults to normal',
            },
            due_date: {
              type: 'string',
              description: 'Optional deadline (YYYY-MM-DD)',
            },
            value: {
              type: 'number',
              description: 'Optional dollar value for the job',
            },
            tags: {
              type: 'array',
              items: { type: 'string' },
              description: 'Tags e.g. web-design, seo, hosting',
            },
            source: {
              type: 'string',
              description: 'Lead source — instagram, email, referral, phone, etc.',
            },
            slug: {
              type: 'string',
              description: 'Optional filename slug; derived from title if omitted',
            },
          },
          required: ['title', 'client'],
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'update_work',
        description:
          'Update an existing work/job by slug. Omitted fields are left unchanged. Re-resolves client via contact-api if client is provided.',
        parameters: {
          type: 'object',
          properties: {
            slug: { type: 'string', description: 'Job slug to update' },
            title: { type: 'string', description: 'New title' },
            client: { type: 'string', description: 'New client name (re-resolved via contact-api)' },
            body: { type: 'string', description: 'Replacement markdown notes (full body, not a patch)' },
            status: {
              type: 'string',
              enum: [...WORK_STATUSES],
              description: 'New status',
            },
            priority: {
              type: 'string',
              enum: [...WORK_PRIORITIES],
              description: 'New priority',
            },
            due_date: {
              type: 'string',
              description: 'New deadline (YYYY-MM-DD)',
            },
            value: {
              type: 'number',
              description: 'New dollar value',
            },
            tags: {
              type: 'array',
              items: { type: 'string' },
              description: 'Replace tags list',
            },
            source: {
              type: 'string',
              description: 'Lead source — instagram, email, referral, phone, etc.',
            },
          },
          required: ['slug'],
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'delete_work',
        description:
          'Permanently delete a work/job markdown file by slug. Use only when the user explicitly asks to delete/remove a job.',
        parameters: {
          type: 'object',
          properties: {
            slug: { type: 'string', description: 'Job slug to delete' },
          },
          required: ['slug'],
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'write_knowledge',
        description:
          'Create or update a knowledge entry in the live database. Use this to save new context, notes, playbooks, or corrections so they persist across restarts without a redeploy. Requires DATABASE_URL (Railway Postgres) to be set.',
        parameters: {
          type: 'object',
          properties: {
            slug: {
              type: 'string',
              description: 'URL-safe identifier, e.g. "stripe-billing" or "client-onboarding"',
            },
            title: { type: 'string', description: 'Short human-readable title' },
            content: {
              type: 'string',
              description: 'Full markdown content (playbook, notes, reference, etc.)',
            },
            tags: {
              type: 'array',
              items: { type: 'string' },
              description: 'Topic tags for search, e.g. ["billing", "stripe"]',
            },
          },
          required: ['slug', 'title', 'content'],
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'list_email_inbox',
        description:
          'List recent inbound emails from the Reave inbox log (admin Email tab). Use when triaging mail or finding a message id by sender/subject.',
        parameters: {
          type: 'object',
          properties: {
            q: { type: 'string', description: 'Optional search on from, subject, or summary' },
            include_junk: {
              type: 'boolean',
              description: 'Include junk-marked messages (default false)',
            },
            limit: { type: 'number', description: 'Max rows (default 20, max 100)' },
          },
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'mark_email_junk',
        description:
          'Mark an inbound inbox message as junk (hidden from default inbox). Requires the message id from email triage context or list_email_inbox.',
        parameters: {
          type: 'object',
          properties: {
            email_id: { type: 'string', description: 'Inbox message UUID' },
          },
          required: ['email_id'],
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'delete_email',
        description:
          'Permanently remove an inbound inbox message from the Reave inbox log. Use after marking junk when the user wants it gone, or when triage says delete/spam.',
        parameters: {
          type: 'object',
          properties: {
            email_id: { type: 'string', description: 'Inbox message UUID' },
          },
          required: ['email_id'],
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'create_email_filter_rule',
        description:
          'Create a triage rule so future mail from a sender or matching phrases is auto-classified as junk (status DELETE, no alert). Skips if an enabled rule already matches the same sender phrase.',
        parameters: {
          type: 'object',
          properties: {
            sender: {
              type: 'string',
              description: 'Sender email or domain substring, e.g. wordpress@mdot.world',
            },
            phrases: {
              type: 'array',
              items: { type: 'string' },
              description: 'Optional extra match phrases (subject/body). sender is always added when provided.',
            },
            title: {
              type: 'string',
              description: 'Optional rule title shown in admin Rules UI',
            },
          },
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'run_dev_task',
        description:
          'Run a sandboxed dev/ops task (service pings, config status). No arbitrary shell commands.',
        parameters: {
          type: 'object',
          properties: {
            task: {
              type: 'string',
              enum: [...DEV_TASK_NAMES],
              description:
                'service_status = which integrations are configured; ping_crater / ping_contact_api / ping_railway / ping_kinsta = connectivity check; list_knowledge_slugs = bundled docs; list_railway_domains = Railway CNAME/custom domains; list_kinsta_sites = Kinsta WordPress sites/environments.',
            },
          },
          required: ['task'],
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'list_railway_domains',
        description:
          'Read Railway networking for a project: *.up.railway.app domains, custom domains, CNAME targets (requiredValue), and verification TXT tokens. Use when the user asks for a CNAME target, custom domain DNS, or what domain a service is on. Requires RAILWAY_API_TOKEN. Defaults to project "Reave App" / environment production.',
        parameters: {
          type: 'object',
          properties: {
            project: {
              type: 'string',
              description: 'Project name or UUID (default: RAILWAY_PROJECT_ID env or "Reave App")',
            },
            environment: { type: 'string', description: 'Environment name (default: production)' },
            service: {
              type: 'string',
              description: 'Optional service name filter, e.g. "reave" or "contact-api"',
            },
          },
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'list_kinsta_sites',
        description:
          'List WordPress sites on Kinsta for the configured company (KINSTA_API_KEY + KINSTA_COMPANY_ID). Returns site ids, statuses, and optionally live/staging environment ids, primary domains, and PHP versions. Use for Kinsta hosting questions, finding environment_id before cache clears, or client site inventory.',
        parameters: {
          type: 'object',
          properties: {
            include_environments: {
              type: 'boolean',
              description: 'Include live/staging environment details (default true)',
            },
            site_id: {
              type: 'string',
              description: 'Optional: fetch one site by id instead of listing all',
            },
          },
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'clear_kinsta_cache',
        description:
          'Clear Kinsta site cache for a specific environment_id (from list_kinsta_sites). Returns operation_id — poll with get_kinsta_operation. Requires KINSTA_API_KEY.',
        parameters: {
          type: 'object',
          properties: {
            environment_id: {
              type: 'string',
              description: 'Kinsta environment UUID (live or staging)',
            },
          },
          required: ['environment_id'],
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_kinsta_operation',
        description:
          'Check status of an async Kinsta API operation (site create, cache clear, backup, etc.). Status values include has_completed and has_failed.',
        parameters: {
          type: 'object',
          properties: {
            operation_id: { type: 'string', description: 'operation_id from a prior Kinsta tool call' },
          },
          required: ['operation_id'],
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_git_status',
        description:
          'Snapshot of the GitHub repo (source of truth): current/default branch, latest commits, branch count, and whether the live deploy is on the latest commit. Use to verify work was committed & pushed. Local uncommitted/unstaged changes are NOT visible here — use run_terminal_command on a checked-out repo for that.',
        parameters: {
          type: 'object',
          properties: {
            branch: { type: 'string', description: 'Branch to inspect; defaults to the repo default branch.' },
            limit: { type: 'integer', description: 'How many recent commits to include (1-30, default 8).' },
          },
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_recent_commits',
        description:
          'Recent commit history from GitHub (author, message, timestamp, link; optionally files changed). Use to verify whether specific work landed.',
        parameters: {
          type: 'object',
          properties: {
            branch: { type: 'string', description: 'Branch to read; defaults to the repo default branch.' },
            limit: { type: 'integer', description: 'Number of commits (1-30, default 5).' },
            with_files: { type: 'boolean', description: 'Include changed files + stats per commit (slower).' },
          },
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'check_deployment_status',
        description:
          'Is the latest pushed code actually live? Compares the deployed commit (Railway RAILWAY_GIT_COMMIT_SHA) to GitHub’s latest commit on the default branch and pings the public health endpoint. Returns a one-line summary plus details.',
        parameters: { type: 'object', properties: {}, additionalProperties: false },
      },
    },
    {
      type: 'function',
      function: {
        name: 'list_open_branches',
        description:
          'List active branches on GitHub with how far each is ahead/behind the default branch. Use to track in-progress work.',
        parameters: { type: 'object', properties: {}, additionalProperties: false },
      },
    },
  ];

  if (hasFeature('site_audits')) {
    base.push(
      {
        type: 'function',
        function: {
          name: 'fetch_url',
          description:
            'Fetch a public web page and return its content for review (client sites, SEO checks, error pages). Returns title, meta tags, and readable text (scripts/styles stripped). Use when the user asks to review, read, or audit a website URL. For performance use lighthouse_audit; for SSL/headers use ssl_check; for broken links use check_links; for DNS/email auth use dns_check.',
          parameters: {
            type: 'object',
            properties: {
              url: { type: 'string', description: 'Full URL or domain, e.g. https://example.com' },
              raw: {
                type: 'boolean',
                description: 'If true, return raw HTML body instead of cleaned text. Default false.',
              },
            },
            required: ['url'],
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'lighthouse_audit',
          description:
            'Run Google PageSpeed Insights (Lighthouse) on a URL. Returns performance, accessibility, best-practices, and SEO scores (0–100), core web vitals (FCP, LCP, CLS, TBT), and top improvement opportunities. Runs mobile + desktop by default.',
          parameters: {
            type: 'object',
            properties: {
              url: { type: 'string', description: 'Full URL or domain to audit' },
              category: {
                type: 'string',
                enum: ['performance', 'accessibility', 'best-practices', 'seo'],
                description: 'Optional — audit one category only; default runs all four.',
              },
              strategy: {
                type: 'string',
                enum: ['mobile', 'desktop', 'both'],
                description: 'Device strategy. Default both (mobile + desktop).',
              },
            },
            required: ['url'],
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'ssl_check',
          description:
            'Check SSL certificate validity, expiry, TLS version, and security headers (HSTS, CSP, X-Frame-Options, etc.) for a URL. Returns cert details, header audit, mixed-content warnings, and an overall grade (A–F).',
          parameters: {
            type: 'object',
            properties: {
              url: { type: 'string', description: 'Full URL or domain to check' },
            },
            required: ['url'],
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'check_links',
          description:
            'Crawl a page and check all links for broken URLs (404s, 5xx, timeouts) and redirect chains. Returns broken link report with anchor text and status codes.',
          parameters: {
            type: 'object',
            properties: {
              url: { type: 'string', description: 'Page URL to crawl' },
              follow_internal: {
                type: 'boolean',
                description: 'Also crawl linked internal pages (depth 1, max 20). Default false.',
              },
            },
            required: ['url'],
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'dns_check',
          description:
            'Check domain DNS health, nameservers, email authentication (SPF, DKIM, DMARC), WHOIS basics, and A-record propagation across public resolvers.',
          parameters: {
            type: 'object',
            properties: {
              domain: { type: 'string', description: 'Domain name (no protocol), e.g. example.com' },
            },
            required: ['domain'],
            additionalProperties: false,
          },
        },
      },
    );
  }

  base.push(
    {
      type: 'function',
      function: {
        name: 'run_terminal_command',
        description:
          `Run a single READ-ONLY shell command in a sandbox (no shell, no pipes/redirects/chaining). Allowed binaries: ${describeSafeShell().binaries.join(', ')}; git is limited to read-only subcommands (${describeSafeShell().git_subcommands.join(', ')}). Useful where the repo is checked out; on the live container there may be no git checkout.`,
        parameters: {
          type: 'object',
          properties: {
            command: { type: 'string', description: 'e.g. "git log --oneline -10", "git status", "git branch -a", "ls".' },
          },
          required: ['command'],
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'create_github_branch',
        description:
          `Create a new branch from an existing branch (default from_branch: ${githubDefaultBranch()}). Use before write_github_file when no feature branch exists yet. Requires GITHUB_TOKEN with Contents write.`,
        parameters: {
          type: 'object',
          properties: {
            repo: {
              type: 'string',
              description: `owner/repo (defaults to ${githubRepoSlug()} when omitted)`,
            },
            branch: { type: 'string', description: 'New branch name, e.g. telegram/fix-typo' },
            from_branch: {
              type: 'string',
              description: `Existing branch to branch from (defaults to ${githubDefaultBranch()})`,
            },
          },
          required: ['branch'],
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'write_github_file',
        description:
          'Create or update a file in a GitHub repo via the Contents API. Commits directly to the given branch (branch must already exist). Requires GITHUB_TOKEN with Contents write. Returns commit SHA and URL.',
        parameters: {
          type: 'object',
          properties: {
            repo: {
              type: 'string',
              description: `owner/repo (defaults to ${githubRepoSlug()} when omitted)`,
            },
            branch: { type: 'string', description: 'Target branch to commit to' },
            path: { type: 'string', description: 'File path in the repo, e.g. src/lib/example.ts' },
            content: { type: 'string', description: 'Full new file contents (UTF-8 text)' },
            message: { type: 'string', description: 'Git commit message' },
          },
          required: ['branch', 'path', 'content', 'message'],
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'create_pull_request',
        description:
          'Open a pull request on GitHub. Use after write_github_file commits on a feature branch. Requires GITHUB_TOKEN with Pull requests write.',
        parameters: {
          type: 'object',
          properties: {
            repo: {
              type: 'string',
              description: `owner/repo (defaults to ${githubRepoSlug()} when omitted)`,
            },
            head: { type: 'string', description: 'Head branch (the branch with your changes)' },
            base: {
              type: 'string',
              description: `Base branch to merge into (defaults to ${githubDefaultBranch()})`,
            },
            title: { type: 'string', description: 'PR title' },
            body: { type: 'string', description: 'PR description (markdown ok)' },
          },
          required: ['head', 'title'],
          additionalProperties: false,
        },
      },
    },
  );

  if (isContactApiConfigured()) {
    base.push({
      type: 'function',
      function: {
        name: 'resolve_contact',
        description:
          'Fuzzy-match a client/person against the master contact-api (names, typos, aliases). Use when the user mentions a client name or asks who someone is.',
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Full or partial name to match' },
            email: { type: 'string' },
            phone: { type: 'string' },
          },
          additionalProperties: false,
        },
      },
    });

    base.push(
      {
        type: 'function',
        function: {
          name: 'list_contacts',
          description:
            'List or search ALL contacts in the master contact-api (the full client list). Each result includes a portal_url — every client automatically has a shareable page. Use when the user asks to see/browse their contacts or clients, wants a client’s link, or wants to pick one. Optional `q` filters by name/email; omit it to list everyone (newest first).',
          parameters: {
            type: 'object',
            properties: {
              q: { type: 'string', description: 'Optional search text (name or email); omit to list all' },
              limit: { type: 'integer', description: 'Max results (1-200, default 50)' },
            },
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'create_contact',
          description:
            'Add a new contact/client to the master contact-api. Use when the user wants to add a client or create a test client. Returns the new contact uid and its portal_url.',
          parameters: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Full name (required)' },
              email: { type: 'string' },
              phone: { type: 'string' },
              company: { type: 'string' },
              notes: { type: 'string', description: 'Private internal notes (never shown on the client portal)' },
            },
            required: ['name'],
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'update_contact',
          description:
            "Update an existing contact's details. Identify by uid (preferred) or name (fuzzy-resolved; returns candidates if ambiguous). Only provided fields are changed.",
          parameters: {
            type: 'object',
            properties: {
              uid: { type: 'string', description: 'Contact uid (preferred)' },
              name: { type: 'string', description: 'Fuzzy match lookup if uid unknown' },
              new_name: { type: 'string', description: 'Rename the contact' },
              email: { type: 'string' },
              phone: { type: 'string' },
              company: { type: 'string' },
              notes: { type: 'string', description: 'Private internal notes' },
            },
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'delete_contact',
          description:
            'Permanently delete a contact by uid. Use only when the user explicitly asks to delete/remove a contact.',
          parameters: {
            type: 'object',
            properties: {
              uid: { type: 'string', description: 'Contact uid to delete' },
              force: {
                type: 'boolean',
                description: 'Required if contact has linked jobs/invoices',
              },
            },
            required: ['uid'],
            additionalProperties: false,
          },
        },
      },
    );
  }

  if (isContactApiConfigured() && hasFeature('client_portal')) {
    base.push(
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
      },
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
      },
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

    if (isEmailSendConfigured() || isSmsSendConfigured()) {
      base.push({
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
            },
            additionalProperties: false,
          },
        },
      });
    }
  }

  if (hasFeature('site_monitoring') && isChangeDetectionConfigured()) {
    base.push(
      {
        type: 'function',
        function: {
          name: 'get_site_monitoring',
          description:
            `Get ChangeDetection.io watch status for a client. Requires a "${SITE_URL_FIELD_LABEL}" field on their portal (auto-creates a watch when saved). Identify client by uid or name.`,
          parameters: {
            type: 'object',
            properties: {
              uid: { type: 'string' },
              name: { type: 'string' },
              email: { type: 'string' },
              phone: { type: 'string' },
            },
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'set_site_monitoring',
          description:
            `Enable or disable automatic change monitoring for a client's Site URL. When enabled and a "${SITE_URL_FIELD_LABEL}" portal field is set, Reave creates a ChangeDetection watch and sends push alerts on unexpected changes (deploys are suppressed).`,
          parameters: {
            type: 'object',
            properties: {
              uid: { type: 'string' },
              name: { type: 'string' },
              enabled: {
                type: 'boolean',
                description: 'false = pause monitoring for this client even if Site URL is set',
              },
            },
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'recheck_site_monitoring',
          description:
            'Trigger an immediate ChangeDetection recheck for a client (updates baseline after you deploy). Identify by uid or name.',
          parameters: {
            type: 'object',
            properties: {
              uid: { type: 'string' },
              name: { type: 'string' },
            },
            additionalProperties: false,
          },
        },
      },
    );
  }

  if (hasFeature('scheduling') && isBookingConfigured()) {
    base.push(
      {
        type: 'function',
        function: {
          name: 'list_bookings',
          description:
            'List Cal.com bookings (upcoming by default). Use when the user asks what is on the calendar, today\'s meetings, or upcoming appointments.',
          parameters: {
            type: 'object',
            properties: {
              upcoming: {
                type: 'boolean',
                description: 'true = future bookings only (default). false = recent past 30 days.',
              },
              limit: { type: 'integer', description: 'Max results (1-50, default 15)' },
            },
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_booking',
          description: 'Fetch one Cal.com booking by uid (from list_bookings).',
          parameters: {
            type: 'object',
            properties: {
              uid: { type: 'string', description: 'Booking uid' },
            },
            required: ['uid'],
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_booking_link',
          description:
            'Get the public Cal.com booking URL to share with a client (default 30 min meeting). Also returns reave.app/form/schedule conversational form link.',
          parameters: {
            type: 'object',
            properties: {
              event_slug: {
                type: 'string',
                description: 'Cal.com event slug, e.g. 30min, 15min. Default 30min.',
              },
            },
            additionalProperties: false,
          },
        },
      },
    );
  }

  if (hasFeature('billing') && isCraterConfigured()) {
    base.push(
      {
        type: 'function',
        function: {
          name: 'create_invoice',
          description:
            'Create an invoice in Crater for a customer. Crater finds or creates the customer by name. Prices are in whole dollars. Defaults to a DRAFT invoice unless status is given.',
          parameters: {
            type: 'object',
            properties: {
              customer_name: { type: 'string', description: 'Customer/client name' },
              customer_email: { type: 'string', description: 'Optional email for a new customer' },
              items: {
                type: 'array',
                description: 'Line items. For a simple "$X for <desc>" request, use one item with quantity 1.',
                items: lineItemSchema,
              },
              notes: { type: 'string' },
              status: {
                type: 'string',
                enum: [...INVOICE_STATUS_ENUM],
                description: 'Defaults to DRAFT. Only set SENT if the user says it was sent.',
              },
            },
            required: ['customer_name', 'items'],
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'search_customers',
          description: 'Search Crater customers by name/email/phone. Use to confirm a customer exists or disambiguate before invoicing.',
          parameters: {
            type: 'object',
            properties: {
              q: { type: 'string', description: 'Search text (optional; empty lists all)' },
            },
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'list_recent_invoices',
          description: 'List recent invoices from Crater with status, totals, and links.',
          parameters: { type: 'object', properties: {}, additionalProperties: false },
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_invoice',
          description: 'Fetch a single Crater invoice by ID, including line items and customer.',
          parameters: {
            type: 'object',
            properties: {
              invoice_id: { type: 'string', description: 'Crater invoice ID' },
            },
            required: ['invoice_id'],
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'update_invoice',
          description: 'Update invoice status, due date, or notes in Crater.',
          parameters: {
            type: 'object',
            properties: {
              invoice_id: { type: 'string', description: 'Crater invoice ID' },
              status: { type: 'string', enum: [...INVOICE_STATUS_ENUM] },
              due_date: { type: 'string', description: 'YYYY-MM-DD' },
              notes: { type: 'string' },
            },
            required: ['invoice_id'],
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'delete_invoice',
          description: 'Permanently delete a Crater invoice by ID. Use only when the user explicitly asks to delete/remove an invoice.',
          parameters: {
            type: 'object',
            properties: {
              invoice_id: { type: 'string', description: 'Crater invoice ID' },
            },
            required: ['invoice_id'],
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'add_invoice_items',
          description: 'Add line items to an existing Crater invoice. Prices are whole dollars.',
          parameters: {
            type: 'object',
            properties: {
              invoice_id: { type: 'string', description: 'Crater invoice ID' },
              items: { type: 'array', items: lineItemSchema, minItems: 1 },
            },
            required: ['invoice_id', 'items'],
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'search_line_items',
          description: 'Search Crater line-item templates (catalog) by name.',
          parameters: {
            type: 'object',
            properties: {
              q: { type: 'string', description: 'Optional search text' },
            },
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'record_payment',
          description:
            'Record an offline payment in Crater for a customer. May return needs_selection if customer, invoice, or payment_mode is ambiguous — re-call with specifics.',
          parameters: {
            type: 'object',
            properties: {
              customer_name: { type: 'string' },
              amount: { type: 'number', description: 'Payment amount in whole dollars' },
              payment_mode: { type: 'string', enum: [...PAYMENT_MODE_ENUM] },
              payment_date: { type: 'string', description: 'YYYY-MM-DD; defaults to today' },
              notes: { type: 'string' },
              invoice_id: { type: 'integer', description: 'Apply payment to this invoice when multiple are open' },
            },
            required: ['customer_name', 'amount'],
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'list_recurring_invoices',
          description: 'List recurring invoices with schedule and customer info.',
          parameters: {
            type: 'object',
            properties: {
              status: { type: 'string', enum: [...RECURRING_STATUS_ENUM], description: 'Optional filter' },
            },
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'create_recurring_invoice',
          description:
            'Create a recurring invoice for an existing Crater customer (defaults to annual hosting template).',
          parameters: {
            type: 'object',
            properties: {
              customer_name: { type: 'string' },
              starts_at: { type: 'string', description: 'YYYY-MM-DD' },
              frequency: { type: 'string', description: 'Cron expression, e.g. 0 0 1 4 *' },
              send_automatically: { type: 'boolean' },
            },
            required: ['customer_name'],
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'repair_invoice_numbers',
          description:
            'Admin repair: fix sequence numbers and totals on invoices created by older integrations. Defaults to dry_run=true.',
          parameters: {
            type: 'object',
            properties: {
              dry_run: { type: 'boolean', description: 'Default true — set false to apply fixes' },
              only: { type: 'string', enum: ['numbers', 'totals', 'all'] },
            },
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'repair_payment_numbers',
          description: 'Admin repair: fix payment sequence numbers. Defaults to dry_run=true.',
          parameters: {
            type: 'object',
            properties: {
              dry_run: { type: 'boolean', description: 'Default true — set false to apply fixes' },
            },
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'reset_invoices',
          description:
            'DESTRUCTIVE: wipe all invoices/payments for the company. Requires confirm=YES_DELETE_EVERYTHING. Use dry_run first.',
          parameters: {
            type: 'object',
            properties: {
              confirm: {
                type: 'string',
                description: 'Must be exactly YES_DELETE_EVERYTHING',
              },
              dry_run: { type: 'boolean', description: 'Default false when confirming; set true to preview counts' },
            },
            required: ['confirm'],
            additionalProperties: false,
          },
        },
      }
    );
  }

  if (isBraveConfigured()) {
    base.push({
      type: 'function',
      function: {
        name: 'brave_search',
        description:
          'Search the web via Brave. Use to look up businesses, websites, people, or any public info.',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query' },
          },
          required: ['query'],
          additionalProperties: false,
        },
      },
    });
  }

  return base;
}

/** Export full tool config as JSON (for assistant updates / docs). */
export function exportToolConfigJson(): string {
  return JSON.stringify(buildTools(), null, 2);
}

function parseLineItems(raw: unknown): Array<{ name: string; description?: string; quantity: number; price: number }> {
  const items = Array.isArray(raw) ? raw : [];
  return items
    .filter((i) => i && typeof i === 'object' && typeof (i as { price?: unknown }).price === 'number')
    .map((i) => {
      const row = i as { name?: string; description?: string; quantity?: number; price: number };
      return {
        name: (row.name ?? 'Service').trim() || 'Service',
        description: row.description,
        quantity: typeof row.quantity === 'number' && row.quantity > 0 ? row.quantity : 1,
        price: row.price,
      };
    });
}

function parsePortalFields(raw: unknown): ClientPortalField[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const fields = raw
    .filter((f) => f && typeof f === 'object')
    .map((f) => {
      const row = f as { label?: unknown; value?: unknown };
      return { label: String(row.label ?? '').trim(), value: String(row.value ?? '').trim() };
    })
    .filter((f) => f.label && f.value);
  return fields;
}

function parsePortalData(raw: unknown): ClientDataEntry[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  return raw
    .filter((e) => e && typeof e === 'object')
    .map((e) => {
      const row = e as Record<string, unknown>;
      const entry: ClientDataEntry = { label: str(row.label) };
      const value = str(row.value);
      const username = str(row.username);
      const password = str(row.password);
      const url = str(row.url);
      if (value) entry.value = value;
      if (username) entry.username = username;
      if (password) entry.password = password;
      if (url) entry.url = url;
      return entry;
    })
    .filter((e) => e.label && (e.value || e.username || e.password || e.url));
}

/**
 * Resolve a portal tool's target to a single contact uid. Accepts an explicit
 * uid, or fuzzy-resolves a name/email/phone. Returns a needs_selection payload
 * (as a JSON string) when the match is ambiguous so the caller can confirm.
 */
async function resolvePortalTarget(args: {
  uid?: unknown;
  name?: unknown;
  email?: unknown;
  phone?: unknown;
}): Promise<{ ok: true; uid: string } | { ok: false; payload: string }> {
  const uid = typeof args.uid === 'string' ? args.uid.trim() : '';
  if (uid) return { ok: true, uid };

  const name = typeof args.name === 'string' ? args.name.trim() : '';
  const email = typeof args.email === 'string' ? args.email.trim() : '';
  const phone = typeof args.phone === 'string' ? args.phone.trim() : '';
  if (!name && !email && !phone) {
    return { ok: false, payload: JSON.stringify({ error: 'Provide a uid, or a name/email/phone to resolve.' }) };
  }

  const resolved = await resolveContact({ name, email, phone });
  if (!resolved.ok) {
    return { ok: false, payload: JSON.stringify({ error: resolved.error, status: resolved.status }) };
  }
  const data = resolved.data as {
    match?: string;
    contact?: { uid?: string; name?: string };
    candidates?: Array<{ uid?: string; name?: string; score?: number }>;
  };
  if ((data.match === 'exact' || data.match === 'likely') && data.contact?.uid) {
    return { ok: true, uid: data.contact.uid };
  }
  return {
    ok: false,
    payload: JSON.stringify({
      needs_selection: true,
      reason: data.match === 'none' ? 'no_match' : 'ambiguous',
      match: data.match ?? 'none',
      candidates: (data.candidates ?? []).map((c) => ({ uid: c.uid, name: c.name, score: c.score })),
      hint: 'Re-call with an exact uid from candidates (or confirm the name).',
    }),
  };
}

function workExtrasFromArgs(args: Record<string, unknown>, existing?: {
  priority?: WorkPriority;
  due_date?: string | null;
  value?: number | null;
  tags?: string[];
  source?: string;
}) {
  const priorityRaw = args.priority != null ? String(args.priority).trim().toLowerCase() : undefined;
  const priority = priorityRaw && WORK_PRIORITIES.includes(priorityRaw as WorkPriority)
    ? (priorityRaw as WorkPriority)
    : existing?.priority;

  const due_date = args.due_date != null
    ? String(args.due_date).trim().slice(0, 10) || null
    : existing?.due_date ?? null;

  const value = args.value != null ? Number(args.value) : existing?.value ?? null;

  let tags: string[] | undefined;
  if (args.tags != null) {
    tags = Array.isArray(args.tags)
      ? (args.tags as unknown[]).map(String).map((t) => t.trim()).filter(Boolean)
      : String(args.tags).split(',').map((t) => t.trim()).filter(Boolean);
  } else {
    tags = existing?.tags;
  }

  const source = args.source != null
    ? String(args.source).trim()
    : existing?.source ?? '';

  return { priority, due_date, value, tags: tags ?? [], source };
}

export async function runTool(name: string, argsJson: string): Promise<string> {
  try {
    const args = JSON.parse(argsJson) as Record<string, unknown>;

    if (name === 'list_knowledge') {
      const entries = await storeListKnowledge();
      return JSON.stringify({
        files: entries.map((e) => ({
          slug: e.slug,
          title: e.title,
          preview: e.preview,
          source: e.source,
          ...(e.tags?.length ? { tags: e.tags } : {}),
          ...(e.updated_at ? { updated_at: e.updated_at } : {}),
        })),
      });
    }
    if (name === 'read_knowledge') {
      const slug = String(args.slug ?? '').trim();
      if (!slug) return JSON.stringify({ error: 'missing slug' });
      const doc = await storeReadKnowledge(slug);
      if (!doc) {
        const all = await storeListKnowledge();
        return JSON.stringify({ error: 'unknown slug', known: all.map((e) => e.slug) });
      }
      const cap = 14_000;
      const content = doc.content.length > cap ? `${doc.content.slice(0, cap)}\n\n…(truncated)` : doc.content;
      return JSON.stringify({ slug: doc.slug, title: doc.title, content, source: doc.source });
    }
    if (name === 'search_knowledge') {
      const query = String(args.query ?? '').trim();
      if (!query) return JSON.stringify({ error: 'missing query' });
      const results = await storeSearchKnowledge(query);
      return JSON.stringify({ results, count: results.length });
    }
    if (name === 'list_work') {
      const statusRaw = String(args.status ?? '').trim().toLowerCase();
      const status = WORK_STATUSES.includes(statusRaw as WorkStatus)
        ? (statusRaw as WorkStatus)
        : undefined;
      const jobs = await storeListWork({
        contact_uid: typeof args.contact_uid === 'string' ? args.contact_uid : undefined,
        status,
        q: typeof args.q === 'string' ? args.q : undefined,
      });
      return JSON.stringify({ jobs, count: jobs.length });
    }
    if (name === 'read_work') {
      const slug = String(args.slug ?? '').trim();
      if (!slug) return JSON.stringify({ error: 'missing slug' });
      const doc = await storeReadWork(slug);
      if (!doc) {
        const known = (await storeListWork()).map((j) => j.slug);
        return JSON.stringify({ error: 'unknown slug', known });
      }
      const cap = 14_000;
      const body = doc.body.length > cap ? `${doc.body.slice(0, cap)}\n\n…(truncated)` : doc.body;
      return JSON.stringify({
        slug: doc.slug,
        title: doc.title,
        client: doc.client,
        contact_uid: doc.contact_uid,
        contact_name: doc.contact_name,
        status: doc.status,
        priority: doc.priority,
        due_date: doc.due_date,
        value: doc.value,
        tags: doc.tags,
        source: doc.source,
        record_origin: doc.record_origin,
        created: doc.created,
        updated: doc.updated,
        body,
      });
    }
    if (name === 'create_work') {
      const title = String(args.title ?? '').trim();
      const client = String(args.client ?? '').trim();
      const body = String(args.body ?? '').trim();
      const statusRaw = String(args.status ?? '').trim().toLowerCase();
      const status = WORK_STATUSES.includes(statusRaw as WorkStatus)
        ? (statusRaw as WorkStatus)
        : undefined;

      let slug = String(args.slug ?? '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9._-]/g, '-');
      if (!slug && title) slug = slugFromTitle(title);

      if (!title) return JSON.stringify({ error: 'title is required' });
      if (!client) return JSON.stringify({ error: 'client is required' });
      if (!slug || !isSafeWorkSlug(slug)) return JSON.stringify({ error: 'invalid slug' });
      if (await storeReadWork(slug)) return JSON.stringify({ error: 'slug already exists', slug });

      const result = await storeWriteWork(slug, {
        title,
        client,
        status,
        body,
        record_origin: 'agent',
        ...workExtrasFromArgs(args),
      });
      if (!result.ok) return JSON.stringify({ error: result.error });
      const doc = result.doc;
      return JSON.stringify({
        ok: true,
        slug: doc.slug,
        title: doc.title,
        client: doc.client,
        contact_uid: doc.contact_uid,
        contact_name: doc.contact_name,
        status: doc.status,
      });
    }
    if (name === 'update_work') {
      const slug = String(args.slug ?? '').trim();
      if (!slug || !isSafeWorkSlug(slug)) return JSON.stringify({ error: 'invalid slug' });

      const existing = await storeReadWork(slug);
      if (!existing) {
        const known = (await storeListWork()).map((j) => j.slug);
        return JSON.stringify({ error: 'not found', known });
      }

      const title = args.title != null ? String(args.title).trim() : existing.title;
      const client =
        args.client != null ? String(args.client).trim() : existing.client || existing.contact_name;
      const body = args.body != null ? String(args.body).trim() : existing.body;
      const statusRaw = args.status != null ? String(args.status).trim().toLowerCase() : existing.status;
      const status = WORK_STATUSES.includes(statusRaw as WorkStatus)
        ? (statusRaw as WorkStatus)
        : existing.status;

      if (!title) return JSON.stringify({ error: 'title is required' });
      if (!client) return JSON.stringify({ error: 'client is required' });

      const extras = workExtrasFromArgs(args, existing);

      const result = await storeWriteWork(slug, {
        title,
        client,
        status,
        body,
        record_origin: existing.record_origin,
        priority: extras.priority,
        due_date: args.due_date != null ? extras.due_date : undefined,
        value: args.value != null ? extras.value : undefined,
        tags: args.tags != null ? extras.tags : undefined,
        source: args.source != null ? extras.source : undefined,
      });
      if (!result.ok) return JSON.stringify({ error: result.error });
      const doc = result.doc;
      return JSON.stringify({
        ok: true,
        slug: doc.slug,
        title: doc.title,
        client: doc.client,
        contact_uid: doc.contact_uid,
        contact_name: doc.contact_name,
        status: doc.status,
        updated: doc.updated,
      });
    }
    if (name === 'delete_work') {
      const slug = String(args.slug ?? '').trim();
      if (!slug || !isSafeWorkSlug(slug)) return JSON.stringify({ error: 'invalid slug' });
      if (!(await storeDeleteWork(slug))) {
        const known = (await storeListWork()).map((j) => j.slug);
        return JSON.stringify({ error: 'not found', known });
      }
      return JSON.stringify({ ok: true, slug, deleted: true });
    }
    if (name === 'write_knowledge') {
      const slug = String(args.slug ?? '').trim().toLowerCase().replace(/[^a-z0-9._-]/g, '-');
      const title = String(args.title ?? '').trim();
      const content = String(args.content ?? '').trim();
      const tags = Array.isArray(args.tags) ? (args.tags as unknown[]).map(String) : [];
      if (!slug || !title || !content) return JSON.stringify({ error: 'slug, title, and content are required' });
      const result = await storeWriteKnowledge({ slug, title, content, tags, source: 'bot' });
      if (!result.ok) return JSON.stringify({ error: result.error });
      return JSON.stringify({ ok: true, slug, title, db: isKnowledgeDbConfigured() });
    }
    if (name === 'list_email_inbox') {
      const q = String(args.q ?? '').trim().toLowerCase();
      const includeJunk = args.include_junk === true;
      const limitRaw = Number(args.limit);
      const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.floor(limitRaw), 1), 100) : 20;
      let events = await storeListEmailInbox(Math.max(limit, 100), { hideJunk: !includeJunk });
      if (q) {
        events = events.filter((e) => {
          const hay = `${e.from} ${e.subject} ${e.summary} ${e.bodySnippet}`.toLowerCase();
          return hay.includes(q);
        });
      }
      events = events.slice(0, limit);
      return JSON.stringify({
        count: events.length,
        events: events.map((e) => ({
          id: e.id,
          from: e.from,
          subject: e.subject,
          category: e.category,
          summary: e.summary,
          receivedAt: e.receivedAt,
        })),
      });
    }
    if (name === 'mark_email_junk') {
      const emailId = String(args.email_id ?? '').trim();
      if (!emailId) return JSON.stringify({ error: 'email_id is required' });
      const event = await storeUpdateEmailInbox(emailId, {
        category: 'junk',
        action: 'junk',
        status: 'JUNK',
      });
      if (!event) return JSON.stringify({ error: 'not found', email_id: emailId });
      return JSON.stringify({ ok: true, email_id: emailId, category: event.category, action: event.action });
    }
    if (name === 'delete_email') {
      const emailId = String(args.email_id ?? '').trim();
      if (!emailId) return JSON.stringify({ error: 'email_id is required' });
      const deleted = await storeDeleteEmailInbox(emailId);
      if (!deleted) return JSON.stringify({ error: 'not found', email_id: emailId });
      return JSON.stringify({ ok: true, email_id: emailId, deleted: true });
    }
    if (name === 'create_email_filter_rule') {
      const sender = String(args.sender ?? '').trim().toLowerCase();
      const extra = Array.isArray(args.phrases)
        ? (args.phrases as unknown[]).map((p) => String(p).trim()).filter(Boolean)
        : [];
      const phrases = [...new Set([...(sender ? [sender] : []), ...extra])];
      if (!phrases.length) return JSON.stringify({ error: 'sender or phrases required' });

      const config = await storeListEmailRules();
      const needle = phrases[0].toLowerCase();
      const existing = config.rules.find(
        (r) =>
          r.enabled &&
          r.fields.includes('from' as RuleField) &&
          r.phrases.some((p) => p.toLowerCase() === needle),
      );
      if (existing) {
        return JSON.stringify({
          ok: true,
          skipped: true,
          reason: 'rule already exists',
          rule: { id: existing.id, title: existing.title, phrases: existing.phrases },
        });
      }

      const title =
        String(args.title ?? '').trim() ||
        (sender ? `Block sender ${sender}` : `Block: ${phrases[0].slice(0, 40)}`);
      const rule = await storeCreateEmailRule({
        title,
        status: 'DELETE',
        description: 'Auto-junk — created by agent from inbox triage',
        phrases,
        matchMode: 'any',
        fields: sender ? (['from'] as RuleField[]) : (['subject', 'body'] as RuleField[]),
        notify: false,
        enabled: true,
      });
      if (!rule) return JSON.stringify({ error: 'failed to create rule' });
      return JSON.stringify({
        ok: true,
        rule: { id: rule.id, title: rule.title, status: rule.status, phrases: rule.phrases, fields: rule.fields },
      });
    }
    if (name === 'run_dev_task') {
      const task = String(args.task ?? '').trim();
      if (!isDevTaskName(task)) {
        return JSON.stringify({ error: 'invalid task', allowed: DEV_TASK_NAMES });
      }
      const out = await runDevTask(task);
      if (!out.ok) return JSON.stringify({ error: out.error });
      return JSON.stringify(out);
    }
    if (name === 'list_railway_domains') {
      if (!isRailwayConfigured()) {
        return JSON.stringify({ error: 'RAILWAY_API_TOKEN is not set on this service' });
      }
      const result = await railwayListProjectNetworking({
        project: typeof args.project === 'string' ? args.project : undefined,
        environment: typeof args.environment === 'string' ? args.environment : undefined,
        service: typeof args.service === 'string' ? args.service : undefined,
      });
      if (!result.ok) return JSON.stringify({ error: result.error });
      return JSON.stringify({
        ok: true,
        summary: formatRailwayNetworkingSummary(result.data),
        data: result.data,
      });
    }
    if (name === 'list_kinsta_sites') {
      if (!isKinstaConfigured()) {
        return JSON.stringify({ error: 'KINSTA_API_KEY and KINSTA_COMPANY_ID must be set on this service' });
      }
      const siteId = typeof args.site_id === 'string' ? args.site_id.trim() : '';
      if (siteId) {
        const one = await kinstaGetSite(siteId);
        if (!one.ok) return JSON.stringify({ error: one.error });
        return JSON.stringify({
          ok: true,
          summary: formatKinstaSitesSummary([one.site]),
          sites: [one.site],
        });
      }
      const includeEnvironments = args.include_environments !== false;
      const result = await kinstaListSites({ includeEnvironments });
      if (!result.ok) return JSON.stringify({ error: result.error });
      return JSON.stringify({
        ok: true,
        company_id: result.company_id,
        summary: formatKinstaSitesSummary(result.sites),
        sites: result.sites,
      });
    }
    if (name === 'clear_kinsta_cache') {
      if (!isKinstaConfigured()) {
        return JSON.stringify({ error: 'KINSTA_API_KEY and KINSTA_COMPANY_ID must be set on this service' });
      }
      const environmentId = String(args.environment_id ?? '').trim();
      const result = await kinstaClearCache(environmentId);
      if (!result.ok) return JSON.stringify({ error: result.error });
      return JSON.stringify({
        ok: true,
        operation_id: result.operation_id,
        dry_run: result.dry_run ?? false,
        hint: 'Poll get_kinsta_operation until status is has_completed or has_failed.',
      });
    }
    if (name === 'get_kinsta_operation') {
      if (!isKinstaConfigured()) {
        return JSON.stringify({ error: 'KINSTA_API_KEY and KINSTA_COMPANY_ID must be set on this service' });
      }
      const operationId = String(args.operation_id ?? '').trim();
      const result = await kinstaGetOperation(operationId);
      if (!result.ok) return JSON.stringify({ error: result.error });
      return JSON.stringify({ ok: true, status: result.status, data: result.data });
    }
    if (name === 'get_git_status') {
      const result = await getGitStatus({
        branch: typeof args.branch === 'string' && args.branch.trim() ? args.branch.trim() : undefined,
        limit: typeof args.limit === 'number' ? args.limit : undefined,
      });
      if (!result.ok) return JSON.stringify({ error: result.error });
      return JSON.stringify(result.data);
    }
    if (name === 'get_recent_commits') {
      const result = await getRecentCommits({
        branch: typeof args.branch === 'string' && args.branch.trim() ? args.branch.trim() : undefined,
        limit: typeof args.limit === 'number' ? args.limit : undefined,
        with_files: args.with_files === true,
      });
      if (!result.ok) return JSON.stringify({ error: result.error });
      return JSON.stringify(result.data);
    }
    if (name === 'check_deployment_status') {
      const result = await checkDeploymentStatus();
      if (!result.ok) return JSON.stringify({ error: result.error });
      return JSON.stringify(result.data);
    }
    if (name === 'list_open_branches') {
      const result = await listOpenBranches();
      if (!result.ok) return JSON.stringify({ error: result.error });
      return JSON.stringify(result.data);
    }
    if (name === 'run_terminal_command') {
      const command = String(args.command ?? '').trim();
      if (!command) return JSON.stringify({ error: 'command is required' });
      const result = await runSafeShellCommand(command);
      if (!result.ok) return JSON.stringify({ error: result.error, allowed: describeSafeShell() });
      return JSON.stringify(result);
    }
    if (name === 'create_github_branch') {
      const result = await githubCreateBranch({
        repo: typeof args.repo === 'string' ? args.repo : undefined,
        branch: String(args.branch ?? '').trim(),
        from_branch: typeof args.from_branch === 'string' ? args.from_branch : undefined,
      });
      if (!result.ok) return JSON.stringify({ error: result.error });
      return JSON.stringify(result.data);
    }
    if (name === 'write_github_file') {
      const result = await githubWriteFile({
        repo: typeof args.repo === 'string' ? args.repo : undefined,
        branch: String(args.branch ?? '').trim(),
        path: String(args.path ?? '').trim(),
        content: String(args.content ?? ''),
        message: String(args.message ?? '').trim(),
      });
      if (!result.ok) return JSON.stringify({ error: result.error });
      return JSON.stringify(result.data);
    }
    if (name === 'create_pull_request') {
      const result = await githubCreatePullRequest({
        repo: typeof args.repo === 'string' ? args.repo : undefined,
        head: String(args.head ?? '').trim(),
        base: typeof args.base === 'string' && args.base.trim() ? args.base.trim() : undefined,
        title: String(args.title ?? '').trim(),
        body: typeof args.body === 'string' ? args.body : undefined,
      });
      if (!result.ok) return JSON.stringify({ error: result.error });
      return JSON.stringify(result.data);
    }
    if (name === 'resolve_contact') {
      const result = await resolveContact({
        name: args.name as string | undefined,
        email: args.email as string | undefined,
        phone: args.phone as string | undefined,
      });
      if (!result.ok) return JSON.stringify({ error: result.error, status: result.status });
      const payload = result.data as Record<string, unknown>;
      const contact = payload.contact as Record<string, unknown> | undefined;
      const uid = contact?.uid != null ? String(contact.uid) : '';
      const work_jobs = uid ? await storeListWork({ contact_uid: uid }) : [];
      return JSON.stringify({ ...payload, work_jobs });
    }
    if (name === 'list_contacts') {
      const result = await listContacts({
        q: typeof args.q === 'string' ? args.q : undefined,
        limit: typeof args.limit === 'number' ? args.limit : undefined,
      });
      if (!result.ok) return JSON.stringify({ error: result.error, status: result.status });
      return JSON.stringify({
        total: result.data.total,
        contacts: result.data.contacts.slice(0, 50).map((c) => ({
          uid: c.uid,
          name: c.name,
          email: c.email ?? null,
          phone: c.phone ?? null,
          company: c.company ?? null,
          portal_url: clientPortalUrl(c.uid),
        })),
      });
    }
    if (name === 'create_contact') {
      const contactName = String(args.name ?? '').trim();
      if (!contactName) return JSON.stringify({ error: 'name is required' });
      const result = await createContact({
        name: contactName,
        email: typeof args.email === 'string' ? args.email : undefined,
        phone: typeof args.phone === 'string' ? args.phone : undefined,
        company: typeof args.company === 'string' ? args.company : undefined,
        notes: typeof args.notes === 'string' ? args.notes : undefined,
      });
      if (!result.ok) return JSON.stringify({ error: result.error, status: result.status });
      return JSON.stringify({
        success: true,
        uid: result.data.uid,
        name: result.data.name,
        email: result.data.email ?? null,
        phone: result.data.phone ?? null,
        portal_url: clientPortalUrl(result.data.uid),
      });
    }
    if (name === 'update_contact') {
      const explicitUid = typeof args.uid === 'string' ? args.uid.trim() : '';
      const lookupName = typeof args.name === 'string' ? args.name.trim() : '';
      const target = explicitUid
        ? { ok: true as const, uid: explicitUid }
        : await resolvePortalTarget({
            name: lookupName || undefined,
            email: lookupName ? undefined : args.email,
            phone: lookupName ? undefined : args.phone,
          });
      if (!target.ok) return target.payload;

      const patch: {
        name?: string;
        email?: string;
        phone?: string;
        company?: string;
        notes?: string;
      } = {};
      if (typeof args.new_name === 'string' && args.new_name.trim()) patch.name = args.new_name.trim();
      if (typeof args.email === 'string') patch.email = args.email;
      if (typeof args.phone === 'string') patch.phone = args.phone;
      if (typeof args.company === 'string') patch.company = args.company;
      if (typeof args.notes === 'string') patch.notes = args.notes;
      if (!Object.keys(patch).length) {
        return JSON.stringify({
          error: 'Provide at least one field to update (new_name, email, phone, company, notes).',
        });
      }

      const result = await updateContact(target.uid, patch);
      if (!result.ok) return JSON.stringify({ error: result.error, status: result.status });
      return JSON.stringify({
        success: true,
        uid: result.data.uid,
        name: result.data.name,
        email: result.data.email ?? null,
        phone: result.data.phone ?? null,
        company: result.data.company ?? null,
        notes: result.data.notes ?? null,
        portal_url: clientPortalUrl(result.data.uid),
      });
    }
    if (name === 'delete_contact') {
      const uid = typeof args.uid === 'string' ? args.uid.trim() : '';
      if (!uid) return JSON.stringify({ error: 'uid is required (no fuzzy delete).' });

      const blockers = await getContactDeleteBlockers(uid);
      if (!blockers.ok) return JSON.stringify({ error: blockers.error });

      const force = args.force === true;
      const { name: contactName, project_count, invoice_count, estimate_count, projects } = blockers.data;
      if ((project_count > 0 || invoice_count > 0 || estimate_count > 0) && !force) {
        const projectWarn = project_count > 0
          ? `"${contactName}" has ${project_count} attached project(s). Deleting this client will permanently delete all attached projects.`
          : null;
        const billingReason =
          invoice_count > 0 && estimate_count > 0
            ? 'linked_invoices_and_estimates'
            : estimate_count > 0
              ? 'linked_estimates'
              : 'linked_invoices';
        return JSON.stringify({
          blocked: true,
          reason: project_count > 0 ? 'linked_projects' : billingReason,
          uid,
          contact_name: contactName,
          project_count,
          job_count: project_count,
          invoice_count,
          estimate_count,
          projects,
          warning: projectWarn,
          hint: project_count > 0
            ? 'Warn the user that all attached projects will be deleted, then re-call delete_contact with force:true to confirm.'
            : 'Warn the user about linked Crater invoices/estimates, then re-call delete_contact with force:true to confirm.',
        });
      }

      const result = await executeContactDelete(uid, { force, permanent: force });
      if (!result.ok) return JSON.stringify({ error: result.error, status: result.status });
      const verb = force ? 'Permanently deleted' : result.already_archived ? 'Already removed' : 'Archived';
      return JSON.stringify({
        success: true,
        message: `${verb} contact "${contactName}"${result.deleted_projects ? ` and ${result.deleted_projects} attached project(s)` : ''}.`,
        uid,
        contact_name: contactName,
        deleted_projects: result.deleted_projects,
        permanent: force,
        already_archived: result.already_archived ?? false,
      });
    }
    if (name === 'set_client_portal') {
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
    if (name === 'get_client_portal') {
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
    if (name === 'get_client_submit_link') {
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
    if (name === 'send_client_portal') {
      const target = await resolvePortalTarget(args);
      if (!target.ok) return target.payload;

      const current = await getContact(target.uid);
      if (!current.ok) return JSON.stringify({ error: current.error, status: current.status });
      const c = current.data;

      const portal = extractPortal(c);
      if (portal && portal.enabled === false) {
        return JSON.stringify({ error: 'This client’s page is hidden (enabled:false). Re-enable it before sending.' });
      }

      const url = clientPortalUrl(target.uid);
      const firstName = (c.firstName || c.name || '').trim().split(/\s+/)[0] || 'there';
      const intro = typeof args.message === 'string' && args.message.trim() ? `${args.message.trim()}\n\n` : '';

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

      const sent: Record<string, unknown> = {};
      if (useEmail) {
        const subject = c.company ? `Your client page — ${c.company}` : 'Your client page';
        const introLines = intro ? [intro.trim()] : [];
        const text =
          `${intro}Hi ${firstName},\n\n` +
          `Here's your personal client page — your details and any outstanding invoices live here:\n\n${url}\n\n` +
          `Tip: open it on your iPhone and tap Share → Add to Home Screen for one-tap access.`;
        const html = await brandedEmailHtml({
          firstName,
          paragraphs: [
            ...introLines,
            "Here's your personal client page — your details and any outstanding invoices live here:",
          ],
          cta: { label: 'Open your client page', url },
          note: 'Tip: open it on your iPhone and tap Share → Add to Home Screen for one-tap access.',
        });
        const r = await sendEmail({ to: c.email as string, subject, text, html });
        sent.email = r.ok ? { ok: true, to: c.email, id: r.id } : { ok: false, error: r.error };
      }
      if (useSms) {
        const body = `${intro}Hi ${firstName}, here's your client page: ${url}`;
        const r = await sendSms({ to: c.phone as string, body });
        sent.sms = r.ok ? { ok: true, to: c.phone, id: r.id } : { ok: false, error: r.error };
      }

      const anyOk = Object.values(sent).some((v) => (v as { ok?: boolean }).ok);
      return JSON.stringify({ success: anyOk, uid: target.uid, name: c.name, url, sent });
    }
    if (name === 'get_site_monitoring') {
      const target = await resolvePortalTarget(args);
      if (!target.ok) return target.payload;

      const current = await getContact(target.uid);
      if (!current.ok) return JSON.stringify({ error: current.error, status: current.status });
      const portal = extractPortal(current.data);
      const meta = portal?.siteMonitoring;
      const siteUrl = portalSiteUrl(portal);
      const watchUuid = meta?.watchUuid?.trim();

      let watch: Record<string, unknown> | null = null;
      if (watchUuid) {
        const w = await cdGetWatch(watchUuid);
        if (w.ok) {
          watch = {
            uuid: w.watch.uuid,
            url: w.watch.url,
            title: w.watch.title,
            paused: w.watch.paused,
            last_checked: w.watch.last_checked,
            last_changed: w.watch.last_changed,
          };
        }
      }

      return JSON.stringify({
        uid: target.uid,
        name: current.data.name,
        site_url: siteUrl,
        monitoring_enabled: meta?.enabled !== false,
        watch_uuid: watchUuid ?? null,
        watch,
      });
    }
    if (name === 'set_site_monitoring') {
      const target = await resolvePortalTarget(args);
      if (!target.ok) return target.payload;

      const current = await getContact(target.uid);
      if (!current.ok) return JSON.stringify({ error: current.error, status: current.status });
      const existing = extractPortal(current.data) ?? {};
      const enabled = typeof args.enabled === 'boolean' ? args.enabled : true;
      const next: ClientPortal = {
        ...existing,
        siteMonitoring: {
          ...(existing.siteMonitoring ?? {}),
          enabled,
        },
      };
      const saved = await setContactPortal(target.uid, next);
      if (!saved.ok) return JSON.stringify({ error: saved.error, status: saved.status });
      return JSON.stringify({
        success: true,
        uid: target.uid,
        name: current.data.name,
        monitoring_enabled: enabled,
        site_url: portalSiteUrl(next),
        watch_uuid: next.siteMonitoring?.watchUuid ?? null,
      });
    }
    if (name === 'recheck_site_monitoring') {
      const target = await resolvePortalTarget(args);
      if (!target.ok) return target.payload;

      const current = await getContact(target.uid);
      if (!current.ok) return JSON.stringify({ error: current.error, status: current.status });
      const portal = extractPortal(current.data);
      const watchUuid = portal?.siteMonitoring?.watchUuid?.trim();
      if (!watchUuid) {
        return JSON.stringify({ error: 'No ChangeDetection watch for this client (set a Site URL field first).' });
      }
      const recheck = await cdRecheckWatch(watchUuid);
      if (!recheck.ok) return JSON.stringify({ error: recheck.error });
      return JSON.stringify({ success: true, uid: target.uid, watch_uuid: watchUuid });
    }
    if (name === 'list_bookings') {
      const upcoming = args.upcoming !== false;
      const limit = typeof args.limit === 'number' ? Math.min(Math.max(args.limit, 1), 50) : 15;
      const result = await bookingList({ upcoming, status: 'ACCEPTED', limit });
      if (!result.ok) return JSON.stringify({ error: result.error, status: result.status });
      return JSON.stringify({
        count: result.data.bookings.length,
        upcoming,
        bookings: result.data.bookings.map((b) => ({
          uid: b.uid,
          summary: formatBookingLine(b),
          startTime: b.startTime,
          attendee: b.attendee,
          email: b.email,
          location: b.location || null,
          status: b.status,
        })),
      });
    }
    if (name === 'get_booking') {
      const uid = String(args.uid ?? '').trim();
      if (!uid) return JSON.stringify({ error: 'uid is required' });
      const result = await bookingGet(uid);
      if (!result.ok) return JSON.stringify({ error: result.error, status: result.status });
      const b = result.data.booking;
      return JSON.stringify({
        booking: {
          ...b,
          summary: formatBookingLine(b),
          calcom_admin: calcomWebappUrl() ? `${calcomWebappUrl()}/bookings/${uid}` : null,
        },
      });
    }
    if (name === 'get_booking_link') {
      const slug = typeof args.event_slug === 'string' && args.event_slug.trim()
        ? args.event_slug.trim()
        : '30min';
      const types = await bookingEventTypes();
      const eventTypes = types.ok ? types.data.eventTypes : [];
      const calUrl = publicBookingPageUrl(slug);
      return JSON.stringify({
        event_slug: slug,
        calcom_url: calUrl,
        form_url: '/form/schedule',
        event_types: eventTypes.map((e) => ({ slug: e.slug, title: e.title, length: e.length })),
        hint: 'Share calcom_url for direct booking or form_url for the conversational scheduler on reave.app.',
      });
    }
    if (name === 'create_invoice') {
      const items = parseLineItems(args.items);
      if (!String(args.customer_name ?? '').trim()) return JSON.stringify({ error: 'customer_name is required' });
      if (!items.length) return JSON.stringify({ error: 'at least one item with a price is required' });
      const result = await craterCreateInvoice({
        customerName: String(args.customer_name),
        customerEmail: args.customer_email as string | undefined,
        items,
        notes: args.notes as string | undefined,
        status: args.status as (typeof INVOICE_STATUS_ENUM)[number] | undefined,
      });
      if (!result.ok) return JSON.stringify({ error: result.error, status: result.status });
      return JSON.stringify(result.data);
    }
    if (name === 'search_customers') {
      const result = await craterSearchCustomers(String(args.q ?? ''));
      if (!result.ok) return JSON.stringify({ error: result.error, status: result.status });
      return JSON.stringify({ count: result.data.count, customers: result.data.customers?.slice(0, 25) ?? [] });
    }
    if (name === 'list_recent_invoices') {
      const result = await craterListInvoices();
      if (!result.ok) return JSON.stringify({ error: result.error, status: result.status });
      return JSON.stringify({ count: result.data.count, invoices: result.data.invoices?.slice(0, 20) ?? [] });
    }
    if (name === 'get_invoice') {
      const result = await craterGetInvoice(String(args.invoice_id ?? ''));
      if (!result.ok) return JSON.stringify({ error: result.error, status: result.status });
      return JSON.stringify(result.data);
    }
    if (name === 'update_invoice') {
      const result = await craterUpdateInvoice(String(args.invoice_id ?? ''), {
        status: args.status as (typeof INVOICE_STATUS_ENUM)[number] | undefined,
        due_date: args.due_date as string | undefined,
        notes: args.notes as string | undefined,
      });
      if (!result.ok) return JSON.stringify({ error: result.error, status: result.status });
      return JSON.stringify(result.data);
    }
    if (name === 'delete_invoice') {
      const result = await craterDeleteInvoice(String(args.invoice_id ?? ''));
      if (!result.ok) return JSON.stringify({ error: result.error, status: result.status });
      return JSON.stringify(result.data);
    }
    if (name === 'add_invoice_items') {
      const items = parseLineItems(args.items);
      if (!items.length) return JSON.stringify({ error: 'at least one item with a price is required' });
      const result = await craterAddInvoiceItems(String(args.invoice_id ?? ''), items);
      if (!result.ok) return JSON.stringify({ error: result.error, status: result.status });
      return JSON.stringify(result.data);
    }
    if (name === 'search_line_items') {
      const result = await craterSearchLineItems(args.q as string | undefined);
      if (!result.ok) return JSON.stringify({ error: result.error, status: result.status });
      return JSON.stringify({ count: result.data.count, line_items: result.data.line_items?.slice(0, 25) ?? [] });
    }
    if (name === 'record_payment') {
      const result = await craterRecordPayment({
        customerName: String(args.customer_name ?? ''),
        amount: Number(args.amount),
        paymentMode: args.payment_mode as (typeof PAYMENT_MODE_ENUM)[number] | undefined,
        paymentDate: args.payment_date as string | undefined,
        notes: args.notes as string | undefined,
        invoiceId: typeof args.invoice_id === 'number' ? args.invoice_id : undefined,
      });
      if (!result.ok) return JSON.stringify({ error: result.error, status: result.status });
      return JSON.stringify(result.data);
    }
    if (name === 'list_recurring_invoices') {
      const result = await craterListRecurringInvoices(
        args.status as (typeof RECURRING_STATUS_ENUM)[number] | undefined
      );
      if (!result.ok) return JSON.stringify({ error: result.error, status: result.status });
      return JSON.stringify({
        count: result.data.count,
        recurring_invoices: result.data.recurring_invoices?.slice(0, 20) ?? [],
      });
    }
    if (name === 'create_recurring_invoice') {
      const result = await craterCreateRecurringInvoice({
        customerName: String(args.customer_name ?? ''),
        startsAt: args.starts_at as string | undefined,
        frequency: args.frequency as string | undefined,
        sendAutomatically: args.send_automatically as boolean | undefined,
      });
      if (!result.ok) return JSON.stringify({ error: result.error, status: result.status });
      return JSON.stringify(result.data);
    }
    if (name === 'repair_invoice_numbers') {
      const result = await craterRepairInvoiceNumbers({
        dryRun: args.dry_run !== false,
        only: args.only as 'numbers' | 'totals' | 'all' | undefined,
      });
      if (!result.ok) return JSON.stringify({ error: result.error, status: result.status });
      return JSON.stringify(result.data);
    }
    if (name === 'repair_payment_numbers') {
      const result = await craterRepairPaymentNumbers({ dryRun: args.dry_run !== false });
      if (!result.ok) return JSON.stringify({ error: result.error, status: result.status });
      return JSON.stringify(result.data);
    }
    if (name === 'reset_invoices') {
      const result = await craterResetInvoices({
        confirm: String(args.confirm ?? ''),
        dryRun: Boolean(args.dry_run),
      });
      if (!result.ok) return JSON.stringify({ error: result.error, status: result.status });
      return JSON.stringify(result.data);
    }
    if (name === 'brave_search') {
      if (!isBraveConfigured()) {
        return JSON.stringify({ error: 'BRAVE_API_KEY is not set on this service' });
      }
      const query = String(args.query ?? '').trim();
      if (!query) return JSON.stringify({ error: 'missing query' });
      const result = await braveSearch(query);
      if (!result.ok) return JSON.stringify({ error: result.error, status: result.status });
      return formatBraveResults(result);
    }
    if (name === 'fetch_url') {
      const url = String(args.url ?? '').trim();
      if (!url) return JSON.stringify({ error: 'url is required' });
      const result = await fetchUrl(url, args.raw === true);
      if (!result.ok) {
        return JSON.stringify({ error: result.error, ...(result.status_code ? { status_code: result.status_code } : {}) });
      }
      return JSON.stringify(result.data);
    }
    if (name === 'lighthouse_audit') {
      const url = String(args.url ?? '').trim();
      if (!url) return JSON.stringify({ error: 'url is required' });
      const categoryRaw = String(args.category ?? '').trim();
      const strategyRaw = String(args.strategy ?? 'both').trim();
      const result = await lighthouseAudit({
        url,
        category: ['performance', 'accessibility', 'best-practices', 'seo'].includes(categoryRaw)
          ? (categoryRaw as 'performance' | 'accessibility' | 'best-practices' | 'seo')
          : undefined,
        strategy:
          strategyRaw === 'mobile' || strategyRaw === 'desktop' || strategyRaw === 'both'
            ? strategyRaw
            : 'both',
      });
      if (!result.ok) return JSON.stringify({ error: result.error, status: result.status });
      return JSON.stringify({ summary: formatLighthouseResults(result), ...result });
    }
    if (name === 'ssl_check') {
      const url = String(args.url ?? '').trim();
      if (!url) return JSON.stringify({ error: 'url is required' });
      const result = await sslCheck(url);
      if (!result.ok) return JSON.stringify({ error: result.error });
      return JSON.stringify({ ...result, summary: formatSslCheckResults(result) });
    }
    if (name === 'check_links') {
      const url = String(args.url ?? '').trim();
      if (!url) return JSON.stringify({ error: 'url is required' });
      const result = await checkLinks(url, args.follow_internal === true);
      if (!result.ok) return JSON.stringify({ error: result.error });
      return JSON.stringify({ ...result, summary: formatCheckLinksResults(result) });
    }
    if (name === 'dns_check') {
      const domain = String(args.domain ?? '').trim();
      if (!domain) return JSON.stringify({ error: 'domain is required' });
      const result = await dnsCheck(domain);
      if (!result.ok) return JSON.stringify({ error: result.error });
      return JSON.stringify({ ...result, summary: formatDnsCheckResults(result) });
    }

    return JSON.stringify({ error: `unknown tool ${name}` });
  } catch (e) {
    return JSON.stringify({ error: e instanceof Error ? e.message : String(e) });
  }
}
