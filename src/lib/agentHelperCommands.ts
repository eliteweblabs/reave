/**
 * Slash-style helper commands for admin agent chat compose.
 * Server filters by enabled plugins via listEnabledHelperCommands() in agentHelperCommands.server.ts.
 */

export type AgentHelperCommand = {
  slash: string;
  label: string;
  summary: string;
  template: string;
  steps: string[];
  example: string;
  /** Omit or "core" = always available when logged in. */
  feature?: string | 'core';
};

type HelperManifestEntry = {
  slash: string;
  summary: string;
  template: string;
  example: string;
  feature?: string | 'core';
};

function titleFromSlash(slash: string): string {
  const raw = slash.replace(/^\//, '').replace(/-/g, ' ');
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function toCommand(entry: HelperManifestEntry): AgentHelperCommand {
  return {
    slash: entry.slash,
    label: titleFromSlash(entry.slash),
    summary: entry.summary,
    template: entry.template,
    steps: [],
    example: entry.example,
    feature: entry.feature ?? 'core',
  };
}

/** Full catalog — admin can disable via Plugins; chat picker filters this list. */
const HELPER_MANIFEST: HelperManifestEntry[] = [
  // Knowledge
  {
    slash: '/knowledge',
    summary: 'List knowledge docs',
    template: 'List all knowledge entries.',
    example: 'List all knowledge entries.',
  },
  {
    slash: '/search',
    summary: 'Search knowledge',
    template: 'Search knowledge for [topic].',
    example: 'Search knowledge for Stripe billing.',
  },
  {
    slash: '/read',
    summary: 'Read a knowledge doc',
    template: 'Read knowledge entry [slug].',
    example: 'Read knowledge entry billing/crater-billing.',
  },

  // Work / jobs
  {
    slash: '/work',
    summary: 'List or start a job',
    template: 'List open jobs for [client].',
    example: 'List open jobs for Acme Corp.',
  },
  {
    slash: '/job',
    summary: 'Create a new job',
    template: 'Create a job for [client]: [what they need].',
    example: 'Create a job for Acme Corp: redesign homepage.',
  },
  {
    slash: '/job-read',
    summary: 'Read a job by slug',
    template: 'Show me job [slug].',
    example: 'Show me job acme-website-redesign.',
  },

  // Contacts
  {
    slash: '/contact',
    summary: 'Look up a client',
    template: 'Who is [name]? Show their contact details and any open projects.',
    example: 'Who is Northwind Studio?',
  },
  {
    slash: '/contacts',
    summary: 'List all contacts',
    template: 'List my contacts.',
    example: 'List my contacts.',
  },
  {
    slash: '/contact-new',
    summary: 'Add a new contact',
    template: 'Create a contact for [name] with email [email].',
    example: 'Create a contact for Jane Doe with email jane@acme.com.',
  },

  // Email inbox
  {
    slash: '/inbox',
    summary: 'List inbox emails',
    template: 'List recent inbox emails.',
    example: 'List recent inbox emails.',
  },
  {
    slash: '/email',
    summary: 'Read an inbox email',
    template: 'Read inbox email [id or subject].',
    example: 'Read the latest email from Acme Corp.',
  },
  {
    slash: '/rule',
    summary: 'Create an email filter rule',
    template: 'Create an email filter rule for sender [address].',
    example: 'Create an email filter rule for sender noreply@wordpress.com.',
  },

  // Personal todos
  {
    slash: '/todo',
    summary: 'List personal todos',
    template: 'List my open to-dos.',
    example: 'List my open to-dos.',
  },
  {
    slash: '/todo-add',
    summary: 'Add a personal todo',
    template: 'Add to my to-do list: [task].',
    example: 'Add to my to-do list: renew domain for Acme.',
  },

  // Outbound comms & search
  {
    slash: '/send',
    summary: 'Send an email',
    template: 'Email [name] at [address]: [message].',
    example: 'Email Tony at tony@example.com: Your portal link is ready.',
  },
  {
    slash: '/web',
    summary: 'Search the web',
    template: 'Search the web for [query].',
    example: 'Search the web for Northwind Studio Boston.',
  },

  // Client portal (plugin)
  {
    slash: '/portal',
    summary: 'Get a client portal link',
    template: "What's the portal link for [client]?",
    example: "What's the portal link for Acme Corp?",
    feature: 'client_portal',
  },
  {
    slash: '/portal-send',
    summary: 'Send portal link to client',
    template: 'Send the client portal link to [client].',
    example: 'Send the client portal link to Acme Corp.',
    feature: 'client_portal',
  },
  {
    slash: '/portal-set',
    summary: 'Update client portal content',
    template: 'Update [client] portal headline to [headline] and body: [content].',
    example: 'Update Acme portal headline to Your project and body: We are on track for launch.',
    feature: 'client_portal',
  },

  // Billing (plugin)
  {
    slash: '/invoice',
    summary: 'Create a draft Crater invoice',
    template: 'Create a draft invoice for [client name] for $[amount].',
    example: 'Create a draft invoice for Acme Corp for $1,500 for project acme-website-redesign.',
    feature: 'billing',
  },
  {
    slash: '/invoices',
    summary: 'List recent invoices',
    template: 'List my recent Crater invoices.',
    example: 'List my recent Crater invoices.',
    feature: 'billing',
  },
  {
    slash: '/invoice-pay',
    summary: 'Record an invoice payment',
    template: 'Record payment of $[amount] for invoice [number].',
    example: 'Record payment of $1,500 for invoice INV-00042.',
    feature: 'billing',
  },

  // Scheduling / meetings (plugin)
  {
    slash: '/meeting',
    summary: "List today's and upcoming meetings",
    template: "What's on my calendar today and upcoming?",
    example: "What's on my calendar today and upcoming?",
    feature: 'scheduling',
  },
  {
    slash: '/meetings',
    summary: 'List upcoming appointments',
    template: 'List my upcoming meetings.',
    example: 'List my upcoming meetings.',
    feature: 'scheduling',
  },
  {
    slash: '/schedule',
    summary: 'Get booking link to share',
    template: 'Get my Cal.com booking link to share with a client.',
    example: 'Get my Cal.com booking link to share with a client.',
    feature: 'scheduling',
  },

  // Site audits (plugin)
  {
    slash: '/audit',
    summary: 'Run Lighthouse audit on a URL',
    template: 'Run a Lighthouse audit on [url].',
    example: 'Run a Lighthouse audit on https://acme.com.',
    feature: 'site_audits',
  },
  {
    slash: '/fetch',
    summary: 'Fetch and review a webpage',
    template: 'Fetch and summarize [url].',
    example: 'Fetch and summarize https://acme.com.',
    feature: 'site_audits',
  },
  {
    slash: '/ssl',
    summary: 'Check SSL certificate',
    template: 'Check SSL certificate for [domain].',
    example: 'Check SSL certificate for acme.com.',
    feature: 'site_audits',
  },
  {
    slash: '/links',
    summary: 'Check broken links on a site',
    template: 'Check for broken links on [url].',
    example: 'Check for broken links on https://acme.com.',
    feature: 'site_audits',
  },
  {
    slash: '/dns',
    summary: 'DNS and email auth check',
    template: 'Run DNS check for [domain].',
    example: 'Run DNS check for acme.com.',
    feature: 'site_audits',
  },

  // Site monitoring (plugin)
  {
    slash: '/monitor',
    summary: 'Site change monitoring status',
    template: 'What is the change monitoring status for [url]?',
    example: 'What is the change monitoring status for https://acme.com?',
    feature: 'site_monitoring',
  },

  // Uptime (plugin)
  {
    slash: '/uptime',
    summary: 'Uptime monitoring summary',
    template: 'Show uptime monitoring summary.',
    example: 'Show uptime monitoring summary.',
    feature: 'uptime_monitoring',
  },

  // Dev & infrastructure (plugin)
  {
    slash: '/deploy',
    summary: 'Check if production is live',
    template: 'Is the latest code committed, pushed, and deployed to production?',
    example: 'Is the latest code committed, pushed, and deployed to production?',
    feature: 'dev_infra',
  },
  {
    slash: '/git',
    summary: 'Git repo status',
    template: 'What is the current git status on the main branch?',
    example: 'What is the current git status on the main branch?',
    feature: 'dev_infra',
  },
  {
    slash: '/commits',
    summary: 'Recent commits',
    template: 'Show recent commits on main.',
    example: 'Show recent commits on main.',
    feature: 'dev_infra',
  },
  {
    slash: '/branches',
    summary: 'Open git branches',
    template: 'List open branches and in-progress work.',
    example: 'List open branches and in-progress work.',
    feature: 'dev_infra',
  },
  {
    slash: '/dev',
    summary: 'Run a dev/ops status check',
    template: 'Run a service status check.',
    example: 'Run a service status check.',
    feature: 'dev_infra',
  },
  {
    slash: '/railway',
    summary: 'Railway domains & DNS',
    template: 'List Railway domains for the Reave App project.',
    example: 'List Railway domains for the Reave App project.',
    feature: 'dev_infra',
  },
  {
    slash: '/kinsta',
    summary: 'List Kinsta WordPress sites',
    template: 'List Kinsta WordPress sites.',
    example: 'List Kinsta WordPress sites.',
    feature: 'dev_infra',
  },
  {
    slash: '/github-pr',
    summary: 'Open a GitHub pull request',
    template: 'Open a PR from branch [branch] titled [title].',
    example: 'Open a PR from branch fix/typo titled Fix homepage typo.',
    feature: 'dev_infra',
  },

  // Documents (plugin)
  {
    slash: '/document',
    summary: 'Send a document signing link',
    template: 'Send document [template] to [client] for signing.',
    example: 'Send document service-agreement to Acme Corp for signing.',
    feature: 'documents',
  },

  // Voice (plugin)
  {
    slash: '/call',
    summary: 'Initiate an outbound call',
    template: 'Call [contact] at [phone].',
    example: 'Call Tony Vello at +15551234567.',
    feature: 'voice',
  },

  // CardDAV (plugin)
  {
    slash: '/carddav',
    summary: 'iOS Contacts sync setup',
    template: 'How do I sync contacts to iPhone with CardDAV?',
    example: 'How do I sync contacts to iPhone with CardDAV?',
    feature: 'carddav',
  },
];

export const AGENT_HELPER_COMMANDS: AgentHelperCommand[] = HELPER_MANIFEST.map(toCommand);

export function filterHelperCommands(query: string, commands: AgentHelperCommand[]): AgentHelperCommand[] {
  const trimmed = query.trim();
  if (!trimmed) return commands;
  if (!trimmed.startsWith('/')) return [];
  const lower = trimmed.toLowerCase();
  return commands.filter((cmd) => cmd.slash.toLowerCase().startsWith(lower));
}

export function matchHelperCommand(query: string, commands: AgentHelperCommand[]): AgentHelperCommand | null {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed.startsWith('/')) return null;
  const exact = commands.find((cmd) => cmd.slash.toLowerCase() === trimmed);
  if (exact) return exact;
  const token = trimmed.split(/\s/)[0];
  return commands.find((cmd) => cmd.slash.toLowerCase() === token) ?? null;
}
