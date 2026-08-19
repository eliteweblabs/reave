/**
 * Law-firm demo fixtures — matters, inbox, and todos for a small practice.
 */
import { DEMO_SEED_MARKER, type DemoChatDef, type DemoContactDef, type DemoEmailDef, type DemoJobDef, type DemoTodoDef } from '../demo-data.ts';

export const LAW_COMPANY = {
  name: 'Harbor & Levine LLP',
  tagline: 'Business, estate, and civil practice — Boston',
  supportEmail: 'intake@harborlevine.demo',
  brandPrimary: '#1e3a5f',
  brandSecondary: '#b45309',
};

export const LAW_CONTACTS: DemoContactDef[] = [
  {
    key: 'sarah',
    name: 'Sarah Chen',
    email: 'sarah.chen@demo.reave.app',
    phone: '+16175550101',
    company: 'Chen Residence',
    notes: `${DEMO_SEED_MARKER} Estate plan — pour-over will + revocable trust`,
    address: '123 Beacon Hill Rd, Boston, MA 02108',
    lat: 42.3588,
    lng: -71.0707,
    portal: {
      headline: 'Estate planning',
      body: 'Draft will and trust are in review. Upload beneficiary details when ready.',
      tagline: 'Your plan, in writing.',
    },
  },
  {
    key: 'mike',
    name: 'Mike Rodriguez',
    email: 'mike@greenplanet.demo',
    phone: '+16175550102',
    company: 'Green Planet Landscaping',
    notes: `${DEMO_SEED_MARKER} Operating agreement amendment`,
    address: '45 Commonwealth Ave, Boston, MA 02116',
    lat: 42.3523,
    lng: -71.0745,
  },
  {
    key: 'james',
    name: 'James Park',
    email: 'jpark@capco.demo',
    phone: '+16175550104',
    company: 'CapCo Development',
    notes: `${DEMO_SEED_MARKER} Commercial lease — 200 Boylston`,
    address: '200 Boylston St, Boston, MA 02116',
    lat: 42.3522,
    lng: -71.0662,
    portal: {
      headline: 'Boylston lease',
      body: 'Landlord redlines are in. Comment on indemnity and CAM caps this week.',
    },
  },
  {
    key: 'lisa',
    name: 'Lisa Nguyen',
    email: 'lisa@rothco.demo',
    company: 'Roth & Co. Restaurant Group',
    notes: `${DEMO_SEED_MARKER} Employment demand — former GM`,
    address: '75 State St, Boston, MA 02109',
    lat: 42.3587,
    lng: -71.0567,
  },
  {
    key: 'david',
    name: 'David Walsh',
    email: 'dwalsh@paulino.demo',
    phone: '+16175550106',
    company: 'Walsh Property Mgmt',
    notes: `${DEMO_SEED_MARKER} Closing — 1 Seaport unit 12B`,
    address: '1 Seaport Blvd, Boston, MA 02210',
    lat: 42.3488,
    lng: -71.0418,
  },
  {
    key: 'rachel',
    name: 'Rachel Brooks',
    email: 'rachel@icfp.demo',
    company: 'Brooks Dental',
    notes: `${DEMO_SEED_MARKER} Associate buy-in term sheet`,
    address: '100 Federal St, Boston, MA 02110',
    lat: 42.3545,
    lng: -71.0556,
  },
  {
    key: 'olivia',
    name: 'Olivia Grant',
    email: 'olivia@grantco.demo',
    phone: '+16175550115',
    company: 'Grant & Co.',
    notes: `${DEMO_SEED_MARKER} New intake — contract dispute`,
    address: '33 Arch St, Boston, MA 02110',
    lat: 42.3554,
    lng: -71.0589,
  },
  {
    key: 'counsel',
    name: 'Andrew Hale',
    email: 'ahale@halebarrett.demo',
    company: 'Hale & Barrett',
    notes: `${DEMO_SEED_MARKER} Opposing counsel — Rivera matter`,
    address: '60 State St, Boston, MA 02109',
    lat: 42.3586,
    lng: -71.0562,
  },
];

