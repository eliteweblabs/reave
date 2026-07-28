/**
 * Shared demo fixtures for scripts/seed-demo.ts.
 * Contacts use @demo.reave.app or *.demo emails so --fresh cleanup can find them.
 */

export const DEMO_SEED_MARKER = '[demo-seed]';

export type DemoContactDef = {
  key: string;
  name: string;
  email: string;
  phone?: string;
  company?: string;
  notes?: string;
  address?: string;
  lat?: number;
  lng?: number;
  portal?: {
    headline?: string;
    body?: string;
    website?: string;
    tagline?: string;
  };
};

/** Fake clients — safe to delete on --fresh. */
export const DEMO_CONTACTS: DemoContactDef[] = [
  {
    key: 'sarah',
    name: 'Sarah Chen',
    email: 'sarah.chen@demo.reave.app',
    phone: '+16175550101',
    company: 'Chen Residence',
    notes: `${DEMO_SEED_MARKER} Site walkthrough — new deck estimate`,
    address: '123 Beacon Hill Rd, Boston, MA 02108',
    lat: 42.3588,
    lng: -71.0707,
    portal: {
      headline: 'Your deck project',
      body: 'Thanks for choosing us for your backyard deck. Review milestones, photos, and messages here.',
      website: 'https://example.com',
      tagline: 'Backyard living, built right.',
    },
  },
  {
    key: 'mike',
    name: 'Mike Rodriguez',
    email: 'mike@greenplanet.demo',
    phone: '+16175550102',
    company: 'Green Planet Landscaping',
    notes: `${DEMO_SEED_MARKER} Quarterly pest inspection follow-up`,
    address: '45 Commonwealth Ave, Boston, MA 02116',
    lat: 42.3523,
    lng: -71.0745,
  },
  {
    key: 'emma',
    name: 'Emma Foster',
    email: 'emma@phaseline.demo',
    company: 'PhaseLine Interiors',
    notes: `${DEMO_SEED_MARKER} Exterior repaint color consult`,
    address: '88 Summer St, Boston, MA 02110',
    lat: 42.3539,
    lng: -71.0577,
  },
  {
    key: 'james',
    name: 'James Park',
    email: 'jpark@capco.demo',
    phone: '+16175550104',
    company: 'CapCo Development',
    notes: `${DEMO_SEED_MARKER} Kitchen remodel kickoff`,
    address: '200 Boylston St, Boston, MA 02116',
    lat: 42.3522,
    lng: -71.0662,
    portal: {
      headline: 'Kitchen remodel',
      body: 'Cabinet selections are due Friday. Upload appliance specs when ready.',
    },
  },
  {
    key: 'lisa',
    name: 'Lisa Nguyen',
    email: 'lisa@rothco.demo',
    company: 'Roth & Co.',
    notes: `${DEMO_SEED_MARKER} Office build-out inquiry`,
    address: '75 State St, Boston, MA 02109',
    lat: 42.3587,
    lng: -71.0567,
  },
  {
    key: 'david',
    name: 'David Walsh',
    email: 'dwalsh@paulino.demo',
    phone: '+16175550106',
    company: 'Paulino Auto Group',
    notes: `${DEMO_SEED_MARKER} Fleet wrap design review`,
    address: '1 Seaport Blvd, Boston, MA 02210',
    lat: 42.3488,
    lng: -71.0418,
  },
  {
    key: 'rachel',
    name: 'Rachel Brooks',
    email: 'rachel@icfp.demo',
    company: 'ICFP Advisors',
    notes: `${DEMO_SEED_MARKER} Annual planning session`,
    address: '100 Federal St, Boston, MA 02110',
    lat: 42.3545,
    lng: -71.0556,
  },
  {
    key: 'tom',
    name: 'Tom Bradley',
    email: 'tom@allauto.demo',
    phone: '+16175550108',
    company: 'All Auto Service',
    notes: `${DEMO_SEED_MARKER} Shop signage refresh`,
    address: '500 Boylston St, Boston, MA 02116',
    lat: 42.3505,
    lng: -71.0753,
  },
];

export type DemoJobDef = {
  slug: string;
  title: string;
  contactKey: string;
  status: 'inquiry' | 'active' | 'archived';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  dueDate?: string;
  value?: number;
  tags?: string[];
  source?: string;
  body: string;
};

