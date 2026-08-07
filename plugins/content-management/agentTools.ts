import { hasFeature } from '../../src/lib/features';
import type { AgentToolDef, AgentToolModule, ToolContext } from '../../src/lib/agentTools/types';
import { maybeDeferGithubWrite } from '../../src/lib/deferredDeploy';
import {
  githubDefaultBranch,
  githubWriteFile,
  isGithubConfigured,
} from '../../src/lib/githubClient';
import {
  getSiteContent,
  resolveSiteContentKey,
  type SiteContentConfig,
  type SiteHeroCta,
  type SiteNavGroup,
  type SiteNavLink,
} from '../../src/lib/siteContent';

const CONTENT_PATH_PREFIXES = [
  'config/sites/',
  'src/pages/',
  'src/components/',
  'src/assets/',
  'src/content/',
  'public/',
] as const;

function siteContentGithubPath(key?: string): string {
  const slug = (key ?? resolveSiteContentKey()).trim().toLowerCase() || 'reave';
  return `config/sites/${slug}-config.json`;
}

function isContentWebsitePath(path: string): boolean {
  const normalized = path.replace(/^\/+/, '');
  if (!normalized || normalized.includes('..')) return false;
  return CONTENT_PATH_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

function parseJsonField<T>(raw: unknown, label: string): T | null | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }
  return raw as T;
}

function mergeSiteContent(
  current: SiteContentConfig,
  args: Record<string, unknown>,
): { config: SiteContentConfig; error?: string } {
  const next: SiteContentConfig = structuredClone(current);

  const heroHeadlineHtml =
    typeof args.hero_headline_html === 'string' ? args.hero_headline_html : undefined;
  if (heroHeadlineHtml !== undefined) next.homepage.heroHeadlineHtml = heroHeadlineHtml;

  if (args.show_hero_demo !== undefined) next.homepage.showHeroDemo = args.show_hero_demo === true;
  if (args.show_dialogue !== undefined) next.homepage.showDialogue = args.show_dialogue === true;
  if (args.show_integrations !== undefined) next.homepage.showIntegrations = args.show_integrations === true;
  if (args.show_features !== undefined) next.homepage.showFeatures = args.show_features === true;
  if (args.show_contact !== undefined) next.homepage.showContact = args.show_contact === true;
  if (args.show_legal_links !== undefined) next.homepage.showLegalLinks = args.show_legal_links === true;
  if (args.show_demo_cta !== undefined) next.nav.showDemoCta = args.show_demo_cta === true;
  if (args.show_sign_in !== undefined) next.nav.showSignIn = args.show_sign_in === true;

  const pages = parseJsonField<string[]>(args.pages, 'pages');
  if (pages === null) return { config: current, error: 'pages must be a JSON array of path strings' };
  if (pages) next.pages = pages;

  const navLinks = parseJsonField<SiteNavLink[]>(args.nav_links, 'nav_links');
  if (navLinks === null) return { config: current, error: 'nav_links must be a JSON array' };
  if (navLinks) next.nav.links = navLinks;

  const navGroups = parseJsonField<SiteNavGroup[]>(args.nav_groups, 'nav_groups');
  if (navGroups === null) return { config: current, error: 'nav_groups must be a JSON array' };
  if (navGroups) next.nav.groups = navGroups;

  const demoCta = parseJsonField<SiteNavLink>(args.demo_cta, 'demo_cta');
  if (demoCta === null) return { config: current, error: 'demo_cta must be a JSON object' };
  if (demoCta) next.nav.demoCta = demoCta;

  const ctas = parseJsonField<SiteHeroCta[]>(args.homepage_ctas, 'homepage_ctas');
  if (ctas === null) return { config: current, error: 'homepage_ctas must be a JSON array' };
  if (ctas) next.homepage.ctas = ctas;

  return { config: next };
}

async function handle_get_site_content(_args: Record<string, unknown>): Promise<string> {
  const key = typeof _args.content_key === 'string' ? _args.content_key.trim() : resolveSiteContentKey();
  const config = getSiteContent({ industry: key.startsWith('demo-') ? key.replace(/^demo-/, '') : null });
  return JSON.stringify({
    content_key: config.key,
    github_path: siteContentGithubPath(config.key),
    config,
    note: 'Structured site settings (nav, homepage flags, allowed pages). Page body copy lives in src/pages/ and src/components/ — use write_website_file for those.',
  });
}

async function handle_update_site_content(args: Record<string, unknown>): Promise<string> {
  if (!isGithubConfigured()) {
    return JSON.stringify({ error: 'GITHUB_TOKEN is required to persist website content changes' });
  }

  const contentKey =
    typeof args.content_key === 'string' && args.content_key.trim()
      ? args.content_key.trim().toLowerCase()
      : resolveSiteContentKey();
  const current = getSiteContent({
    industry: contentKey.startsWith('demo-') ? contentKey.replace(/^demo-/, '') : null,
  });
  const merged = mergeSiteContent({ ...current, key: contentKey }, args);
  if (merged.error) return JSON.stringify({ error: merged.error });

  const path = siteContentGithubPath(contentKey);
  const message =
    typeof args.commit_message === 'string' && args.commit_message.trim()
      ? args.commit_message.trim()
      : `Update site content (${contentKey})`;
  const content = `${JSON.stringify(merged.config, null, 2)}\n`;
  const branch = githubDefaultBranch();

  const writeArgs = { branch, path, content, message };
  const deferred = maybeDeferGithubWrite(writeArgs);
  if (deferred) {
    return JSON.stringify({
      ...deferred,
      content_key: contentKey,
      github_path: path,
      preview: merged.config,
    });
  }

  const result = await githubWriteFile(writeArgs);
  if (!result.ok) return JSON.stringify({ error: result.error });
  return JSON.stringify({
    ...result.data,
    content_key: contentKey,
    preview: merged.config,
  });
}