export const LAW_JOBS: DemoJobDef[] = [
  {
    slug: 'demo-sarah-estate-plan',
    title: 'Chen estate plan',
    contactKey: 'sarah',
    status: 'active',
    priority: 'high',
    dueDate: '2026-09-12',
    value: 4500,
    tags: ['estate', 'trust'],
    body: 'Pour-over will + revocable trust. Waiting on beneficiary schedule and successor trustee.',
  },
  {
    slug: 'demo-mike-operating-agreement',
    title: 'Green Planet operating agreement',
    contactKey: 'mike',
    status: 'active',
    priority: 'normal',
    dueDate: '2026-08-28',
    value: 2800,
    tags: ['entity'],
    body: 'Add a second member and update capital-call language. Draft circulated.',
  },
  {
    slug: 'demo-james-boylston-lease',
    title: 'CapCo — 200 Boylston lease',
    contactKey: 'james',
    status: 'active',
    priority: 'urgent',
    dueDate: '2026-08-22',
    value: 6200,
    tags: ['lease', 'commercial'],
    body: 'Landlord redlines on indemnity, CAM cap, and early-access. Reply due Friday.',
  },
  {
    slug: 'demo-lisa-employment-demand',
    title: 'Roth & Co. employment demand',
    contactKey: 'lisa',
    status: 'inquiry',
    priority: 'high',
    value: 8500,
    tags: ['employment'],
    body: 'Former GM demand letter. Collect handbook, emails, and commission statements.',
  },
  {
    slug: 'demo-david-seaport-closing',
    title: 'Seaport 12B closing',
    contactKey: 'david',
    status: 'active',
    priority: 'urgent',
    dueDate: '2026-08-26',
    value: 3200,
    tags: ['closing', 'real-estate'],
    body: 'Title commitment in. Need HOA estoppel and payoff letter before Tuesday.',
  },
  {
    slug: 'demo-olivia-intake',
    title: 'Grant & Co. contract dispute',
    contactKey: 'olivia',
    status: 'inquiry',
    priority: 'normal',
    tags: ['intake', 'litigation'],
    body: 'New matter — vendor walked off a fit-out. Conflict check clear. Retainer not signed.',
  },
];

export const LAW_EMAILS: DemoEmailDef[] = [
  {
    id: 'demo-email-sarah-trust',
    from: 'Sarah Chen <sarah.chen@demo.reave.app>',
    subject: 'Successor trustee — my sister instead?',
    bodySnippet: 'Can we name my sister as successor trustee and keep the kids as remainder beneficiaries?',
    bodyText:
      'Hi — I reread the draft trust.\n\nCan we name my sister as successor trustee and keep the kids as remainder beneficiaries? I’ll send her full name and address today.\n\nThanks,\nSarah',
    category: 'client',
    status: 'MATCHED',
    action: 'classified',
    contactKey: 'sarah',
    jobSlug: 'demo-sarah-estate-plan',
    summary: 'Client wants sister as successor trustee on the Chen trust.',
    daysAgo: 0,
  },
  {
    id: 'demo-email-james-lease',
    from: 'James Park <jpark@capco.demo>',
    subject: 'Landlord redlines — indemnity',
    bodySnippet: 'They struck our indemnity cap and added a broad environmental indemnity. Can we get a call tomorrow?',
    bodyText:
      'Team — attached are the landlord redlines on 200 Boylston.\n\nThey struck our indemnity cap and added a broad environmental indemnity. CAM is still uncapped.\n\nCan we get a call tomorrow morning?\n\n— James',
    category: 'project',
    status: 'MATCHED',
    action: 'classified',
    contactKey: 'james',
    jobSlug: 'demo-james-boylston-lease',
    summary: 'CapCo lease — landlord removed indemnity cap; needs a call.',
    daysAgo: 0,
  },
  {
    id: 'demo-email-opposing',
    from: 'Andrew Hale <ahale@halebarrett.demo>',
    subject: 'Rivera v. Harbor — deposition dates',
    bodySnippet: 'We can do Sept 9 or 11 for the PM deposition. Please confirm a room downtown.',
    bodyText:
      'Counsel — we can do September 9 or 11 for the plaintiff’s deposition.\n\nPlease confirm a room downtown and whether you will provide a videographer.\n\nAndrew Hale\nHale & Barrett',
    category: 'project',
    status: 'MATCHED',
    action: 'classified',
    contactKey: 'counsel',
    jobSlug: 'demo-lisa-employment-demand',
    summary: 'Opposing counsel offered Sept 9 or 11 for deposition.',
    daysAgo: 1,
  },
  {
    id: 'demo-email-title',
    from: 'First American Title <closings@firstam.demo>',
    subject: 'Commitment — 1 Seaport Blvd 12B',
    bodySnippet: 'Commitment issued. Exceptions 8 and 12 need a payoff and HOA estoppel before we can insure.',
    bodyText:
      'Commitment for 1 Seaport Blvd, Unit 12B is issued.\n\nExceptions 8 and 12 require a mortgage payoff letter and HOA estoppel before we can insure.\n\nPlease upload both to the closing workspace.',
    category: 'internal',
    status: 'RECEIPT',
    action: 'classified',
    contactKey: 'david',
    jobSlug: 'demo-david-seaport-closing',
    summary: 'Title commitment in — need payoff and HOA estoppel for 12B.',
    daysAgo: 1,
  },
  {
    id: 'demo-email-new-intake',
    from: 'Olivia Grant <olivia@grantco.demo>',
    subject: 'Vendor walked off our fit-out',
    bodySnippet: 'They left mid-job and are holding our deposit. Can we talk this week about a demand letter?',
    bodyText:
      'Hello,\n\nOur GC left a restaurant fit-out at 33 Arch St mid-job and is holding a $42,000 deposit.\n\nCan we talk this week about a demand letter and whether we should file in Superior Court?\n\nOlivia Grant\nGrant & Co.',
    category: 'review',
    status: 'UNMATCHED',
    action: 'classified',
    summary: 'New intake — vendor walked off fit-out, $42k deposit.',
    daysAgo: 0,
  },
  {
    id: 'demo-email-court',
    from: 'Suffolk Superior <notices@jud.state.ma.us>',
    subject: 'Notice of hearing — Roth & Co.',
    bodySnippet: 'Rule 16 conference set for August 27 at 9:30 AM, Courtroom 1013.',
    bodyText:
      'A Rule 16 conference is set for August 27, 2026 at 9:30 AM in Courtroom 1013, Suffolk Superior Court.\n\nPlease file a joint statement three business days prior.',
    category: 'alert',
    status: 'MATCHED',
    action: 'classified',
    contactKey: 'lisa',
    jobSlug: 'demo-lisa-employment-demand',
    summary: 'Rule 16 conference Aug 27 — joint statement due three days prior.',
    daysAgo: 2,
  },
];

