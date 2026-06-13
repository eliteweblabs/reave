// Reave Business OS — map data (single source of truth for the canvas).
// ⚠️ KEEP CURRENT: add/edit nodes + edges here whenever a feature, service,
//    API route, integration, bot command, MCP server, or CLI changes.
//    Rendered at /dev/os-map (tabbed: "System" runtime + "MCP & CLI" tooling).
//
// node:  { id, title, sub, icon, hue, status?, ghost?, group?, x, y }
// edge:  { from, to, label?, dashed?, ghost? }
// group: { id, title, hue, members: [nodeId, ...] }
//
// Each map is { id, title, nodes, edges, groups } in MAPS below.

// ───────────────────────── SYSTEM (runtime architecture) ─────────────────────────
const SYSTEM_NODES = [
  // Clients / entry points
  { id: 'tg_user', title: 'Telegram', sub: 'user / app', icon: '📱', hue: 205, group: 'clients', x: 60, y: 170 },
  { id: 'web', title: 'Web visitors', sub: 'reave.app', icon: '🌐', hue: 285, group: 'clients', x: 60, y: 300 },
  { id: 'dev', title: 'Dev / dashboard', sub: '/dev/os-map', icon: '🧑‍💻', hue: 325, group: 'clients', x: 60, y: 430 },

  // Reave App (Railway) — the hub
  { id: 'astro', title: 'Astro / API', sub: 'reave.app · /api/*', icon: '🔺', hue: 150, status: true, group: 'reave', x: 430, y: 300 },
  { id: 'app_pg', title: 'App Postgres', sub: 'future', icon: '🗃️', hue: 215, ghost: true, group: 'reave', x: 430, y: 470 },
  { id: 'contact_api', title: 'contact-api', sub: 'Reave App', icon: '🧩', hue: 30, status: true, group: 'reave', x: 790, y: 160 },
  { id: 'contact_pg', title: 'contact-postgres', sub: 'volume', icon: '🗄️', hue: 48, status: true, group: 'reave', x: 790, y: 300 },
  { id: 'crater', title: 'Crater', sub: 'ap.reave.app · invoicing', icon: '🧾', hue: 0, status: true, group: 'reave', x: 790, y: 440 },

  // External APIs
  { id: 'anthropic', title: 'Anthropic', sub: 'Claude Messages', icon: '🤖', hue: 265, status: true, group: 'external', x: 1160, y: 120 },
  { id: 'railway_gql', title: 'Railway GraphQL', sub: 'projectCreate', icon: '🚆', hue: 185, status: true, group: 'external', x: 1160, y: 260 },
  { id: 'resend', title: 'Resend', sub: 'inbound · marketing', icon: '✉️', hue: 330, status: true, group: 'external', x: 1160, y: 400 },
  { id: 'tg_api', title: 'Telegram Bot API', sub: 'sendMessage', icon: '💬', hue: 200, status: true, group: 'external', x: 1160, y: 540 },
  { id: 'github', title: 'GitHub', sub: 'eliteweblabs/reave · REST', icon: '🐙', hue: 235, group: 'external', x: 1160, y: 680 },

  // Separate Railway service
  { id: 'imap', title: 'openclaw-email-tools', sub: 'IMAP · watches Gmail', icon: '📨', hue: 100, status: true, group: 'openclaw', x: 790, y: 620 },
];

const SYSTEM_EDGES = [
  { from: 'tg_user', to: 'astro', label: 'webhook' },
  { from: 'web', to: 'astro' },
  { from: 'dev', to: 'astro' },
  { from: 'astro', to: 'tg_api', label: 'sendMessage' },
  { from: 'tg_api', to: 'tg_user', dashed: true, label: 'reply' },
  { from: 'astro', to: 'anthropic', label: 'freeform LLM' },
  { from: 'astro', to: 'contact_api', label: 'resolve' },
  { from: 'contact_api', to: 'contact_pg' },
  { from: 'astro', to: 'railway_gql', label: '/railway project' },
  { from: 'astro', to: 'crater', label: '/invoice' },
  { from: 'astro', to: 'resend', label: 'inbound webhook' },
  { from: 'astro', to: 'app_pg', label: 'future', ghost: true, dashed: true },
  { from: 'astro', to: 'github', label: 'status / commits' },
  { from: 'imap', to: 'tg_api', label: 'trigger:telegram' },
];

const SYSTEM_GROUPS = [
  { id: 'clients', title: 'Entry points', hue: 300, members: ['tg_user', 'web', 'dev'] },
  { id: 'reave', title: 'Railway — Reave App', hue: 150, members: ['astro', 'app_pg', 'contact_api', 'contact_pg', 'crater'] },
  { id: 'external', title: 'External APIs', hue: 240, members: ['anthropic', 'railway_gql', 'resend', 'tg_api', 'github'] },
  { id: 'openclaw', title: 'Railway — openclaw-email-tools', hue: 100, members: ['imap'] },
];

