/**
 * Industry-specific demo fixtures for scripts/seed-demo.ts.
 */
import {
  DEMO_CHATS,
  DEMO_CONTACTS,
  DEMO_EMAILS,
  DEMO_ENGAGEMENT,
  DEMO_JOB_COMMENTS,
  DEMO_JOBS,
  DEMO_TODOS,
  type DemoChatDef,
  type DemoContactDef,
  type DemoEmailDef,
  type DemoEngagementDef,
  type DemoJobCommentDef,
  type DemoJobDef,
  type DemoTodoDef,
} from '../demo-data.ts';
import {
  LAW_CHATS,
  LAW_COMPANY,
  LAW_CONTACTS,
  LAW_EMAILS,
  LAW_JOBS,
  LAW_TODOS,
} from './law.ts';
import {
  PLUMBING_CHATS,
  PLUMBING_COMPANY,
  PLUMBING_CONTACTS,
  PLUMBING_EMAILS,
  PLUMBING_JOBS,
  PLUMBING_TODOS,
} from './plumbing.ts';

export type DemoIndustryCompany = {
  name: string;
  description: string;
  supportEmail?: string;
  brandPrimary?: string;
  brandSecondary?: string;
};

export type DemoIndustryFixtures = {
  industry: string;
  contacts: DemoContactDef[];
  jobs: DemoJobDef[];
  emails: DemoEmailDef[];
  chats: DemoChatDef[];
  todos: DemoTodoDef[];
  engagement: DemoEngagementDef[];
  jobComments: DemoJobCommentDef[];
  company: DemoIndustryCompany;
};

const DEFAULT_COMPANY: DemoIndustryCompany = {
  name: 'Reave Demo Co.',
  description: 'Full-service design, build, and ops for Boston-area clients.',
  brandPrimary: '#6366f1',
  brandSecondary: '#8b5cf6',
};

function defaultFixtures(): DemoIndustryFixtures {
  return {
    industry: 'general',
    contacts: DEMO_CONTACTS,
    jobs: DEMO_JOBS,
    emails: DEMO_EMAILS,
    chats: DEMO_CHATS,
    todos: DEMO_TODOS,
    engagement: DEMO_ENGAGEMENT,
    jobComments: DEMO_JOB_COMMENTS,
    company: DEFAULT_COMPANY,
  };
}

/** Supported industry slugs for ?industry=plumbing etc. */
export const DEMO_INDUSTRY_SLUGS = ['general', 'plumbing', 'law'] as const;
export type DemoIndustrySlug = (typeof DEMO_INDUSTRY_SLUGS)[number];

export function normalizeDemoIndustry(raw: string | null | undefined): DemoIndustrySlug {
  const slug = (raw ?? '').trim().toLowerCase();
  if (slug === 'plumbing' || slug === 'plumber') return 'plumbing';
  if (slug === 'law' || slug === 'legal' || slug === 'lawyer' || slug === 'law-firm') return 'law';
  return 'general';
}

export function getDemoIndustryFixtures(industry?: string | null): DemoIndustryFixtures {
  const slug = normalizeDemoIndustry(industry);
  if (slug === 'law') {
    return {
      industry: slug,
      contacts: LAW_CONTACTS,
      jobs: LAW_JOBS,
      emails: LAW_EMAILS,
      chats: LAW_CHATS,
      todos: LAW_TODOS,
      engagement: DEMO_ENGAGEMENT.map((e) => ({
        ...e,
        jobSlug: e.jobSlug
          ?.replace('demo-james-kitchen', 'demo-james-stay-violation')
          .replace('demo-sarah-beacon-deck', 'demo-sarah-chapter7'),
        dedupeKey: e.dedupeKey.replace('kitchen', 'stay').replace('deck', 'chapter7'),
        title: e.title
          .replace('deck', 'chapter 7')
          .replace('appliance specs', 'pay stubs'),
        detail: e.detail
          .replace('Beacon Hill deck', 'Chen chapter 7')
          .replace('kitchen remodel', 'stay violation'),
      })),
      jobComments: DEMO_JOB_COMMENTS.map((c) => ({
        ...c,
        jobSlug: c.jobSlug
          .replace('demo-sarah-beacon-deck', 'demo-sarah-chapter7')
          .replace('demo-james-kitchen', 'demo-james-stay-violation'),
        body: c.body
          .replace('glass panels', 'pay stubs')
          .replace('kitchen remodel', 'stay letter')
          .replace('Rough plumbing', '341 prep'),
      })),
      company: {
        name: LAW_COMPANY.name,
        description: LAW_COMPANY.tagline,
        supportEmail: LAW_COMPANY.supportEmail,
        brandPrimary: LAW_COMPANY.brandPrimary,
        brandSecondary: LAW_COMPANY.brandSecondary,
      },
    };
  }
  if (slug === 'plumbing') {
    return {
      industry: slug,
      contacts: PLUMBING_CONTACTS,
      jobs: PLUMBING_JOBS,
      emails: PLUMBING_EMAILS,
      chats: PLUMBING_CHATS,
      todos: PLUMBING_TODOS,
      engagement: DEMO_ENGAGEMENT.map((e) => ({
        ...e,
        jobSlug: e.jobSlug?.replace('demo-james-kitchen', 'demo-james-repipe'),
        dedupeKey: e.dedupeKey.replace('kitchen', 'repipe'),
      })),
      jobComments: DEMO_JOB_COMMENTS.map((c) => ({
        ...c,
        jobSlug: c.jobSlug.replace('demo-sarah-beacon-deck', 'demo-sarah-water-heater').replace('demo-james-kitchen', 'demo-james-repipe'),
        body: c.body
          .replace('glass panels', 'tank size')
          .replace('cable rail', 'expansion tank')
          .replace('kitchen remodel', 'repipe project')
          .replace('Rough plumbing', 'Rough-in'),
      })),
      company: {
        name: PLUMBING_COMPANY.name,
        description: PLUMBING_COMPANY.tagline,
        supportEmail: PLUMBING_COMPANY.supportEmail,
        brandPrimary: PLUMBING_COMPANY.brandPrimary,
        brandSecondary: PLUMBING_COMPANY.brandSecondary,
      },
    };
  }
  return defaultFixtures();
}