export const DEMO_JOBS: DemoJobDef[] = [
  {
    slug: 'demo-sarah-beacon-deck',
    title: 'Beacon Hill deck & railing',
    contactKey: 'sarah',
    status: 'active',
    priority: 'high',
    dueDate: '2026-09-15',
    value: 28500,
    tags: ['deck', 'permit'],
    body: 'Composite deck with glass rail. Permit submitted; materials ETA 8/12.',
  },
  {
    slug: 'demo-mike-landscape-spring',
    title: 'Spring landscape refresh',
    contactKey: 'mike',
    status: 'active',
    priority: 'normal',
    dueDate: '2026-08-30',
    value: 4200,
    tags: ['landscape'],
    body: 'Mulch, bed edging, and irrigation tune-up for two properties.',
  },
  {
    slug: 'demo-emma-exterior-paint',
    title: 'Exterior repaint — Summer St',
    contactKey: 'emma',
    status: 'inquiry',
    priority: 'normal',
    tags: ['paint'],
    body: 'Color consult scheduled. Waiting on HOA palette approval.',
  },
  {
    slug: 'demo-james-kitchen',
    title: 'Boylston kitchen remodel',
    contactKey: 'james',
    status: 'active',
    priority: 'urgent',
    dueDate: '2026-10-01',
    value: 78000,
    tags: ['remodel', 'kitchen'],
    body: 'Demo complete. Rough plumbing inspection Thursday.',
  },
  {
    slug: 'demo-lisa-office-buildout',
    title: 'State St office build-out',
    contactKey: 'lisa',
    status: 'inquiry',
    priority: 'low',
    body: 'Initial scope call done — waiting on floor plans from architect.',
  },
  {
    slug: 'demo-david-fleet-wrap',
    title: 'Fleet vehicle wraps',
    contactKey: 'david',
    status: 'archived',
    priority: 'normal',
    value: 12500,
    tags: ['signage'],
    body: 'Delivered and invoiced Q2. Client asked to hold winter fleet batch.',
  },
  {
    slug: 'demo-rachel-annual-review',
    title: 'Annual ops review',
    contactKey: 'rachel',
    status: 'archived',
    priority: 'low',
    body: 'Completed planning session; follow-up deck sent.',
  },
  {
    slug: 'demo-tom-signage',
    title: 'Shopfront signage refresh',
    contactKey: 'tom',
    status: 'inquiry',
    priority: 'normal',
    tags: ['signage'],
    body: 'Mockups in Figma — client feedback due next week.',
  },
];

export type DemoEmailDef = {
  id: string;
  from: string;
  subject: string;
  bodySnippet: string;
  bodyText: string;
  category: 'client' | 'alert' | 'review' | 'project' | 'junk' | 'internal';
  status: string;
  action: string;
  contactKey?: string;
  jobSlug?: string;
  summary?: string;
  daysAgo?: number;
};

