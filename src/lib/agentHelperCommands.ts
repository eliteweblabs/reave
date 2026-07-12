/**
 * Slash-style helper commands for admin agent chat compose.
 * These are UI hints + draft templates — the agent still handles natural language.
 */

export type AgentHelperCommand = {
  slash: string;
  label: string;
  summary: string;
  /** Inserted into compose when the user picks the command. */
  template: string;
  /** Short numbered steps shown in the helper panel. */
  steps: string[];
  example: string;
};

export const AGENT_HELPER_COMMANDS: AgentHelperCommand[] = [
  {
    slash: '/invoice',
    label: 'Invoice',
    summary: 'Create a draft Crater invoice',
    template: 'Create a draft invoice for [client name] for $[amount].',
    steps: [
      'Client — name from your contacts (fuzzy match is fine).',
      'Amount — whole US dollars.',
      'Project (optional) — add “for project [slug]” to pull completed checklist items as line descriptions.',
    ],
    example:
      'Create a draft invoice for Acme Corp for $1,500 for project acme-website-redesign.',
  },
  {
    slash: '/contact',
    label: 'Contact',
    summary: 'Look up a client',
    template: 'Who is [name]? Show their contact details and any open projects.',
    steps: [
      'Name — client, company, or nickname (typos OK).',
      'The agent resolves via contacts and can list linked jobs.',
    ],
    example: 'Who is Northwind Studio?',
  },
  {
    slash: '/work',
    label: 'Work',
    summary: 'List or start a job',
    template: 'List open jobs for [client].',
    steps: [
      'Client — optional filter by name.',
      'Or ask to create a job: “Create a job for [client]: [what they need].”',
    ],
    example: 'List open jobs for Acme Corp.',
  },
  {
    slash: '/deploy',
    label: 'Deploy',
    summary: 'Check if production is live',
    template: 'Is the latest code committed, pushed, and deployed to production?',
    steps: [
      'Agent checks GitHub + Railway deploy status.',
      'No client name needed.',
    ],
    example: 'Is the latest code committed, pushed, and deployed to production?',
  },
  {
    slash: '/invoices',
    label: 'Invoices',
    summary: 'List recent invoices',
    template: 'List my recent Crater invoices.',
    steps: ['Shows status, totals, and links. No extra fields needed.'],
    example: 'List my recent Crater invoices.',
  },
];

export function filterHelperCommands(query: string): AgentHelperCommand[] {
  const trimmed = query.trim();
  if (!trimmed) return AGENT_HELPER_COMMANDS;
  if (!trimmed.startsWith('/')) return [];
  const lower = trimmed.toLowerCase();
  return AGENT_HELPER_COMMANDS.filter((cmd) => cmd.slash.toLowerCase().startsWith(lower));
}

export function matchHelperCommand(query: string): AgentHelperCommand | null {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed.startsWith('/')) return null;
  const exact = AGENT_HELPER_COMMANDS.find((cmd) => cmd.slash.toLowerCase() === trimmed);
  if (exact) return exact;
  const token = trimmed.split(/\s/)[0];
  return AGENT_HELPER_COMMANDS.find((cmd) => cmd.slash.toLowerCase() === token) ?? null;
}
