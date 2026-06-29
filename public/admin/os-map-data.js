// Reave Business OS — map data (single source of truth for the canvas).
// ⚠️ KEEP CURRENT: add/edit nodes + edges here whenever a feature, service,
//    API route, integration, bot command, MCP server, or CLI changes.
//    Rendered at /admin/ (tabbed: "System" runtime + "MCP & CLI" tooling).
//
// node:  { id, title, sub, icon, brand?, hue, status?, ghost?, group?, x, y }
// edge:  { from, to, label?, dashed?, ghost? }
// group: { id, title, hue, members: [nodeId, ...] }
//
// `brand` is a Simple Icons slug (https://simpleicons.org → click a title to
// copy its slug). When set, the card renders that company's real logo (tinted
// to the node hue) instead of the `icon` emoji, which stays as the fallback for
// brands Simple Icons doesn't carry (e.g. Twilio, BrowserStack) or generic nodes.
//
// Each map is { id, title, nodes, edges, groups } in MAPS below.

// ───────────────────────── SYSTEM (runtime architecture) ─────────────────────────
const SYSTEM_NODES = [
  // Clients / entry points
  { id: 'tg_user', title: 'Telegram', sub: 'user / app', icon: '📱', brand: 'telegram', hue: 205, group: 'clients', x: 60, y: 130 },
  { id: 'web', title: 'Web visitors', sub: 'reave.app · /form/* · /doc/*', icon: '🌐', hue: 285, group: 'clients', x: 60, y: 260 },
  { id: 'sms_caller', title: 'SMS / caller', sub: 'Telnyx number', icon: '☎️', hue: 175, group: 'clients', x: 60, y: 390 },
  { id: 'dev', title: 'Admin / dashboard', sub: '/admin/ · Clerk · PWA push', icon: '🧑‍💻', brand: 'cursor', hue: 325, group: 'clients', x: 60, y: 520 },
  { id: 'vapi', title: 'Vapi', sub: 'homepage voice widget · browser SDK', icon: '🎙️', hue: 310, status: true, group: 'clients', x: 60, y: 650 },

  // Reave App (Railway) — the hub
  { id: 'astro', title: 'Astro / API', sub: 'reave.app · /api/* · middleware · FEATURES', icon: '🔺', brand: 'astro', hue: 150, status: true, group: 'reave', x: 400, y: 280 },
  { id: 'app_pg', title: 'App Postgres', sub: 'chats · knowledge · jobs · email · push subs', icon: '🗃️', brand: 'postgresql', hue: 215, status: true, group: 'reave', x: 400, y: 430 },
  { id: 'web_push', title: 'Web Push', sub: 'admin PWA · inbox · site-change alerts', icon: '🔔', hue: 45, status: true, group: 'reave', x: 640, y: 120 },
  { id: 'contacts_dash', title: 'Contacts dashboard', sub: '/admin/contacts · Clerk + DASHBOARD_KEY', icon: '📊', hue: 195, status: true, group: 'reave', x: 400, y: 120 },
  { id: 'contact_api', title: 'contact-api', sub: 'contacts · portals · CardDAV backend', icon: '🧩', hue: 30, status: true, group: 'reave', x: 880, y: 120 },
  { id: 'contact_pg', title: 'contact-postgres', sub: 'volume', icon: '🗄️', brand: 'postgresql', hue: 48, status: true, group: 'reave', x: 880, y: 264 },
  { id: 'crater', title: 'Crater', sub: 'ap.reave.app · invoicing (FEATURES: billing)', icon: '🧾', hue: 0, status: true, group: 'reave', x: 880, y: 408 },
  { id: 'portal', title: 'Client portal', sub: '/c/:uid · PWA (FEATURES: client_portal)', icon: '📇', hue: 320, status: true, group: 'reave', x: 640, y: 408 },
  { id: 'carddav', title: 'CardDAV', sub: '/carddav · iOS sync (FEATURES: carddav)', icon: '📲', hue: 275, status: true, group: 'reave', x: 640, y: 264 },

  // External APIs
  { id: 'anthropic', title: 'Anthropic', sub: 'agent · SMS AI · email triage · voice', icon: '🤖', brand: 'anthropic', hue: 265, status: true, group: 'external', x: 1160, y: 100 },
  { id: 'railway_gql', title: 'Railway GraphQL', sub: 'outbound · projectCreate · domains', icon: '🚆', brand: 'railway', hue: 185, status: true, group: 'external', x: 1160, y: 220 },
  { id: 'railway_webhook', title: 'Railway webhooks', sub: 'inbound deploy alerts · /api/railway/webhook', icon: '🚦', brand: 'railway', hue: 25, status: true, group: 'external', x: 1160, y: 340 },
  { id: 'resend', title: 'Resend', sub: 'inbound webhook · outbound portal/forms/docs', icon: '✉️', brand: 'resend', hue: 330, status: true, group: 'external', x: 1160, y: 460 },
  { id: 'tg_api', title: 'Telegram Bot API', sub: 'sendMessage · deploy/email alerts', icon: '💬', brand: 'telegram', hue: 200, status: true, group: 'external', x: 1160, y: 580 },
  { id: 'github', title: 'GitHub', sub: 'eliteweblabs/reave · REST · write/PR', icon: '🐙', brand: 'github', hue: 235, status: true, group: 'external', x: 1160, y: 700 },
  { id: 'telnyx', title: 'Telnyx', sub: 'SMS · AI voice agent (FEATURES: voice)', icon: '📲', hue: 175, status: true, group: 'external', x: 1160, y: 820 },
  { id: 'changedetection', title: 'ChangeDetection.io', sub: 'site watches (FEATURES: site_monitoring)', icon: '👁️', hue: 55, status: true, group: 'external', x: 1160, y: 940 },
  { id: 'clerk', title: 'Clerk', sub: 'auth · /admin/* · chats · profile', icon: '🔐', brand: 'clerk', hue: 290, status: true, group: 'external', x: 1160, y: 1060 },
];

