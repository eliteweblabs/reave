#!/usr/bin/env node
/**
 * Generate a tailored deployment checklist from module playbooks.
 *
 * Usage:
 *   npm run deploy:checklist -- --install demo --modules scheduling,vapi,billing
 *   npm run deploy:checklist -- --install demo --all
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const FEATURE_LABELS: Record<string, string> = {
  client_portal: 'Client portal (/c/:uid)',
  web_handoff: 'Portal Data tab (handoff creds)',
  portal_assistant: 'Client portal help chat',
  billing: 'Crater billing & invoices',
  site_audits: 'Website Audit',
  site_monitoring: 'Website change monitoring',
  uptime_monitoring: 'Uptime monitoring',
  documents: 'Document signing templates',
  voice: 'Telnyx voice agent',
  vapi: 'Vapi assistant',
  carddav: 'CardDAV (iOS Contacts sync)',
  scheduling: 'Cal.com scheduling',
  dev_infra: 'Dev & infrastructure',
  code_dev: 'Local code tools',
  email_marketing: 'Newsletter & email automation',
  fleet_tracking: 'Fleet tracking',
  dealership_wizard: 'Dealership wizard',
  namecom_dns: 'DNS record management',
  time_tracking: 'Project time log',
  demo: 'Demo mode',
  real_estate_data: 'Real estate data & lead scanner',
  inventory_sync: 'Multi-channel inventory sync',
  online_reviews: 'Online reviews inbox',
  wayback_machine: 'Wayback Machine',
  stock_photos: 'Pexels stock photos',
};

const FEATURE_IDS = Object.keys(FEATURE_LABELS);

const DEMO_MODULE_CATALOG = FEATURE_IDS.map((feature, i) => ({
  id: String(i + 1).padStart(3, '0'),
  feature,
  label: FEATURE_LABELS[feature] ?? feature,
}));

function parseArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx >= 0 && process.argv[idx + 1] && !process.argv[idx + 1]!.startsWith('-')) {
    return process.argv[idx + 1];
  }
  const prefixed = process.argv.find((a) => a.startsWith(`${flag}=`));
  return prefixed?.slice(flag.length + 1);
}

const install = parseArg('--install') ?? 'default';
const modulesRaw = parseArg('--modules');
const allModules = process.argv.includes('--all');
const outArg = parseArg('--out');

type Playbook = {
  feature: string;
  label: string;
  status: string;
  stage: number;
  body: string;
  path: string;
  enabled: boolean;
};

function parseFrontmatter(raw: string): { meta: Record<string, string>; body: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { meta: {}, body: raw.trim() };
  const meta: Record<string, string> = {};
  for (const line of match[1]!.split('\n')) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    meta[line.slice(0, idx).trim()] = line.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
  }
  return { meta, body: match[2]!.trim() };
}

function loadInstallConfig(slug: string): { features: string[]; moduleStatus: Record<string, string> } {
  const path = join(ROOT, 'config', `config-${slug}.json`);
  if (!existsSync(path)) return { features: [], moduleStatus: {} };
  const raw = JSON.parse(readFileSync(path, 'utf8')) as {
    features?: string[];
    moduleStatus?: Record<string, string>;
  };
  return { features: raw.features ?? [], moduleStatus: raw.moduleStatus ?? {} };
}

function scanPlaybooks(installCfg: ReturnType<typeof loadInstallConfig>): Playbook[] {
  const byFeature = new Map<string, Omit<Playbook, 'enabled' | 'status'>>();

  const pluginsDir = join(ROOT, 'plugins');
  if (existsSync(pluginsDir)) {
    for (const dir of readdirSync(pluginsDir, { withFileTypes: true })) {
      if (!dir.isDirectory() || dir.name.startsWith('_')) continue;
      const p = join(pluginsDir, dir.name, 'DEPLOY.md');
      if (!existsSync(p)) continue;
      const { meta, body } = parseFrontmatter(readFileSync(p, 'utf8'));
      const feature = meta.feature?.trim();
      if (!feature || !FEATURE_LABELS[feature]) continue;
      byFeature.set(feature, {
        feature,
        label: FEATURE_LABELS[feature]!,
        stage: Number.parseInt(meta.stage ?? '3', 10) || 3,
        body,
        path: `plugins/${dir.name}/DEPLOY.md`,
      });
    }
  }

  const modulesDir = join(ROOT, 'config', 'modules');
  if (existsSync(modulesDir)) {
    for (const file of readdirSync(modulesDir)) {
      if (!file.endsWith('.DEPLOY.md')) continue;
      const p = join(modulesDir, file);
      const { meta, body } = parseFrontmatter(readFileSync(p, 'utf8'));
      const feature = meta.feature?.trim();
      if (!feature || !FEATURE_LABELS[feature]) continue;
      byFeature.set(feature, {
        feature,
        label: FEATURE_LABELS[feature]!,
        stage: Number.parseInt(meta.stage ?? '3', 10) || 3,
        body,
        path: `config/modules/${file}`,
      });
    }
  }

  return FEATURE_IDS.map((feature) => {
    const pb = byFeature.get(feature);
    const enabled = installCfg.features.includes(feature);
    const status = installCfg.moduleStatus[feature] ?? 'development';
    return {
      feature,
      label: FEATURE_LABELS[feature]!,
      status,
      stage: pb?.stage ?? 3,
      body: pb?.body ?? `_No DEPLOY.md for ${feature}_`,
      path: pb?.path ?? '',
      enabled,
    };
  });
}

function main(): void {
  const installCfg = loadInstallConfig(install);
  const catalog = scanPlaybooks(installCfg);

  const selectedIds = allModules
    ? catalog.map((m) => m.feature)
    : (modulesRaw ?? '')
        .split(/[,|\s]+/)
        .map((s) => s.trim())
        .filter(Boolean);

  const selected = selectedIds.length
    ? catalog.filter((m) => selectedIds.includes(m.feature))
    : catalog.filter((m) => m.enabled);

  const modulePicker = DEMO_MODULE_CATALOG.map(
    (e) => `- [ ] **${e.id}** — ${e.label} (\`${e.feature}\`)`,
  ).join('\n');

  const step3Modules = selected
    .filter((m) => m.stage === 3)
    .map(
      (m) =>
        `### ${m.label} (\`${m.feature}\`)\n\nStatus: **${m.status}** · Playbook: \`${m.path || 'n/a'}\`\n\n${m.body}\n`,
    )
    .join('\n');

  const doc = `# Deploy checklist — ${install}

Generated: ${new Date().toISOString()}

> Contacts, email inbox, work/jobs, knowledge, personal to-dos, and chat are always on.

## Module picker (numeric ids for demo URLs)

${modulePicker}

## Step 1 — App core

- [ ] Railway Astro service + Postgres
- [ ] \`DATABASE_URL\`
- [ ] Clerk keys + allowed origins
- [ ] \`INSTALL_CONFIG=${install}\`
- [ ] \`CONTACT_API_BASE_URL\` + \`CONTACT_API_KEY\`
- [ ] Resend inbound + \`RESEND_*\`
- [ ] \`ANTHROPIC_API_KEY\` + \`AGENT_ALERT_USER_ID\`

## Step 2 — Client baseline

- [ ] Company branding (Admin → Company)
- [ ] \`VAPID_*\` + \`PUSH_ENABLED\`
- [ ] \`GOOGLE_MAPS_API_KEY\` / Mapbox
- [ ] \`DASHBOARD_KEY\`
- [ ] Agent tools: \`BRAVE_API_KEY\`, \`PEXELS_API_KEY\`, \`SIRI_API_KEY\`

## Step 3 — Add-ons (selected)

${step3Modules || '_No modules selected — pass `--modules feature1,feature2` or `--all`._'}

## Demo suite URL

\`\`\`
/?demo=tier-1&modules=[001,004,006,009]&industry=plumbing
\`\`\`

Sign in to admin and run demo seed (owner) or ask the agent to *run demo seed* with \`fresh: true\`.
`;

  const outDir = join(ROOT, 'docs', 'deploy-checklists');
  mkdirSync(outDir, { recursive: true });
  const slug = selectedIds.length ? selectedIds.slice(0, 4).join('-') : 'baseline';
  const outPath = outArg ?? join(outDir, `${install}-${slug}.md`);
  writeFileSync(outPath, doc, 'utf8');
  console.log(`Wrote ${outPath}`);
}

main();
