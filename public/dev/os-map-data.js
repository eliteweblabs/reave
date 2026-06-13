// Reave Business OS — map data (single source of truth for the canvas).
// ⚠️ KEEP CURRENT: edit when the pipeline changes. Static diagram — not live Railway status.
//
// node:  { id, title, sub, icon, hue, ghost?, group?, x, y }
// edge:  { from, to, label?, dashed?, ghost? }
// group: { id, title, hue, members: [nodeId, ...] }

export const NODES = [
  // Entry points
  { id: 'tg_user', title: 'Telegram', sub: 'user', icon: '📱', hue: 205, group: 'clients', x: 60, y: 200 },
  { id: 'web', title: 'Web', sub: 'reave.app', icon: '🌐', hue: 285, group: 'clients', x: 60, y: 320 },
  { id: 'dev', title: 'Dashboard', sub: '/dev/os-map', icon: '🧑‍💻', hue: 325, group: 'clients', x: 60, y: 440 },

  // Hub + sibling services (Reave App on Railway)
  { id: 'reave', title: 'reave', sub: 'reave.app · /api/*', icon: '🔺', hue: 150, group: 'reave', x: 400, y: 320 },
  { id: 'contact_api', title: 'contact-api', sub: 'identity', icon: '🧩', hue: 30, group: 'reave', x: 720, y: 220 },
  { id: 'crater', title: 'crater', sub: 'invoicing', icon: '🧾', hue: 0, group: 'reave', x: 720, y: 320 },
  { id: 'calcom_api', title: 'calcom-booking-api', sub: 'bookings', icon: '🗓️', hue: 350, group: 'reave', x: 720, y: 420 },

  // External
  { id: 'anthropic', title: 'Anthropic', sub: 'Claude', icon: '🤖', hue: 265, group: 'external', x: 1040, y: 180 },
  { id: 'resend', title: 'Resend', sub: 'inbound email', icon: '✉️', hue: 330, group: 'external', x: 1040, y: 300 },
  { id: 'tg_api', title: 'Telegram API', sub: 'sendMessage', icon: '💬', hue: 200, group: 'external', x: 1040, y: 420 },
  { id: 'railway_gql', title: 'Railway', sub: 'projectCreate', icon: '🚆', hue: 185, group: 'external', x: 1040, y: 540 },
];

export const EDGES = [
  { from: 'tg_user', to: 'reave', label: 'webhook' },
  { from: 'web', to: 'reave' },
  { from: 'dev', to: 'reave' },
  { from: 'reave', to: 'contact_api' },
  { from: 'reave', to: 'crater' },
  { from: 'reave', to: 'calcom_api' },
  { from: 'reave', to: 'anthropic', label: 'LLM' },
  { from: 'reave', to: 'resend', label: 'inbound' },
  { from: 'reave', to: 'railway_gql', label: '/railway' },
  { from: 'reave', to: 'tg_api', label: 'notify' },
  { from: 'tg_api', to: 'tg_user', dashed: true, label: 'reply' },
];

export const GROUPS = [
  { id: 'clients', title: 'Entry points', hue: 300, members: ['tg_user', 'web', 'dev'] },
  { id: 'reave', title: 'Railway — Reave App', hue: 150, members: ['reave', 'contact_api', 'crater', 'calcom_api'] },
  { id: 'external', title: 'External', hue: 240, members: ['anthropic', 'resend', 'tg_api', 'railway_gql'] },
];