export const LAW_CHATS: DemoChatDef[] = [
  {
    title: '[Demo] Chen trust successor trustee',
    messages: [
      {
        role: 'user',
        content: 'Sarah wants her sister as successor trustee. Update the draft and send a clean copy.',
      },
      {
        role: 'assistant',
        content:
          'Sarah Chen — **Chen estate plan** is active.\n\nI’ll swap the successor trustee to her sister (waiting on full legal name and address from today’s email) and keep the children as remainder beneficiaries. Want me to send the clean draft once she replies?',
      },
    ],
  },
  {
    title: '[Demo] CapCo lease call',
    messages: [
      {
        role: 'user',
        content: 'What’s still open on the Boylston lease?',
      },
      {
        role: 'assistant',
        content:
          '**CapCo — 200 Boylston lease** — landlord struck the indemnity cap, added a broad environmental indemnity, and left CAM uncapped. James asked for a call tomorrow morning.\n\nI can hold 9:30 AM on your calendar and send a issues list.',
      },
    ],
  },
  {
    title: '[Demo] Open intake',
    messages: [
      {
        role: 'user',
        content: 'Any new matters waiting on a retainer?',
      },
      {
        role: 'assistant',
        content:
          'One: **Olivia Grant / Grant & Co.** — vendor walked off a fit-out and is holding a $42,000 deposit. Conflict check is clear. Retainer not signed.\n\nRoth & Co. employment demand is already an inquiry — handbook and commission statements still outstanding.',
      },
    ],
  },
];

export const LAW_TODOS: DemoTodoDef[] = [
  {
    title: 'Revise Chen trust — successor trustee',
    section: 'Today',
    priority: 'high',
    jobSlug: 'demo-sarah-estate-plan',
    daysUntilDue: 0,
  },
  {
    title: 'Issues list for CapCo lease call',
    section: 'Today',
    priority: 'urgent',
    jobSlug: 'demo-james-boylston-lease',
    daysUntilDue: 0,
  },
  {
    title: 'Order HOA estoppel — Seaport 12B',
    section: 'Today',
    priority: 'urgent',
    jobSlug: 'demo-david-seaport-closing',
    daysUntilDue: 0,
  },
  {
    title: 'Draft Grant & Co. retainer + demand outline',
    section: 'This week',
    priority: 'high',
    jobSlug: 'demo-olivia-intake',
    daysUntilDue: 2,
  },
  {
    title: 'File Rule 16 joint statement — Roth & Co.',
    section: 'This week',
    priority: 'high',
    jobSlug: 'demo-lisa-employment-demand',
    daysUntilDue: 3,
  },
  {
    title: 'Circulate Green Planet operating-agreement draft',
    section: 'This week',
    priority: 'normal',
    jobSlug: 'demo-mike-operating-agreement',
    daysUntilDue: 4,
  },
  {
    title: 'Conflict check archive — Hale & Barrett',
    section: 'Backlog',
    priority: 'low',
    daysUntilDue: 7,
  },
];