const SYSTEM_EDGES = [
  { from: 'tg_user', to: 'astro', label: 'webhook' },
  { from: 'web', to: 'astro' },
  { from: 'web', to: 'vapi', label: 'voice widget', dashed: true },
  { from: 'web', to: 'portal', label: 'share link', dashed: true },
  { from: 'sms_caller', to: 'telnyx', label: 'SMS / call' },
  { from: 'dev', to: 'clerk', label: 'sign-in' },
  { from: 'clerk', to: 'astro', dashed: true },
  { from: 'dev', to: 'contacts_dash', label: 'view DB', dashed: true },
  { from: 'astro', to: 'tg_api', label: 'sendMessage' },
  { from: 'tg_api', to: 'tg_user', dashed: true, label: 'reply' },
  { from: 'astro', to: 'anthropic', label: 'Claude tool loop' },
  { from: 'astro', to: 'contact_api', label: 'resolve' },
  { from: 'astro', to: 'carddav', label: 'CardDAV' },
  { from: 'carddav', to: 'contact_api', label: 'vCard CRUD' },
  { from: 'astro', to: 'portal', label: 'serves /c/:uid' },
  { from: 'portal', to: 'contact_api', label: 'portal link (read/write)' },
  { from: 'portal', to: 'crater', label: 'billing', dashed: true },
  { from: 'portal', to: 'changedetection', label: 'site watch sync', dashed: true },
  { from: 'astro', to: 'telnyx', label: 'SMS send · call control', dashed: true },
  { from: 'telnyx', to: 'astro', label: 'SMS · voice webhooks', dashed: true },
  { from: 'telnyx', to: 'anthropic', label: 'voice agent', dashed: true },
  { from: 'contacts_dash', to: 'contact_api', label: 'list contacts' },
  { from: 'contact_api', to: 'contact_pg' },
  { from: 'astro', to: 'railway_gql', label: 'GraphQL · /railway' },
  { from: 'astro', to: 'crater', label: 'billing API' },
  { from: 'astro', to: 'resend', label: 'outbound send' },
  { from: 'resend', to: 'astro', label: 'inbound webhook', dashed: true },
  { from: 'resend', to: 'tg_api', label: 'email alert', dashed: true },
  { from: 'astro', to: 'app_pg', label: 'DATABASE_URL' },
  { from: 'astro', to: 'github', label: 'status · commits · PR' },
  { from: 'astro', to: 'changedetection', label: 'watch CRUD', dashed: true },
  { from: 'changedetection', to: 'astro', label: 'change webhook', dashed: true },
  { from: 'astro', to: 'web_push', label: 'inbox · site alerts' },
  { from: 'railway_webhook', to: 'astro', label: 'deploy webhook' },
  { from: 'railway_webhook', to: 'tg_api', label: 'deploy alert', dashed: true },
];