export const DEMO_EMAILS: DemoEmailDef[] = [
  {
    id: 'demo-email-sarah-reply',
    from: 'Sarah Chen <sarah.chen@demo.reave.app>',
    subject: 'Re: Deck railing options',
    bodySnippet: 'Can we swap the glass panels for cable rail on the side facing the alley?',
    bodyText:
      'Hi — quick question on the deck quote.\n\nCan we swap the glass panels for cable rail on the side facing the alley? Neighbors asked about glare.\n\nThanks,\nSarah',
    category: 'client',
    status: 'MATCHED',
    action: 'classified',
    contactKey: 'sarah',
    jobSlug: 'demo-sarah-beacon-deck',
    summary: 'Client wants cable rail instead of glass on alley side.',
    daysAgo: 0,
  },
  {
    id: 'demo-email-james-inspection',
    from: 'James Park <jpark@capco.demo>',
    subject: 'Plumbing inspection window',
    bodySnippet: 'Inspector can come Thursday 9–11 or Friday 1–3. Which works?',
    bodyText:
      'Team — inspector gave two windows:\n\n• Thu 9–11\n• Fri 1–3\n\nLet me know which to confirm.\n\n— James',
    category: 'project',
    status: 'MATCHED',
    action: 'classified',
    contactKey: 'james',
    jobSlug: 'demo-james-kitchen',
    summary: 'Pick plumbing inspection slot for kitchen remodel.',
    daysAgo: 1,
  },
  {
    id: 'demo-email-new-lead',
    from: 'Olivia Grant <olivia@grantco.demo>',
    subject: 'Foundation repair estimate?',
    bodySnippet: 'We noticed cracking in the basement wall — can someone come out next week?',
    bodyText:
      'Hello,\n\nWe noticed cracking in the basement wall at 33 Arch St. Can someone come out next week for an estimate?\n\nOlivia Grant\nGrant & Co.',
    category: 'review',
    status: 'UNMATCHED',
    action: 'classified',
    summary: 'New inbound lead — foundation repair, Arch St.',
    daysAgo: 0,
  },
  {
    id: 'demo-email-railway',
    from: 'Railway <deployments@railway.app>',
    subject: '[Reave App] Deploy succeeded',
    bodySnippet: 'Deployment d9acd56 finished successfully on production.',
    bodyText: 'Deployment d9acd56 finished successfully on production.\n\nView logs in Railway dashboard.',
    category: 'alert',
    status: 'RAILWAY_DEPLOY_SUCCESS',
    action: 'classified',
    summary: 'Railway production deploy succeeded (demo).',
    daysAgo: 0,
  },
  {
    id: 'demo-email-newsletter',
    from: 'Mailchimp <noreply@mailchimp.com>',
    subject: 'Your weekly audience report',
    bodySnippet: 'Opens up 12% vs last week. Top link: spring promotions.',
    bodyText: 'Your weekly audience report is ready.\n\nOpens up 12% vs last week.',
    category: 'junk',
    status: 'JUNK',
    action: 'classified',
    summary: 'Newsletter analytics — auto-filed as junk.',
    daysAgo: 2,
  },
  {
    id: 'demo-email-receipt',
    from: 'Home Depot Pro <receipts@homedepot.com>',
    subject: 'Receipt for order #4829103',
    bodySnippet: 'Composite decking — $1,842.17 charged to Pro Xtra account.',
    bodyText: 'Thank you for your purchase.\n\nComposite decking — $1,842.17\nOrder #4829103',
    category: 'internal',
    status: 'RECEIPT',
    action: 'classified',
    jobSlug: 'demo-sarah-beacon-deck',
    summary: 'Materials receipt for Sarah deck job.',
    daysAgo: 3,
  },
];

export type DemoChatDef = {
  title: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
};

export const DEMO_CHATS: DemoChatDef[] = [
  {
    title: '[Demo] Schedule Sarah site visit',
    messages: [
      {
        role: 'user',
        content: 'Book a site visit with Sarah Chen next Tuesday morning for the Beacon Hill deck.',
      },
      {
        role: 'assistant',
        content:
          'I found Sarah Chen (sarah.chen@demo.reave.app) and the active project **Beacon Hill deck & railing**.\n\nTuesday 9:00 AM is open on your calendar. Want me to send her a confirmation email and add travel time from the office?',
      },
    ],
  },
  {
    title: '[Demo] Draft invoice for Mike',
    messages: [
      {
        role: 'user',
        content: 'Invoice Mike Rodriguez $4,200 for the spring landscape refresh — net 15.',
      },
      {
        role: 'assistant',
        content:
          'Draft invoice ready for **Green Planet Landscaping**:\n\n• Line item: Spring landscape refresh — $4,200\n• Terms: Net 15\n• Linked project: demo-mike-landscape-spring\n\nSay **send** to deliver via Crater, or **edit** to adjust line items.',
      },
    ],
  },
  {
    title: '[Demo] Summarize open inquiries',
    messages: [
      {
        role: 'user',
        content: 'What inquiries are still waiting on us?',
      },
      {
        role: 'assistant',
        content:
          'Three open inquiries:\n\n1. **Exterior repaint — Summer St** (Emma Foster) — waiting on HOA palette\n2. **State St office build-out** (Lisa Nguyen) — need floor plans\n3. **Shopfront signage refresh** (Tom Bradley) — mockups in review\n\nOlivia Grant also emailed about foundation work — not matched to a contact yet.',
      },
    ],
  },
];