// ───────────────────────── MCP & CLI (dev tooling plane) ─────────────────────────
// "What can talk to what" from the IDE/agent: MCP servers and CLIs, and which
// external platform each reaches. Same vendor shares a hue across mcp/cli/svc.
const TOOLING_NODES = [
  // Who initiates the calls
  { id: 't_agent', title: 'Cursor Agent', sub: 'IDE · tool calls', icon: '🧠', hue: 265, group: 't_ide', x: 40, y: 380 },
  { id: 't_shell', title: 'Shell / terminal', sub: 'runs CLIs', icon: '⌨️', hue: 200, group: 't_ide', x: 40, y: 620 },

  // MCP servers (Cursor plugins available to the agent)
  { id: 'mcp_github', title: 'GitHub MCP', sub: 'user-GitHub', icon: '🐙', hue: 0, group: 't_mcp', x: 360, y: 20 },
  { id: 'mcp_railway', title: 'Railway MCP', sub: 'user-Railway', icon: '🚆', hue: 25, group: 't_mcp', x: 360, y: 110 },
  { id: 'mcp_supabase', title: 'Supabase MCP', sub: 'user-Supabase', icon: '🟩', hue: 140, group: 't_mcp', x: 360, y: 200 },
  { id: 'mcp_stripe', title: 'Stripe MCP', sub: 'plugin-stripe', icon: '💳', hue: 255, group: 't_mcp', x: 360, y: 290 },
  { id: 'mcp_webflow', title: 'Webflow MCP', sub: 'plugin-webflow', icon: '🌊', hue: 220, group: 't_mcp', x: 360, y: 380 },
  { id: 'mcp_resend', title: 'Resend MCP', sub: 'plugin-resend', icon: '✉️', hue: 330, group: 't_mcp', x: 360, y: 470 },
  { id: 'mcp_bstack', title: 'BrowserStack MCP', sub: 'plugin-browserstack', icon: '🧪', hue: 35, group: 't_mcp', x: 360, y: 560 },
  { id: 'mcp_browser', title: 'IDE Browser MCP', sub: 'cursor-ide-browser', icon: '🧭', hue: 190, group: 't_mcp', x: 360, y: 650 },
  { id: 'mcp_appctl', title: 'App Control MCP', sub: 'cursor-app-control', icon: '🎛️', hue: 300, group: 't_mcp', x: 360, y: 740 },
  { id: 'mcp_tts', title: 'TTS MCP', sub: 'user-tts', icon: '🔊', hue: 50, group: 't_mcp', x: 360, y: 830 },

  // CLIs (terminal tools)
  { id: 'cli_railway', title: 'railway', sub: 'CLI · deploy · vars', icon: '🚆', hue: 25, group: 't_cli', x: 660, y: 110 },
  { id: 'cli_gh', title: 'gh', sub: 'GitHub CLI · PRs', icon: '🐙', hue: 0, group: 't_cli', x: 660, y: 200 },
  { id: 'cli_supabase', title: 'supabase', sub: 'CLI · migrations', icon: '🟩', hue: 140, group: 't_cli', x: 660, y: 290 },
  { id: 'cli_webflow', title: 'webflow', sub: 'CLI · components', icon: '🌊', hue: 220, group: 't_cli', x: 660, y: 380 },
  { id: 'cli_resend', title: 'resend', sub: 'CLI · emails', icon: '✉️', hue: 330, group: 't_cli', x: 660, y: 470 },
  { id: 'cli_astro', title: 'astro', sub: 'dev · build · check', icon: '🔺', hue: 150, group: 't_cli', x: 660, y: 560 },
  { id: 'cli_npm', title: 'npm', sub: 'install · scripts', icon: '📦', hue: 15, group: 't_cli', x: 660, y: 650 },

  // External platforms each tool can reach
  { id: 'svc_github', title: 'GitHub', sub: 'repo · CI', icon: '🐙', hue: 0, group: 't_svc', x: 980, y: 80 },
  { id: 'svc_railway', title: 'Railway', sub: 'hosting · deploys', icon: '🚆', hue: 25, group: 't_svc', x: 980, y: 200 },
  { id: 'svc_supabase', title: 'Supabase', sub: 'Postgres · auth', icon: '🟩', hue: 140, group: 't_svc', x: 980, y: 320 },
  { id: 'svc_stripe', title: 'Stripe', sub: 'payments', icon: '💳', hue: 255, group: 't_svc', x: 980, y: 440 },
  { id: 'svc_webflow', title: 'Webflow', sub: 'CMS · sites', icon: '🌊', hue: 220, group: 't_svc', x: 980, y: 560 },
  { id: 'svc_resend', title: 'Resend', sub: 'email API', icon: '✉️', hue: 330, group: 't_svc', x: 980, y: 680 },
  { id: 'svc_bstack', title: 'BrowserStack', sub: 'device cloud', icon: '🧪', hue: 35, group: 't_svc', x: 980, y: 800 },

  // Production target (ties tooling back to the live app)
  { id: 't_prod', title: 'Reave App', sub: 'reave.app (prod)', icon: '🔺', hue: 150, group: 't_prod', x: 1320, y: 300 },
];