async function handle_write_website_file(args: Record<string, unknown>): Promise<string> {
  if (!isGithubConfigured()) {
    return JSON.stringify({ error: 'GITHUB_TOKEN is required to persist website file changes' });
  }

  const path = String(args.path ?? '').trim();
  const content = String(args.content ?? '');
  const message = String(args.message ?? '').trim();
  const branch = String(args.branch ?? githubDefaultBranch()).trim() || githubDefaultBranch();

  if (!path) return JSON.stringify({ error: 'path is required' });
  if (!message) return JSON.stringify({ error: 'commit message is required' });
  if (!isContentWebsitePath(path)) {
    return JSON.stringify({
      error: `path must start with one of: ${CONTENT_PATH_PREFIXES.join(', ')}`,
    });
  }

  const writeArgs = {
    repo: typeof args.repo === 'string' ? args.repo : undefined,
    branch,
    path,
    content,
    message,
    append: args.append === true,
  };
  const deferred = maybeDeferGithubWrite(writeArgs);
  if (deferred) return JSON.stringify(deferred);

  const result = await githubWriteFile(writeArgs);
  if (!result.ok) return JSON.stringify({ error: result.error });
  return JSON.stringify(result.data);
}

export const contentManagementModule: AgentToolModule = {
  id: 'contentManagement',
  enabled: () => hasFeature('content_management'),
  definitions(_ctx: ToolContext): AgentToolDef[] {
    return [
      {
        type: 'function',
        function: {
          name: 'get_site_content',
          description:
            'Read the active website content config: nav links, homepage headline, section toggles, and allowed pages. Config file lives at config/sites/{key}-config.json in GitHub.',
          parameters: {
            type: 'object',
            properties: {
              content_key: {
                type: 'string',
                description: 'Optional site content key (defaults to this install\'s siteContentKey).',
              },
            },
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'update_site_content',
          description:
            'Update structured website settings (headline, nav, homepage section toggles, allowed pages) and commit to main via GitHub. Triggers a Railway deploy. For page body copy in .astro files, use write_website_file instead.',
          parameters: {
            type: 'object',
            properties: {
              content_key: { type: 'string', description: 'Optional site content key override.' },
              hero_headline_html: {
                type: 'string',
                description: 'Homepage hero headline HTML (may include <br> tags).',
              },
              show_hero_demo: { type: 'boolean' },
              show_dialogue: { type: 'boolean' },
              show_integrations: { type: 'boolean' },
              show_features: { type: 'boolean' },
              show_contact: { type: 'boolean' },
              show_legal_links: { type: 'boolean' },
              show_demo_cta: { type: 'boolean' },
              show_sign_in: { type: 'boolean' },
              pages: {
                type: 'string',
                description: 'JSON array of allowed page paths, e.g. ["/","/about","/services"].',
              },
              nav_links: {
                type: 'string',
                description: 'JSON array of { href, label, primary?, external?, hideBelow? }.',
              },
              nav_groups: {
                type: 'string',
                description: 'JSON array of { id, label, links: [...] } for dropdown nav.',
              },
              demo_cta: {
                type: 'string',
                description: 'JSON object { href, label } for the demo CTA button.',
              },
              homepage_ctas: {
                type: 'string',
                description: 'JSON array of hero CTA buttons { href, label, variant? }.',
              },
              commit_message: {
                type: 'string',
                description: 'Git commit message (defaults to "Update site content").',
              },
            },
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'write_website_file',
          description:
            'Create or update a website source file on main via GitHub (pages, components, assets, public files, site config). Path must be under config/sites/, src/pages/, src/components/, src/assets/, src/content/, or public/. For long files, write in sections with append:true. Commits trigger Railway deploy.',
          parameters: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'Repo-relative file path.' },
              content: { type: 'string', description: 'Full file contents (or section when append:true).' },
              message: { type: 'string', description: 'Git commit message.' },
              branch: {
                type: 'string',
                description: `Branch to commit to (default: ${githubDefaultBranch()}).`,
              },
              append: {
                type: 'boolean',
                description: 'Append content to an existing file instead of replacing it.',
              },
              repo: {
                type: 'string',
                description: 'Optional owner/repo override (defaults to this app\'s GITHUB_REPO).',
              },
            },
            required: ['path', 'content', 'message'],
            additionalProperties: false,
          },
        },
      },
    ];
  },
  handlers: {
    get_site_content: handle_get_site_content,
    update_site_content: handle_update_site_content,
    write_website_file: handle_write_website_file,
  },
};