const SYSTEM_GROUPS = [
  { id: 'clients', title: 'Entry points', hue: 300, members: ['tg_user', 'web', 'sms_caller', 'dev', 'vapi'] },
  { id: 'reave', title: 'Railway — Reave App', hue: 150, members: ['astro', 'app_pg', 'web_push', 'contact_api', 'contact_pg', 'crater', 'portal', 'carddav', 'contacts_dash'] },
  { id: 'external', title: 'External APIs', hue: 240, members: ['anthropic', 'railway_gql', 'railway_webhook', 'resend', 'tg_api', 'github', 'telnyx', 'changedetection', 'clerk'] },
];

// ───────────────────────── MCP & CLI (dev tooling plane) ─────────────────────────
// "What can talk to what" from the IDE/agent: MCP servers and CLIs, and which
// external platform each reaches. Same vendor shares a hue across mcp/cli/svc.
const TOOLING_NODES = [
  // Who initiates the calls
  { id: 't_agent', title: 'Cursor Agent', sub: 'IDE · tool calls', icon: '🧠', brand: 'cursor', hue: 265, group: 't_ide', x: 40, y: 380 },
  { id: 't_shell', title: 'Shell / terminal', sub: 'runs CLIs', icon: '⌨️', hue: 200, group: 't_ide', x: 40, y: 620 },

  // MCP servers (Cursor plugins available to the agent)
  { id: 'mcp_github', title: 'GitHub MCP', sub: 'user-GitHub', icon: '🐙', brand: 'github', hue: 0, group: 't_mcp', x: 360, y: 20 },
  { id: 'mcp_railway', title: 'Railway MCP', sub: 'user-Railway', icon: '🚆', brand: 'railway', hue: 25, group: 't_mcp', x: 360, y: 110 },
  { id: 'mcp_supabase', title: 'Supabase MCP', sub: 'user-Supabase', icon: '🟩', brand: 'supabase', hue: 140, group: 't_mcp', x: 360, y: 200 },
  { id: 'mcp_stripe', title: 'Stripe MCP', sub: 'plugin-stripe', icon: '💳', brand: 'stripe', hue: 255, group: 't_mcp', x: 360, y: 290 },
  { id: 'mcp_webflow', title: 'Webflow MCP', sub: 'plugin-webflow', icon: '🌊', brand: 'webflow', hue: 220, group: 't_mcp', x: 360, y: 380 },
  { id: 'mcp_resend', title: 'Resend MCP', sub: 'plugin-resend', icon: '✉️', brand: 'resend', hue: 330, group: 't_mcp', x: 360, y: 470 },
  { id: 'mcp_bstack', title: 'BrowserStack MCP', sub: 'plugin-browserstack', icon: '🧪', hue: 35, group: 't_mcp', x: 360, y: 560 },
  { id: 'mcp_browser', title: 'IDE Browser MCP', sub: 'cursor-ide-browser', icon: '🧭', brand: 'cursor', hue: 190, group: 't_mcp', x: 360, y: 650 },
  { id: 'mcp_appctl', title: 'App Control MCP', sub: 'cursor-app-control', icon: '🎛️', brand: 'cursor', hue: 300, group: 't_mcp', x: 360, y: 740 },
  { id: 'mcp_tts', title: 'TTS MCP', sub: 'user-tts', icon: '🔊', hue: 50, group: 't_mcp', x: 360, y: 830 },

  // CLIs (terminal tools)
  { id: 'cli_railway', title: 'railway', sub: 'CLI · deploy · vars', icon: '🚆', brand: 'railway', hue: 25, group: 't_cli', x: 660, y: 110 },
  { id: 'cli_gh', title: 'gh', sub: 'GitHub CLI · PRs', icon: '🐙', brand: 'github', hue: 0, group: 't_cli', x: 660, y: 200 },
  { id: 'cli_supabase', title: 'supabase', sub: 'CLI · migrations', icon: '🟩', brand: 'supabase', hue: 140, group: 't_cli', x: 660, y: 290 },
  { id: 'cli_webflow', title: 'webflow', sub: 'CLI · components', icon: '🌊', brand: 'webflow', hue: 220, group: 't_cli', x: 660, y: 380 },
  { id: 'cli_resend', title: 'resend', sub: 'CLI · emails', icon: '✉️', brand: 'resend', hue: 330, group: 't_cli', x: 660, y: 470 },
  { id: 'cli_astro', title: 'astro', sub: 'dev · build · check', icon: '🔺', brand: 'astro', hue: 150, group: 't_cli', x: 660, y: 560 },
  { id: 'cli_npm', title: 'npm', sub: 'install · scripts', icon: '📦', brand: 'npm', hue: 15, group: 't_cli', x: 660, y: 650 },

  // External platforms each tool can reach
  { id: 'svc_github', title: 'GitHub', sub: 'repo · CI', icon: '🐙', brand: 'github', hue: 0, group: 't_svc', x: 980, y: 80 },
  { id: 'svc_railway', title: 'Railway', sub: 'hosting · deploys', icon: '🚆', brand: 'railway', hue: 25, group: 't_svc', x: 980, y: 200 },
  { id: 'svc_supabase', title: 'Supabase', sub: 'Postgres · auth', icon: '🟩', brand: 'supabase', hue: 140, group: 't_svc', x: 980, y: 320 },
  { id: 'svc_stripe', title: 'Stripe', sub: 'payments', icon: '💳', brand: 'stripe', hue: 255, group: 't_svc', x: 980, y: 440 },
  { id: 'svc_webflow', title: 'Webflow', sub: 'CMS · sites', icon: '🌊', brand: 'webflow', hue: 220, group: 't_svc', x: 980, y: 560 },
  { id: 'svc_resend', title: 'Resend', sub: 'email API', icon: '✉️', brand: 'resend', hue: 330, group: 't_svc', x: 980, y: 680 },
  { id: 'svc_bstack', title: 'BrowserStack', sub: 'device cloud', icon: '🧪', hue: 35, group: 't_svc', x: 980, y: 800 },

  // Production target (ties tooling back to the live app)
  { id: 't_prod', title: 'Reave App', sub: 'reave.app (prod)', icon: '🔺', brand: 'astro', hue: 150, group: 't_prod', x: 1320, y: 300 },
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

// ───────────────────────── TELEGRAM COMMANDS (bot interface) ─────────────────────────
// Shows the full Telegram bot surface: slash commands (direct, no LLM) + Claude
// agent tool categories. Useful for remembering what you can ask the bot to do.
const TG_NODES = [
  // Entry
  { id: 'tc_you',     title: 'You',            sub: 'Telegram message',           icon: '📱', brand: 'telegram', hue: 205, group: 'tc_entry',  x: 60,   y: 540 },
  { id: 'tc_handler', title: 'Bot handler',     sub: 'auth · history · route',     icon: '⚙️', hue: 185,          group: 'tc_entry',  x: 360,  y: 540 },
  { id: 'tc_cheat',   title: 'Cheat sheet',     sub: '/admin/telegram · plain list', icon: '📋', hue: 95,           group: 'tc_entry',  x: 60,   y: 700 },

  // Routing nodes
  { id: 'tc_slash',  title: 'Slash commands',  sub: 'instant · no LLM',           icon: '⚡', hue: 55,           group: 'tc_routing', x: 660,  y: 240 },
  { id: 'tc_claude', title: 'Claude agent',    sub: 'freeform · /model · up to 25 rounds', icon: '🤖', brand: 'anthropic', hue: 265, group: 'tc_routing', x: 660,  y: 820 },

  // Slash commands (one node per command or tight group)
  { id: 'tc_cmd_util',      title: '/help · /clear · /model', sub: 'menu · wipe history · switch model',        icon: '🛠️', hue: 160, group: 'tc_slash_grp', x: 960, y: 60  },
  { id: 'tc_cmd_knowledge', title: '/knowledge · /get',       sub: 'list & read knowledge docs (/start=/knowledge)', icon: '📚', hue: 130, group: 'tc_slash_grp', x: 960, y: 180 },
  { id: 'tc_cmd_resolve',   title: '/resolve · /who',         sub: 'fuzzy contact lookup',                      icon: '👤', hue: 30,  group: 'tc_slash_grp', x: 960, y: 300 },
  { id: 'tc_cmd_invoice',   title: '/invoices',               sub: 'list recent invoices',                      icon: '🧾', hue: 0,   group: 'tc_slash_grp', x: 960, y: 420 },
  { id: 'tc_cmd_railway',   title: '/railway project',        sub: 'new project (/railway help)',               icon: '🚆', brand: 'railway', hue: 25, group: 'tc_slash_grp', x: 960, y: 540 },

  // LLM tool categories (what Claude can call)
  { id: 'tc_tool_knowledge', title: 'Knowledge tools',  sub: 'list/read/create/update/delete work · knowledge tools', icon: '📚', hue: 130, group: 'tc_tools', x: 960, y: 700  },
  { id: 'tc_tool_devops',    title: 'DevOps tools',     sub: 'git_status · create_github_branch · write · PR',        icon: '🔧', hue: 185, group: 'tc_tools', x: 960, y: 820  },
  { id: 'tc_tool_contacts',  title: 'Contact tools',    sub: 'resolve · list · create · update · delete',                      icon: '👥', hue: 30,  group: 'tc_tools', x: 960, y: 940  },
  { id: 'tc_tool_portal',    title: 'Portal tools',     sub: 'get · set · send_client_portal',                                        icon: '📇', hue: 320, group: 'tc_tools', x: 960, y: 1060 },
  { id: 'tc_tool_billing',   title: 'Billing tools',    sub: 'create_invoice · record_payment · recurring · repair (14 tools)',       icon: '🧾', hue: 0,   group: 'tc_tools', x: 960, y: 1180 },
  { id: 'tc_tool_web',       title: 'Web tools',        sub: 'fetch_url · lighthouse · ssl · links · dns',                           icon: '🌐', hue: 210, group: 'tc_tools', x: 960, y: 1300 },

  // External services reached
  { id: 'tc_svc_tg',        title: 'Telegram API',   sub: 'sendMessage · replies',      icon: '💬', brand: 'telegram',  hue: 200, group: 'tc_svc', x: 1260, y: 60   },
  { id: 'tc_svc_anthropic',  title: 'Anthropic',      sub: 'Claude Messages · runtime model',        icon: '🤖', brand: 'anthropic', hue: 265, group: 'tc_svc', x: 1260, y: 300  },
  { id: 'tc_svc_capi',       title: 'contact-api',    sub: 'contacts + portal data',     icon: '🧩', hue: 30,            group: 'tc_svc', x: 1260, y: 580  },
  { id: 'tc_svc_crater',     title: 'Crater',         sub: 'invoicing',                  icon: '🧾', hue: 0,             group: 'tc_svc', x: 1260, y: 820  },
  { id: 'tc_svc_github',     title: 'GitHub',         sub: 'repo · commits · write · PRs',    icon: '🐙', brand: 'github',    hue: 235, group: 'tc_svc', x: 1260, y: 1060 },
  { id: 'tc_svc_psi',        title: 'PageSpeed API',  sub: 'Lighthouse audits',               icon: '⚡', brand: 'google',    hue: 45,  group: 'tc_svc', x: 1260, y: 1180 },
];

const TG_EDGES = [
  // Entry flow
  { from: 'tc_you',     to: 'tc_handler', label: 'message' },
  { from: 'tc_handler', to: 'tc_slash',   label: '/cmd' },
  { from: 'tc_handler', to: 'tc_claude',  label: 'freeform' },
  { from: 'tc_handler', to: 'tc_svc_tg',  label: 'reply', dashed: true },

  // Slash commands
  { from: 'tc_slash', to: 'tc_cmd_util' },
  { from: 'tc_slash', to: 'tc_cmd_knowledge' },
  { from: 'tc_slash', to: 'tc_cmd_resolve' },
  { from: 'tc_slash', to: 'tc_cmd_invoice' },
  { from: 'tc_slash', to: 'tc_cmd_railway' },

  // Slash → services
  { from: 'tc_cmd_resolve', to: 'tc_svc_capi',   dashed: true },
  { from: 'tc_cmd_invoice', to: 'tc_svc_crater',  dashed: true },

  // Claude agent
  { from: 'tc_claude', to: 'tc_svc_anthropic', label: 'tool loop' },
  { from: 'tc_claude', to: 'tc_tool_knowledge' },
  { from: 'tc_claude', to: 'tc_tool_devops' },
  { from: 'tc_claude', to: 'tc_tool_contacts' },
  { from: 'tc_claude', to: 'tc_tool_portal' },
  { from: 'tc_claude', to: 'tc_tool_billing' },
  { from: 'tc_claude', to: 'tc_tool_web' },

  // Tool categories → services
  { from: 'tc_tool_contacts', to: 'tc_svc_capi',   dashed: true },
  { from: 'tc_tool_portal',   to: 'tc_svc_capi',   dashed: true },
  { from: 'tc_tool_billing',  to: 'tc_svc_crater',  dashed: true },
  { from: 'tc_tool_devops',   to: 'tc_svc_github',  dashed: true },
  { from: 'tc_tool_web',      to: 'tc_svc_psi',     dashed: true, label: 'lighthouse' },
];

const TG_GROUPS = [
  { id: 'tc_entry',     title: 'Entry',              hue: 185, members: ['tc_you', 'tc_handler', 'tc_cheat'] },
  { id: 'tc_routing',   title: 'Routing',             hue: 55,  members: ['tc_slash', 'tc_claude'] },
  { id: 'tc_slash_grp', title: 'Slash commands',      hue: 55,  members: ['tc_cmd_util', 'tc_cmd_knowledge', 'tc_cmd_resolve', 'tc_cmd_invoice', 'tc_cmd_railway'] },
  { id: 'tc_tools',     title: 'Claude tool catalog', hue: 265, members: ['tc_tool_knowledge', 'tc_tool_devops', 'tc_tool_contacts', 'tc_tool_portal', 'tc_tool_billing', 'tc_tool_web'] },
  { id: 'tc_svc',       title: 'External services',   hue: 240, members: ['tc_svc_tg', 'tc_svc_anthropic', 'tc_svc_capi', 'tc_svc_crater', 'tc_svc_github', 'tc_svc_psi'] },
];

// ───────────────────────── exports ─────────────────────────
export const MAPS = {
  home:      { id: 'home',      title: 'Home',       icon: 'home', type: 'home',          nodes: [],             edges: [],             groups: [] },
  system:    { id: 'system',    title: 'System',     icon: '🖥️',  nodes: SYSTEM_NODES,   edges: SYSTEM_EDGES,   groups: SYSTEM_GROUPS },
  tooling:   { id: 'tooling',   title: 'MCP & CLI',  icon: '🔧',  nodes: TOOLING_NODES,  edges: TOOLING_EDGES,  groups: TOOLING_GROUPS },
  telegram:  { id: 'telegram',  title: 'Telegram',   icon: '✈️',  nodes: TG_NODES,       edges: TG_EDGES,       groups: TG_GROUPS },
  todo:      { id: 'todo',      title: 'To\u2011do',  icon: '✅',  type: 'todo',          nodes: [],             edges: [],             groups: [] },
  documents: { id: 'documents', title: 'Documents',  icon: '📄',  type: 'documents',     nodes: [],             edges: [],             groups: [] },
  knowledge: { id: 'knowledge', title: 'Knowledge',  icon: '📚',  type: 'knowledge',     nodes: [],             edges: [],             groups: [] },
  chats:     { id: 'chats',     title: 'Chats',      icon: '💬',  type: 'chats',         nodes: [],             edges: [],             groups: [] },
  email:     { id: 'email',     title: 'Inbox',      icon: '📬',  type: 'email',         nodes: [],             edges: [],             groups: [] },
  rules:     { id: 'rules',     title: 'Rules',      icon: '⚡',  type: 'rules',         nodes: [],             edges: [],             groups: [] },
  work:      { id: 'work',      title: 'Work',       icon: '💼',  type: 'work',          nodes: [],             edges: [],             groups: [] },
  clients:   { id: 'clients',   title: 'Clients',    icon: '👥',  type: 'clients',       nodes: [],             edges: [],             groups: [] },
  profile:   { id: 'profile',   title: 'Profile',    icon: '👤',  type: 'profile',       nodes: [],             edges: [],             groups: [] },
  finance:   { id: 'finance',   title: 'Finance',    icon: '💰',  link: 'https://ap.reave.app' },
};

/** Canvas maps grouped under the header "System" dropdown. */
export const SYSTEM_MAP_KEYS = ['system', 'tooling', 'telegram'];
/** Placeholder key in saved tab order for the System dropdown slot. */
export const SYSTEM_TAB_SLOT = '__system__';
/** Mobile: Chats dropdown also opens Knowledge. */
export const CHAT_MAP_KEYS = ['chats', 'knowledge'];
export const CHAT_TAB_SLOT = '__chat__';

// Back-compat: the "System" map is still the default export surface.
export const NODES = SYSTEM_NODES;
export const EDGES = SYSTEM_EDGES;
export const GROUPS = SYSTEM_GROUPS;
