/** Production stack and deployment modes — content for /platform. */

export type StackTech = {
  slug: string;
  name: string;
  color: string;
  role: string;
  iconSrc?: string;
  /** Public path when the mark is not in the media library (e.g. /stack/playwright.svg). */
  iconHref?: string;
};

export const SIMPLE_ICONS_CDN = (slug: string) =>
  `https://cdn.jsdelivr.net/npm/simple-icons@v16/icons/${slug}.svg`;

export const PLATFORM_DEPLOY_MODES = [
  {
    title: 'Full website package',
    desc: 'Public marketing site — homepage, deck, forms, booking — on your domain, fully wired into the OS underneath. Update copy or swap images by asking the agent — no CMS.',
  },
  {
    title: 'Standalone app',
    desc: 'Admin dashboard and client portal only. Skip the public frontend if you already have a website elsewhere.',
  },
  {
    title: 'Both',
    desc: 'The usual setup: a branded front door for prospects plus the operating system behind it, all on one domain.',
  },
] as const;

export const PLATFORM_STACK: StackTech[] = [
  { slug: 'astro', name: 'Astro', color: '#BC52EE', role: 'App & API' },
  { slug: 'react', name: 'React', color: '#61DAFB', role: 'Admin UI' },
  { slug: 'typescript', name: 'TypeScript', color: '#3178C6', role: 'Language' },
  { slug: 'nodedotjs', name: 'Node.js', color: '#5FA04E', role: 'Runtime' },
  { slug: 'railway', name: 'Railway', color: '#FFFFFF', role: 'Hosting & deploy' },
  { slug: 'postgresql', name: 'PostgreSQL', color: '#4169E1', role: 'App database' },
  { slug: 'supabase', name: 'Supabase', color: '#3FCF8E', role: 'Postgres & migrations' },
  { slug: 'clerk', name: 'Clerk', color: '#6C47FF', role: 'Admin auth' },
  { slug: 'resend', name: 'Resend', color: '#FFFFFF', role: 'Email in + out' },
  { slug: 'anthropic', name: 'Anthropic', color: '#D4A574', role: 'AI agent' },
  {
    slug: 'telnyx',
    name: 'Telnyx',
    color: '#00E3AA',
    role: 'SMS & voice',
    iconSrc: 'stack-telnyx',
  },
  { slug: 'github', name: 'GitHub', color: '#FFFFFF', role: 'Source control' },
  { slug: 'cloudflare', name: 'Cloudflare', color: '#F38020', role: 'DNS & edge' },
  { slug: 'caldotcom', name: 'Cal.com', color: '#FFFFFF', role: 'Scheduling', iconHref: '/stack/cal-com.png' },
  { slug: 'plausibleanalytics', name: 'Plausible', color: '#5850EC', role: 'Web analytics' },
  { slug: 'pexels', name: 'Pexels', color: '#05A081', role: 'Stock photos' },
  {
    slug: 'uptimerobot',
    name: 'UptimeRobot',
    color: '#3BD671',
    role: 'Uptime monitoring',
    iconSrc: 'stack-uptimerobot',
  },
  // Simple Icons dropped Playwright (Microsoft brand terms); use the local mark.
  {
    slug: 'playwright',
    name: 'Playwright™',
    color: '#2EAD33',
    role: 'Browser UX audits',
    iconHref: '/stack/playwright.svg',
  },
];