export type DemoTodoDef = {
  title: string;
  section: string;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  status?: 'open' | 'done';
  jobSlug?: string;
  daysUntilDue?: number;
};

export const DEMO_TODOS: DemoTodoDef[] = [
  { title: 'Confirm plumbing inspection slot with James', section: '[Demo] Today', priority: 'urgent', jobSlug: 'demo-james-kitchen', daysUntilDue: 0 },
  { title: 'Send cable-rail revision to Sarah', section: '[Demo] Today', priority: 'high', jobSlug: 'demo-sarah-beacon-deck', daysUntilDue: 0 },
  { title: 'Review Olivia foundation lead', section: '[Demo] Today', priority: 'normal', daysUntilDue: 0 },
  { title: 'Order composite decking for Sarah job', section: '[Demo] This week', priority: 'high', jobSlug: 'demo-sarah-beacon-deck', daysUntilDue: 3 },
  { title: 'Upload Tom signage mockups to portal', section: '[Demo] This week', priority: 'normal', jobSlug: 'demo-tom-signage', daysUntilDue: 5 },
  { title: 'Follow up with Lisa on floor plans', section: '[Demo] This week', priority: 'low', jobSlug: 'demo-lisa-office-buildout', daysUntilDue: 4 },
  { title: 'Prep demo environment before client call', section: '[Demo] Backlog', priority: 'normal', daysUntilDue: 7 },
  { title: 'Archive completed fleet wrap photos', section: '[Demo] Backlog', priority: 'low', jobSlug: 'demo-david-fleet-wrap', status: 'done' },
];

export type DemoEngagementDef = {
  type: 'vault_entry' | 'share_open' | 'deck_view' | 'contact_form';
  title: string;
  detail: string;
  contactKey?: string;
  jobSlug?: string;
  dedupeKey: string;
  daysAgo?: number;
};

export const DEMO_ENGAGEMENT: DemoEngagementDef[] = [
  {
    type: 'share_open',
    title: 'Sarah opened project link',
    detail: 'Beacon Hill deck share link opened from iPhone.',
    contactKey: 'sarah',
    jobSlug: 'demo-sarah-beacon-deck',
    dedupeKey: 'demo:share-sarah-deck',
    daysAgo: 0,
  },
  {
    type: 'vault_entry',
    title: 'James uploaded appliance specs',
    detail: '3 files added to kitchen remodel vault.',
    contactKey: 'james',
    jobSlug: 'demo-james-kitchen',
    dedupeKey: 'demo:vault-james-kitchen',
    daysAgo: 1,
  },
  {
    type: 'contact_form',
    title: 'Website inquiry — foundation repair',
    detail: 'Olivia Grant asked about basement wall cracking at 33 Arch St.',
    dedupeKey: 'demo:form-olivia-foundation',
    daysAgo: 0,
  },
];

export type DemoJobCommentDef = {
  jobSlug: string;
  author: 'client' | 'staff';
  authorName: string;
  body: string;
  daysAgo?: number;
};

export const DEMO_JOB_COMMENTS: DemoJobCommentDef[] = [
  {
    jobSlug: 'demo-sarah-beacon-deck',
    author: 'client',
    authorName: 'Sarah Chen',
    body: 'Neighbors mentioned glare from glass panels — can we look at cable rail on the alley side?',
    daysAgo: 0,
  },
  {
    jobSlug: 'demo-sarah-beacon-deck',
    author: 'staff',
    authorName: 'You',
    body: 'Absolutely — I’ll revise the quote with cable rail on the alley run and send today.',
    daysAgo: 0,
  },
  {
    jobSlug: 'demo-james-kitchen',
    author: 'client',
    authorName: 'James Park',
    body: 'Demo crew finished ahead of schedule. Rough plumbing ready whenever inspector can come.',
    daysAgo: 1,
  },
];

/** Demo contacts use these email patterns; real contacts do not. */
export function isDemoContactEmail(email: string | null | undefined): boolean {
  const e = (email ?? '').trim().toLowerCase();
  if (!e) return false;
  return e.endsWith('@demo.reave.app') || e.endsWith('.demo') || e.includes('@demo.');
}

export function demoJobSlug(slug: string): boolean {
  return slug.startsWith('demo-');
}