const TOOLING_EDGES = [
  // Agent → MCP servers
  { from: 't_agent', to: 'mcp_github' },
  { from: 't_agent', to: 'mcp_railway' },
  { from: 't_agent', to: 'mcp_supabase' },
  { from: 't_agent', to: 'mcp_stripe' },
  { from: 't_agent', to: 'mcp_webflow' },
  { from: 't_agent', to: 'mcp_resend' },
  { from: 't_agent', to: 'mcp_bstack' },
  { from: 't_agent', to: 'mcp_browser' },
  { from: 't_agent', to: 'mcp_appctl' },
  { from: 't_agent', to: 'mcp_tts' },

  // Agent → shell → CLIs
  { from: 't_agent', to: 't_shell', label: 'run' },
  { from: 't_shell', to: 'cli_railway' },
  { from: 't_shell', to: 'cli_gh' },
  { from: 't_shell', to: 'cli_supabase' },
  { from: 't_shell', to: 'cli_webflow' },
  { from: 't_shell', to: 'cli_resend' },
  { from: 't_shell', to: 'cli_astro' },
  { from: 't_shell', to: 'cli_npm' },

  // MCP servers → platforms
  { from: 'mcp_github', to: 'svc_github' },
  { from: 'mcp_railway', to: 'svc_railway' },
  { from: 'mcp_supabase', to: 'svc_supabase' },
  { from: 'mcp_stripe', to: 'svc_stripe' },
  { from: 'mcp_webflow', to: 'svc_webflow' },
  { from: 'mcp_resend', to: 'svc_resend' },
  { from: 'mcp_bstack', to: 'svc_bstack' },

  // CLIs → platforms
  { from: 'cli_railway', to: 'svc_railway' },
  { from: 'cli_gh', to: 'svc_github' },
  { from: 'cli_supabase', to: 'svc_supabase' },
  { from: 'cli_webflow', to: 'svc_webflow' },
  { from: 'cli_resend', to: 'svc_resend' },
  { from: 'cli_astro', to: 't_prod', label: 'build' },

  // Platforms → production
  { from: 'svc_github', to: 'svc_railway', label: 'deploy', dashed: true },
  { from: 'svc_railway', to: 't_prod', label: 'hosts' },
];

const TOOLING_GROUPS = [
  { id: 't_ide', title: 'IDE / agent', hue: 265, members: ['t_agent', 't_shell'] },
  { id: 't_mcp', title: 'MCP servers', hue: 200, members: ['mcp_github', 'mcp_railway', 'mcp_supabase', 'mcp_stripe', 'mcp_webflow', 'mcp_resend', 'mcp_bstack', 'mcp_browser', 'mcp_appctl', 'mcp_tts'] },
  { id: 't_cli', title: 'CLIs', hue: 40, members: ['cli_railway', 'cli_gh', 'cli_supabase', 'cli_webflow', 'cli_resend', 'cli_astro', 'cli_npm'] },
  { id: 't_svc', title: 'Platforms & services', hue: 330, members: ['svc_github', 'svc_railway', 'svc_supabase', 'svc_stripe', 'svc_webflow', 'svc_resend', 'svc_bstack'] },
  { id: 't_prod', title: 'Production', hue: 150, members: ['t_prod'] },
];

// ───────────────────────── exports ─────────────────────────
export const MAPS = {
  system: { id: 'system', title: 'System', nodes: SYSTEM_NODES, edges: SYSTEM_EDGES, groups: SYSTEM_GROUPS },
  tooling: { id: 'tooling', title: 'MCP & CLI', nodes: TOOLING_NODES, edges: TOOLING_EDGES, groups: TOOLING_GROUPS },
};

// Back-compat: the "System" map is still the default export surface.
export const NODES = SYSTEM_NODES;
export const EDGES = SYSTEM_EDGES;
export const GROUPS = SYSTEM_GROUPS;
