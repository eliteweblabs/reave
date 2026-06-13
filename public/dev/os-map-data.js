// Reave Business OS — map data (single source of truth for the canvas).
// ⚠️ KEEP CURRENT: add/edit nodes + edges here whenever a feature, service,
//    API route, integration, or bot command changes. Rendered at /dev/os-map.
//
// node:  { id, title, sub, icon, hue, ghost?, group?, x, y }
// edge:  { from, to, label?, dashed?, ghost? }
// group: { id, title, hue, members: [nodeId, ...] }

export const NODES = [
  // Clients / entry points
  { id: 'tg_user', title: 'Telegram', sub: 'user / app', icon: '📱', hue: 205, group: 'clients', x: 60, y: 170 },
  { id: 'web', title: 'Web visitors', sub: 'reave.app', icon: '🌐', hue: 285, group: 'clients', x: 60, y: 300 },
  { id: 'dev', title: 'Dev / dashboard', sub: '/dev/os-map', icon: '🧑‍💻', hue: 325, group: 'clients', x: 60, y: 430 },

  // Reave App (Railway) — the hub
  { id: 'astro', title: 'reave', sub: 'reave.app · /api/*', icon: '🔺', hue: 150, group: 'reave', x: 430, y: 300 },
  { id: 'app_pg', title: 'reave-postgres', sub: 'volume', icon: '🗃️', hue: 215, ghost: true, group: 'reave', x: 430, y: 470 },
  { id: 'contact_api', title: 'contact-api', sub: 'Reave App', icon: '🧩', hue: 30, group: 'reave', x: 790, y: 160 },
  { id: 'contact_pg', title: 'contact-postgres', sub: 'volume', icon: '🗄️', hue: 48, group: 'reave', x: 790, y: 300 },
  { id: 'crater', title: 'crater', sub: 'ap.reave.app · invoicing', icon: '🧾', hue: 0, group: 'reave', x: 790, y: 440 },
  { id: 'crater_mysql', title: 'crater-mysql', sub: 'volume', icon: '🐬', hue: 12, group: 'reave', x: 990, y: 440 },
  { id: 'calcom_web', title: 'calcom-web-app', sub: 'cal.reave.app', icon: '📅', hue: 340, group: 'reave', x: 990, y: 300 },
  { id: 'calcom_api', title: 'calcom-booking-api', sub: 'booking API', icon: '🗓️', hue: 350, group: 'reave', x: 990, y: 160 },

  // External APIs
  { id: 'anthropic', title: 'Anthropic', sub: 'Claude Messages', icon: '🤖', hue: 265, group: 'external', x: 1160, y: 120 },
  { id: 'railway_gql', title: 'Railway GraphQL', sub: 'projectCreate', icon: '🚆', hue: 185, group: 'external', x: 1160, y: 260 },
  { id: 'resend', title: 'Resend', sub: 'inbound · marketing', icon: '✉️', hue: 330, group: 'external', x: 1160, y: 400 },
  { id: 'tg_api', title: 'Telegram Bot API', sub: 'sendMessage', icon: '💬', hue: 200, group: 'external', x: 1160, y: 540 },

  // Retired — inbound email now handled on reave via Resend webhook
  { id: 'imap', title: 'email-tools', sub: 'retired · IMAP monitor', icon: '📨', hue: 100, ghost: true, group: 'email_tools', x: 790, y: 620 },
];

export const EDGES = [
  { from: 'tg_user', to: 'astro', label: 'webhook' },
  { from: 'web', to: 'astro' },
  { from: 'dev', to: 'astro' },
  { from: 'astro', to: 'tg_api', label: 'sendMessage' },
  { from: 'tg_api', to: 'tg_user', dashed: true, label: 'reply' },
  { from: 'astro', to: 'anthropic', label: 'freeform LLM' },
  { from: 'astro', to: 'contact_api', label: 'resolve' },
  { from: 'contact_api', to: 'contact_pg' },
  { from: 'astro', to: 'railway_gql', label: '/railway project' },
  { from: 'astro', to: 'crater', label: 'custom API' },
  { from: 'crater', to: 'crater_mysql' },
  { from: 'astro', to: 'resend', label: 'inbound webhook' },
  { from: 'astro', to: 'app_pg', label: 'future', ghost: true, dashed: true },
  { from: 'calcom_web', to: 'app_pg', dashed: true },
  { from: 'calcom_api', to: 'app_pg', dashed: true },
  { from: 'imap', to: 'tg_api', label: 'trigger:telegram' },
];

export const GROUPS = [
  { id: 'clients', title: 'Entry points', hue: 300, members: ['tg_user', 'web', 'dev'] },
  {
    id: 'reave',
    title: 'Railway — Reave App',
    hue: 150,
    members: ['astro', 'app_pg', 'contact_api', 'contact_pg', 'crater', 'crater_mysql', 'calcom_web', 'calcom_api'],
  },
  { id: 'external', title: 'External APIs', hue: 240, members: ['anthropic', 'railway_gql', 'resend', 'tg_api'] },
  { id: 'email_tools', title: 'Railway — email-tools', hue: 100, members: ['imap'] },
];
