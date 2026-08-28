// Business OS map data (single source of truth for the admin canvas).
// Node `sub` fields use example.com placeholders; os-map-loader rewrites them
// from admin Company branding + env-injected URLs at boot.
// ⚠️ KEEP CURRENT: add/edit nodes + edges here whenever a feature, service,
//    API route, integration, bot command, MCP server, or CLI changes.
//    Rendered at /admin/ (tabbed: "System" runtime + "MCP & CLI" tooling +
//    "Email triage" inbound pipeline).
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
  // Contacts / entry points
  { id: 'web', title: 'Web visitors', sub: 'example.com · /form/* · /doc/* · /deck · /go · /card · /digital-audit · /dscr · /deploy', icon: '🌐', hue: 285, group: 'clients', x: 60, y: 130 },
  { id: 'sms_caller', title: 'SMS / caller', sub: 'Telnyx number', icon: '☎️', hue: 175, group: 'clients', x: 60, y: 260 },
  { id: 'dev', title: 'Admin / dashboard', sub: '/admin/ · Clerk · PWA push · agent chats · @mentions · Settings', icon: '🧑‍💻', brand: 'cursor', hue: 325, group: 'clients', x: 60, y: 390 },
  { id: 'focus_chat', title: 'Focus chat skin', sub: '/focus · speed-dial FAB · @mentions · project-first new chats (chatFocusSkin)', icon: '💬', hue: 300, status: true, group: 'clients', x: 60, y: 780 },
  { id: 'vapi', title: 'Vapi', sub: 'Live Speak Agent Widget · disabled on this install', icon: '🎙️', hue: 310, status: false, ghost: true, group: 'clients', x: 60, y: 520 },
  { id: 'siri', title: 'Siri / iOS Shortcuts', sub: '/api/siri · Apple Shortcuts · voice · agent prompt · audits · payments · time tracking', icon: '🍎', brand: 'apple', hue: 270, status: true, group: 'clients', x: 60, y: 650 },
  { id: 'digital_audit', title: 'Digital Audit', sub: '/digital-audit · /api/digital-audit · site_audits · same Siri pipeline', icon: '🔎', hue: 160, status: true, group: 'clients', x: 60, y: 910 },

  // App hub (Railway / hosting)
  { id: 'astro', title: 'Astro / API', sub: 'example.com · /api/* · middleware · FEATURES', icon: '🔺', brand: 'astro', hue: 150, status: true, group: 'reave', x: 400, y: 280 },
  { id: 'deploy_wizard', title: 'Deploy Wizard', sub: '/deploy · module toggles · industries API · Railway ${{ }} refs', icon: '🪄', brand: 'railway', hue: 185, status: true, group: 'reave', x: 220, y: 200 },
  { id: 'deck_industries', title: 'Industries catalog', sub: '/api/admin/deck-industries · deploy playbooks · demo loader', icon: '🎯', hue: 200, status: true, group: 'reave', x: 220, y: 80 },
  { id: 'module_catalog', title: 'Module catalog', sub: '/api/admin/module-catalog · sale sheet · labels · prices', icon: '📚', hue: 175, status: true, group: 'reave', x: 380, y: 80 },
  { id: 'app_pg', title: 'App Postgres', sub: 'chats · agent_memories · agent_run_leases · knowledge · jobs · todos · punch list · job_time_entries · active_timers · calendar_reminders · project_files · media_library · email', icon: '🗃️', brand: 'postgresql', hue: 215, status: true, group: 'reave', x: 400, y: 430 },
  { id: 'media_webdav', title: 'Media drop folder', sub: '/webdav · Finder · iOS Files · MEDIA_WEBDAV_* or CardDAV creds', icon: '📁', hue: 28, status: true, group: 'reave', x: 220, y: 430 },
  { id: 'media_public', title: 'Public media', sub: '/api/media/{slug} · site photos · no-auth GET', icon: '🖼️', hue: 32, status: true, group: 'reave', x: 220, y: 520 },
  { id: 'web_push', title: 'Web Push', sub: 'admin PWA · inbox · comments · vault · punch list · share/deck views · calendar reminders · agent memory', icon: '🔔', hue: 45, status: true, group: 'reave', x: 640, y: 120 },
  { id: 'contacts_dash', title: 'Contacts editor', sub: '/admin/ · Contacts tab · Clerk', icon: '📊', hue: 195, status: true, group: 'reave', x: 400, y: 120 },
  { id: 'contact_api', title: 'contact-api', sub: 'contacts · portals · CardDAV backend', icon: '🧩', hue: 30, status: true, group: 'reave', x: 880, y: 120 },
  { id: 'contact_pg', title: 'contact-postgres', sub: 'volume', icon: '🗄️', brand: 'postgresql', hue: 48, status: true, group: 'reave', x: 880, y: 264 },
  { id: 'crater', title: 'Crater', sub: 'ap.example.com · invoicing (FEATURES: billing)', icon: '🧾', hue: 0, status: true, group: 'reave', x: 880, y: 408 },
  { id: 'portal', title: 'Client Portal', sub: '/c/:uid · vault · comments · tracked shares · help chat', icon: '📇', hue: 320, status: true, group: 'reave', x: 640, y: 408 },
  { id: 'documents', title: 'Dynamic Documents', sub: 'templates · fill · send / print (FEATURES: documents)', icon: '📄', hue: 25, status: true, group: 'reave', x: 760, y: 360 },
  { id: 'digital_signature', title: 'Digital Signature', sub: 'e-sign · ESIGN/UETA audit · POST /api/doc/:uid/sign (FEATURES: digital_signature)', icon: '✍️', hue: 8, status: true, group: 'reave', x: 760, y: 448 },
  { id: 'engagement', title: 'Engagement alerts', sub: 'vault · punch list · share opens · deck views · contact form · dashboard banners', icon: '👀', hue: 200, status: true, group: 'reave', x: 640, y: 300 },
  { id: 'carddav', title: 'CardDAV', sub: '/carddav · iOS sync (FEATURES: carddav)', icon: '📲', hue: 275, status: true, group: 'reave', x: 640, y: 264 },
  { id: 'materials_api', title: 'materials-api', sub: 'Home Depot pricing · search · quotes', icon: '🧱', hue: 18, status: true, group: 'reave', x: 880, y: 552 },
  { id: 'inventory_api', title: 'inventory-api', sub: 'Shopify · Woo · Square stock (FEATURES: inventory_sync)', icon: '📦', brand: 'shopify', hue: 96, status: true, group: 'reave', x: 880, y: 624 },
  { id: 'fleet_api', title: 'fleet-api', sub: 'multi-vehicle GPS · location history (FEATURES: fleet_tracking)', icon: '🚚', hue: 55, status: true, group: 'reave', x: 880, y: 696 },
  { id: 'calcom_api', title: 'calcom-booking-api', sub: 'availability · create · list · 15m reminders (FEATURES: scheduling)', icon: '📅', hue: 120, status: true, group: 'reave', x: 640, y: 520 },
  { id: 'code_dev', title: 'Code tools', sub: 'read/write/list/exec (FEATURES: code_dev)', icon: '🛠️', hue: 200, status: true, group: 'reave', x: 400, y: 560 },
  { id: 'newsletter', title: 'Newsletter Engine', sub: 'lifecycle + broadcasts · /api/newsletter/* (FEATURES: email_marketing)', icon: '📰', hue: 340, status: true, group: 'reave', x: 640, y: 660 },
  { id: 'online_reviews', title: 'Reviews Triage', sub: 'Google™ · Apple Maps · Yelp · Facebook · Tripadvisor · Trustpilot · Glassdoor (FEATURES: online_reviews)', icon: '⭐', brand: 'google', hue: 48, status: true, group: 'reave', x: 640, y: 732 },
  { id: 'social_feed', title: 'Agentic Social Media', sub: 'Paid add-on · Modules purchase · /api/admin/social/feed (FEATURES: social_inbox)', icon: '📣', hue: 330, status: true, group: 'reave', x: 880, y: 768 },
  { id: 'analytic_audit', title: 'Analytic audit', sub: 'GSC · GA4 · Plausible · IndexNow (FEATURES: analytic_audit)', icon: '📊', brand: 'google', hue: 145, status: true, group: 'reave', x: 640, y: 804 },
  { id: 'seo_directory', title: 'SEO Directory API Kit', sub: 'second-tier citations · BrightLocal Citation Builder (FEATURES: seo_directory)', icon: '📂', hue: 200, status: true, group: 'reave', x: 640, y: 876 },
  { id: 'event_ticketing', title: 'Event Ticketing', sub: 'reference · ticket sales · QR check-in (FEATURES: event_ticketing · request)', icon: '🎟️', hue: 330, status: true, ghost: true, group: 'reave', x: 640, y: 948 },
  { id: 'cookie_notice', title: 'Cookie Notice', sub: 'implied consent bar · /cookies (FEATURES: cookie_notice)', icon: '🍪', hue: 32, status: true, group: 'reave', x: 640, y: 1020 },
  { id: 'credit_check', title: 'Credit Check', sub: 'reference · applicant pull · form API (FEATURES: credit_check · request)', icon: '💳', hue: 8, status: true, ghost: true, group: 'reave', x: 640, y: 1092 },
  { id: 'dscr_calculator', title: 'DSCR Calculator', sub: '/dscr · /admin/?tab=dscr · /api/dscr/calculate (FEATURES: dscr_calculator)', icon: '🧮', hue: 168, status: true, group: 'reave', x: 640, y: 1236 },
  { id: 'website', title: 'Agentic Website Editor', sub: 'client web tools · editor + stock photos · no hosting APIs (FEATURES: website)', icon: '🌐', hue: 195, status: true, group: 'reave', x: 400, y: 600 },
  { id: 'time_tracking', title: 'Time Tracking', sub: 'Time tab · /api/work/timer · /api/work/:slug/time · Siri start/stop (FEATURES: time_tracking)', icon: '⏱️', hue: 88, status: true, group: 'reave', x: 220, y: 600 },
  { id: 'content_mgmt', title: 'Agentic Website Editor', sub: 'locked website repo · auto-commit · undo that (FEATURES: content_management)', icon: '✏️', brand: 'github', hue: 210, status: true, group: 'reave', x: 400, y: 640 },
  { id: 'site_repo', title: 'Client site repo', sub: 'wizard creates {slug}-site · restricted GitHub App · not eliteweblabs/reave', icon: '📄', brand: 'github', hue: 220, status: true, group: 'external', x: 1400, y: 700 },
  { id: 'wp_content', title: 'WordPress™ Connect', sub: 'Requestable add-on · eliteweblabs/reave-connect (FEATURES: wordpress_content)', icon: '🔌', brand: 'wordpress', hue: 200, status: true, group: 'reave', x: 400, y: 800 },
  { id: 'visit_planner', title: 'Inquiry visit planner', sub: '/admin/visit-plan · geo clusters + opening hours · /api/work/visit-plan', icon: '🗺️', hue: 82, status: true, group: 'reave', x: 400, y: 720 },
  { id: 'client_map', title: 'Contact geo map', sub: '/admin/client-map · SSR data · noindex · Mapbox pins', icon: '📍', hue: 205, status: true, group: 'reave', x: 400, y: 760 },
  { id: 'dealer_map', title: 'Used-car dealer map', sub: '/dealer-map · public demo · Places search-on-zoom · inventory toggles · /api/dealer-map/places', icon: '🚗', hue: 28, status: true, group: 'reave', x: 400, y: 840 },
  { id: 'sales_sheet', title: 'Audit sales sheet', sub: '/admin/sales-sheet · custom client front · static reΛVe.app back (gate welcome + Q&A, builds + full stack, cover) · Places SERP in iPhone frame', icon: '🧾', hue: 168, status: true, group: 'reave', x: 220, y: 720 },
  { id: 'google_workspace_mod', title: 'Google Workspace', sub: 'Gmail MX · SPF · DKIM · DMARC · domains (FEATURES: google_workspace)', icon: '📧', brand: 'google', hue: 155, status: true, group: 'reave', x: 640, y: 1164 },

  // External APIs
  { id: 'anthropic', title: 'Anthropic', sub: 'agent · SMS AI · email triage · voice · portal help chat', icon: '🤖', brand: 'anthropic', hue: 265, status: true, group: 'external', x: 1160, y: 100 },
  { id: 'railway_gql', title: 'Railway GraphQL', sub: 'outbound · projectCreate · domains', icon: '🚆', brand: 'railway', hue: 185, status: true, group: 'external', x: 1160, y: 220 },
  { id: 'railway_webhook', title: 'Railway webhooks', sub: 'inbound deploy alerts · one repair Session per service · /api/railway/webhook', icon: '🚦', brand: 'railway', hue: 25, status: true, group: 'external', x: 1160, y: 340 },
  { id: 'kinsta_api', title: 'Kinsta API', sub: 'outbound · list_kinsta_sites · clear cache', icon: '🟣', brand: 'kinsta', hue: 280, status: true, group: 'external', x: 1160, y: 460 },
  { id: 'resend', title: 'Resend', sub: 'inbound webhook · outbound compose/scheduled/portal · sent CID hydrate', icon: '✉️', brand: 'resend', hue: 330, status: true, group: 'external', x: 1160, y: 580 },
  { id: 'github', title: 'GitHub', sub: 'owner/repo · REST · create repo · write/PR', icon: '🐙', brand: 'github', hue: 235, status: true, group: 'external', x: 1160, y: 700 },
  { id: 'telnyx', title: 'Telnyx', sub: 'SMS · AI voice agent (FEATURES: voice)', icon: '📲', hue: 175, status: true, group: 'external', x: 1160, y: 820 },
  { id: 'wayback', title: 'Wayback Machine', sub: 'Internet Archive snapshots (FEATURES: wayback_machine)', icon: '🕰️', brand: 'internetarchive', hue: 42, status: true, group: 'external', x: 1160, y: 880 },
  { id: 'changedetection', title: 'ChangeDetection.io', sub: 'site watches (FEATURES: site_monitoring)', icon: '👁️', hue: 55, status: true, group: 'external', x: 1160, y: 940 },
  { id: 'uptimerobot', title: 'UptimeRobot', sub: 'uptime API + webhooks (FEATURES: uptime_monitoring)', icon: '📈', hue: 70, status: true, group: 'external', x: 1160, y: 1060 },
  { id: 'clerk', title: 'Clerk', sub: 'auth · /admin/* · chats · profile · Railway PUBLIC_CLERK_* / CLERK_SECRET_* (+ aliases)', icon: '🔐', brand: 'clerk', hue: 290, status: true, group: 'external', x: 1160, y: 1180 },
  { id: 'calcom_web', title: 'Cal.com', sub: 'cal.example.com · admin UI · event types', icon: '🗓️', brand: 'caldotcom', hue: 105, status: true, group: 'external', x: 1160, y: 1300 },
  { id: 'plausible', title: 'Plausible Analytics', sub: 'self-hosted on Railway · live custom domains · dashboard preview · agent plausible_stats', icon: '📈', brand: 'plausibleanalytics', hue: 130, status: true, group: 'external', x: 1160, y: 1420 },
  { id: 'google_search_console', title: 'Google Search Console', sub: 'OAuth · search analytics · URL inspect · sitemaps (FEATURES: analytic_audit)', icon: '🔎', brand: 'google', hue: 145, status: true, group: 'external', x: 1400, y: 1420 },
  { id: 'ga4', title: 'Google Analytics 4', sub: 'OAuth · Data API · admin dashboard toggle', icon: '📉', brand: 'googleanalytics', hue: 160, status: true, group: 'external', x: 1400, y: 1540 },
  { id: 'indexnow', title: 'IndexNow', sub: 'Bing/Yandex URL ping · owned sites only', icon: '⚡', hue: 50, status: true, group: 'external', x: 1400, y: 1660 },
  { id: 'bing_webmaster', title: 'Bing Webmaster', sub: 'placeholder · API later', icon: '🅱️', brand: 'bing', hue: 35, status: true, ghost: true, group: 'external', x: 1400, y: 1780 },
  { id: 'google_places', title: 'Google Places', sub: 'review sync · address autocomplete · Place Details · audit not-listed flag · /dealer-map search · GOOGLE_MAPS_API_KEY', icon: '⭐', brand: 'google', hue: 48, status: true, group: 'external', x: 1160, y: 1540 },
  { id: 'pexels', title: 'Pexels', sub: 'royalty-free stock photos · search_stock_photos · /api/pexels/search (FEATURES: stock_photos)', icon: '📷', brand: 'pexels', hue: 160, status: true, group: 'external', x: 1160, y: 1660 },
  { id: 'ipwhois', title: 'ipwho.is', sub: 'IP → ASN/org hosting lookup · dns_check (FEATURES: site_audits)', icon: '🌐', hue: 190, status: true, group: 'external', x: 1400, y: 1900 },
  { id: 'brightlocal', title: 'BrightLocal', sub: 'Citation Builder · Locations API · reΛVe.app agency account (FEATURES: seo_directory)', icon: '📍', hue: 12, status: true, ghost: true, group: 'external', x: 1400, y: 2020 },
  { id: 'instagram_oauth', title: 'Instagram Login', sub: 'OAuth · INSTAGRAM_APP_ID · /api/admin/social/connect/instagram (FEATURES: social_inbox)', icon: '📸', brand: 'instagram', hue: 330, status: true, group: 'external', x: 1400, y: 2140 },
  { id: 'namecom', title: 'Name.com', sub: 'registrar DNS · zone records + nameservers · namecom_dns (FEATURES: namecom_dns)', icon: '🌐', hue: 210, status: true, group: 'external', x: 1160, y: 1780 },
  { id: 'cloudflare', title: 'Cloudflare', sub: 'DNS · SSL · cloudflare_dns · setup_google_workspace · CLOUDFLARE_API_TOKEN', icon: '☁️', brand: 'cloudflare', hue: 22, status: true, group: 'external', x: 1160, y: 1900 },
  { id: 'google_workspace', title: 'Google Workspace', sub: 'Admin domains · DKIM · MX/SPF via Cloudflare · gmail_dkim (FEATURES: google_workspace)', icon: '📧', brand: 'google', hue: 155, status: true, group: 'external', x: 1400, y: 1300 },
];

const SYSTEM_EDGES = [
  { from: 'web', to: 'astro', label: '/deck · /go · forms' },
  { from: 'web', to: 'vapi', label: 'voice widget', dashed: true, ghost: true },
  { from: 'web', to: 'portal', label: 'share link', dashed: true },
  { from: 'portal', to: 'engagement', label: 'vault · punch list · comments', dashed: true },
  { from: 'astro', to: 'engagement', label: 'deck · share opens · contact form' },
  { from: 'engagement', to: 'web_push', label: 'dashboard + push', dashed: true },
  { from: 'sms_caller', to: 'telnyx', label: 'SMS / call' },
  { from: 'siri', to: 'astro', label: '/api/siri' },
  { from: 'digital_audit', to: 'astro', label: '/api/digital-audit' },
  { from: 'dev', to: 'clerk', label: 'sign-in' },
  { from: 'focus_chat', to: 'clerk', label: 'sign-in', dashed: true },
  { from: 'focus_chat', to: 'astro', label: '/focus · /api/chats · /api/people', dashed: true },
  { from: 'clerk', to: 'astro', dashed: true },
  { from: 'dev', to: 'contacts_dash', label: 'view DB', dashed: true },
  { from: 'astro', to: 'anthropic', label: 'Claude tool loop' },
  { from: 'astro', to: 'contact_api', label: 'resolve · /api/people' },
  { from: 'astro', to: 'clerk', label: '/api/people team roster', dashed: true },
  { from: 'astro', to: 'carddav', label: 'CardDAV' },
  { from: 'carddav', to: 'contact_api', label: 'vCard CRUD' },
  { from: 'astro', to: 'portal', label: 'serves /c/:uid' },
  { from: 'astro', to: 'documents', label: '/doc · /api/documents' },
  { from: 'documents', to: 'contact_api', label: 'fill shortcodes' },
  { from: 'documents', to: 'digital_signature', label: 'paid add-on', dashed: true },
  { from: 'digital_signature', to: 'portal', label: 'signed copies', dashed: true },
  { from: 'portal', to: 'contact_api', label: 'portal link (read/write)' },
  { from: 'portal', to: 'crater', label: 'billing', dashed: true },
  { from: 'portal', to: 'changedetection', label: 'site watch sync', dashed: true },
  { from: 'portal', to: 'anthropic', label: 'speed-dial help chat (FEATURES: portal_assistant)', dashed: true },
  { from: 'astro', to: 'telnyx', label: 'SMS send · call control', dashed: true },
  { from: 'telnyx', to: 'astro', label: 'SMS · voice webhooks', dashed: true },
  { from: 'telnyx', to: 'anthropic', label: 'voice agent', dashed: true },
  { from: 'contacts_dash', to: 'contact_api', label: 'list contacts' },
  { from: 'contact_api', to: 'contact_pg' },
  { from: 'astro', to: 'railway_gql', label: 'GraphQL · /railway' },
  { from: 'astro', to: 'kinsta_api', label: 'agent · Kinsta WP' },
  { from: 'astro', to: 'crater', label: 'billing · time → invoice' },
  { from: 'astro', to: 'time_tracking', label: '/api/work/timer · /time' },
  { from: 'time_tracking', to: 'app_pg', label: 'job_time_entries · active_timers' },
  { from: 'siri', to: 'time_tracking', label: 'start/stop', dashed: true },
  { from: 'dev', to: 'time_tracking', label: 'Time tab', dashed: true },
  { from: 'time_tracking', to: 'crater', label: 'hours as quantity', dashed: true },
  { from: 'astro', to: 'materials_api', label: 'materials pricing', dashed: true },
  { from: 'astro', to: 'inventory_api', label: 'inventory sync', dashed: true },
  { from: 'astro', to: 'fleet_api', label: 'fleet GPS · map', dashed: true },
  { from: 'dev', to: 'astro', label: 'location ping (signed in)', dashed: true },
  { from: 'astro', to: 'resend', label: 'outbound send' },
  { from: 'resend', to: 'astro', label: 'inbound webhook', dashed: true },
  { from: 'astro', to: 'newsletter', label: 'events · triggers', dashed: true },
  { from: 'newsletter', to: 'resend', label: 'lifecycle + broadcasts' },
  { from: 'newsletter', to: 'app_pg', label: 'queue · unsubscribes', dashed: true },
  { from: 'resend', to: 'web_push', label: 'inbox alert', dashed: true },
  { from: 'astro', to: 'app_pg', label: 'DATABASE_URL' },
  { from: 'astro', to: 'media_webdav', label: 'WebDAV' },
  { from: 'media_webdav', to: 'app_pg', label: 'media_library' },
  { from: 'web', to: 'media_public', label: '/api/media' },
  { from: 'media_public', to: 'app_pg', label: 'slug' },
  { from: 'astro', to: 'github', label: 'status · commits · PR' },
  { from: 'astro', to: 'code_dev', label: 'agent FS · shell' },
  { from: 'code_dev', to: 'github', label: 'git commit · push', dashed: true },
  { from: 'astro', to: 'wayback', label: 'wayback_list_snapshots · snapshot_at', dashed: true },
  { from: 'astro', to: 'changedetection', label: 'watch CRUD', dashed: true },
  { from: 'changedetection', to: 'astro', label: 'change webhook', dashed: true },
  { from: 'uptimerobot', to: 'astro', label: 'uptime webhook', dashed: true },
  { from: 'astro', to: 'uptimerobot', label: 'getMonitors poll', dashed: true },
  { from: 'astro', to: 'calcom_api', label: 'bookings API', dashed: true },
  { from: 'astro', to: 'calcom_web', label: 'icon · username · email', dashed: true },
  { from: 'deploy_wizard', to: 'calcom_web', label: 'identity refs', dashed: true },
  { from: 'calcom_api', to: 'web_push', label: '15m reminder', dashed: true },
  { from: 'calcom_api', to: 'app_pg', label: 'reminder queue', dashed: true },
  { from: 'web', to: 'calcom_api', label: '/form/schedule', dashed: true },
  { from: 'web', to: 'plausible', label: 'pageviews', dashed: true },
  { from: 'astro', to: 'analytic_audit', label: 'full audit · agent tools', dashed: true },
  { from: 'analytic_audit', to: 'google_search_console', label: 'GSC API', dashed: true },
  { from: 'analytic_audit', to: 'ga4', label: 'GA4 Data API', dashed: true },
  { from: 'analytic_audit', to: 'plausible', label: 'plausible_stats', dashed: true },
  { from: 'analytic_audit', to: 'indexnow', label: 'owned sites', dashed: true },
  { from: 'analytic_audit', to: 'bing_webmaster', label: 'placeholder', dashed: true },
  { from: 'calcom_api', to: 'calcom_web', label: 'Cal.com Postgres', dashed: true },
  { from: 'astro', to: 'online_reviews', label: '/api/admin/online-reviews', dashed: true },
  { from: 'online_reviews', to: 'app_pg', label: 'reviews inbox', dashed: true },
  { from: 'online_reviews', to: 'google_places', label: 'Places API sync', dashed: true },
  { from: 'astro', to: 'social_feed', label: '/api/admin/social/feed', dashed: true },
  { from: 'social_feed', to: 'online_reviews', label: 'reviews in feed', dashed: true },
  { from: 'social_feed', to: 'app_pg', label: 'reply drafts', dashed: true },
  { from: 'social_feed', to: 'instagram_oauth', label: 'Connect Instagram', dashed: true },
  { from: 'astro', to: 'seo_directory', label: '/api/admin/seo-directory', dashed: true },
  { from: 'seo_directory', to: 'brightlocal', label: 'Citation Builder API', dashed: true, ghost: true },
  { from: 'astro', to: 'event_ticketing', label: 'planned', dashed: true, ghost: true },
  { from: 'astro', to: 'credit_check', label: 'planned', dashed: true, ghost: true },
  { from: 'astro', to: 'dscr_calculator', label: '/api/dscr/calculate' },
  { from: 'web', to: 'dscr_calculator', label: '/dscr', dashed: true },
  { from: 'dev', to: 'dscr_calculator', label: 'admin tab', dashed: true },
  { from: 'web', to: 'cookie_notice', label: 'notice · continue = agree', dashed: true },
  { from: 'astro', to: 'cookie_notice', label: '/cookies', dashed: true },
  { from: 'astro', to: 'visit_planner', label: '/admin/visit-plan · /api/work/visit-plan', dashed: true },
  { from: 'visit_planner', to: 'app_pg', label: 'open inquiries (jobs)', dashed: true },
  { from: 'visit_planner', to: 'contact_api', label: 'address · geo · hours', dashed: true },
  { from: 'visit_planner', to: 'google_places', label: 'Place Details hours backfill', dashed: true },
  { from: 'astro', to: 'client_map', label: '/admin/client-map · SSR contact geo', dashed: true },
  { from: 'client_map', to: 'contact_api', label: 'address · geo · kind', dashed: true },
  { from: 'astro', to: 'dealer_map', label: '/dealer-map · /api/dealer-map/places', dashed: true },
  { from: 'dealer_map', to: 'google_places', label: 'used car dealer text search', dashed: true },
  { from: 'astro', to: 'sales_sheet', label: '/admin/sales-sheet', dashed: true },
  { from: 'digital_audit', to: 'sales_sheet', label: '4 phone exhibits', dashed: true },
  { from: 'sales_sheet', to: 'google_places', label: 'listing + google.com SERP shot', dashed: true },
  { from: 'sales_sheet', to: 'app_pg', label: 'project_files (later)', dashed: true },
  { from: 'astro', to: 'plausible', label: '/api/admin/analytics', dashed: true },
  { from: 'railway_gql', to: 'plausible', label: 'live custom domains', dashed: true },
  { from: 'astro', to: 'google_search_console', label: '/api/admin/analytic-audit/*', dashed: true },
  { from: 'astro', to: 'ga4', label: 'analytics source=ga4', dashed: true },
  { from: 'astro', to: 'pexels', label: 'photo search · agent + /api/pexels/search', dashed: true },
  { from: 'astro', to: 'ipwhois', label: 'dns_check hosting lookup', dashed: true },
  { from: 'astro', to: 'namecom', label: 'namecom_dns · records + NS', dashed: true },
  { from: 'astro', to: 'cloudflare', label: 'cloudflare_dns · MX/SSL/zones', dashed: true },
  { from: 'astro', to: 'google_workspace', label: 'gmail_dkim · domains', dashed: true },
  { from: 'google_workspace_mod', to: 'google_workspace', label: 'FEATURES: google_workspace', dashed: true },
  { from: 'google_workspace', to: 'cloudflare', label: 'setup_google_workspace · DKIM TXT', dashed: true },
  { from: 'dev', to: 'website', label: 'client website pack', dashed: true },
  { from: 'website', to: 'content_mgmt', label: 'editor + Git', dashed: true },
  { from: 'website', to: 'pexels', label: 'stock photos', dashed: true },
  { from: 'dev', to: 'content_mgmt', label: 'update site copy', dashed: true },
  { from: 'content_mgmt', to: 'site_repo', label: 'read · write · undo', dashed: true },
  { from: 'site_repo', to: 'github', label: 'locked Contents PAT', dashed: true },
  { from: 'content_mgmt', to: 'media_public', label: 'image slugs', dashed: true },
  { from: 'dev', to: 'wp_content', label: 'update WP content', dashed: true },
  { from: 'astro', to: 'wp_content', label: 'companion plugin API', dashed: true },
  { from: 'wp_content', to: 'kinsta_api', label: 'clear cache after publish', dashed: true },
  { from: 'astro', to: 'web_push', label: 'inbox · site · engagement · memory' },
  { from: 'deploy_wizard', to: 'astro', label: '/api/deploy/wizard' },
  { from: 'deploy_wizard', to: 'deck_industries', label: 'playbook', dashed: true },
  { from: 'astro', to: 'deck_industries', label: '/api/admin/deck-industries' },
  { from: 'deck_industries', to: 'app_pg', label: 'deck_industries', dashed: true },
  { from: 'astro', to: 'module_catalog', label: '/api/admin/module-catalog' },
  { from: 'module_catalog', to: 'app_pg', label: 'module_catalog', dashed: true },
  { from: 'module_catalog', to: 'sales_sheet', label: 'saleSheet', dashed: true },
  { from: 'deploy_wizard', to: 'railway_gql', label: '${{ service.VAR }}', dashed: true },
  { from: 'dev', to: 'deploy_wizard', label: 'owner', dashed: true },
  { from: 'railway_webhook', to: 'astro', label: 'deploy webhook' },
  { from: 'railway_webhook', to: 'web_push', label: 'deploy alert', dashed: true },
  { from: 'railway_webhook', to: 'anthropic', label: 'one repair Session / service', dashed: true },
];

const SYSTEM_GROUPS = [
  { id: 'clients', title: 'Entry points', hue: 300, members: ['web', 'sms_caller', 'dev', 'focus_chat', 'vapi', 'siri', 'digital_audit'] },
  { id: 'reave', title: 'Railway — App', hue: 150, members: ['astro', 'deploy_wizard', 'deck_industries', 'module_catalog', 'app_pg', 'web_push', 'engagement', 'contact_api', 'contact_pg', 'crater', 'materials_api', 'inventory_api', 'fleet_api', 'portal', 'documents', 'digital_signature', 'carddav', 'media_webdav', 'media_public', 'contacts_dash', 'calcom_api', 'code_dev', 'newsletter', 'online_reviews', 'social_feed', 'analytic_audit', 'seo_directory', 'event_ticketing', 'cookie_notice', 'credit_check', 'dscr_calculator', 'website', 'time_tracking', 'content_mgmt', 'wp_content', 'visit_planner', 'client_map', 'dealer_map', 'sales_sheet', 'google_workspace_mod'] },
  { id: 'external', title: 'External APIs', hue: 240, members: ['anthropic', 'railway_gql', 'railway_webhook', 'kinsta_api', 'resend', 'github', 'site_repo', 'telnyx', 'wayback', 'changedetection', 'uptimerobot', 'clerk', 'calcom_web', 'plausible', 'google_search_console', 'ga4', 'indexnow', 'bing_webmaster', 'google_places', 'pexels', 'ipwhois', 'brightlocal', 'instagram_oauth', 'namecom', 'cloudflare', 'google_workspace'] },
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
  { id: 't_prod', title: 'Production app', sub: 'example.com (prod)', icon: '🔺', brand: 'astro', hue: 150, group: 't_prod', x: 1320, y: 300 },
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

// ───────────────────────── EMAIL TRIAGE (inbound pipeline) ─────────────────────────
// How one inbound message becomes a single dashboard action (or silent file/junk).
const EMAIL_TRIAGE_NODES = [
  // Source
  { id: 'et_mailbox', title: 'Proton / Gmail', sub: 'Human inbox — keep reading there', icon: '📬', hue: 285, group: 'et_source', x: 40, y: 220 },
  { id: 'et_copy', title: 'BCC / filter copy', sub: 'Forward a copy to inbound@…', icon: '↪️', hue: 310, group: 'et_source', x: 40, y: 360 },

  // Ingest
  { id: 'et_resend', title: 'Resend MX', sub: 'inbox@inbound… · email.received', icon: '✉️', brand: 'resend', hue: 330, status: true, group: 'et_ingest', x: 320, y: 180 },
  { id: 'et_webhook', title: '/api/email/inbound', sub: 'Verify · one row per Message-ID', icon: '🔺', brand: 'astro', hue: 150, status: true, group: 'et_ingest', x: 320, y: 320 },
  { id: 'et_gates', title: 'Cutoff · Sleep mode', sub: 'Drop pre-golive · defer 11pm–7am', icon: '😴', hue: 220, status: true, group: 'et_ingest', x: 320, y: 460 },

  // Classify
  { id: 'et_contact', title: 'Resolve sender', sub: 'known contact skips marketing junk only', icon: '🧩', hue: 30, status: true, group: 'et_classify', x: 600, y: 120 },
  { id: 'et_rules', title: 'Keyword rules', sub: 'Flow · universal/personal · else inbox', icon: '⚡', hue: 45, status: true, group: 'et_classify', x: 600, y: 260 },
  { id: 'et_lab', title: 'Try email (Flow)', sub: 'Compose · live test · first match', icon: '🧪', hue: 70, status: true, group: 'et_classify', x: 600, y: 330 },
  { id: 'et_agent', title: 'Agent-first AI', sub: 'Unknown / service · rule match or unmatched-chat on', icon: '🤖', brand: 'anthropic', hue: 265, status: true, group: 'et_classify', x: 600, y: 400 },
  { id: 'et_legacy', title: 'Rules + AI triage', sub: 'Known client · rule match or unmatched-chat on', icon: '🧠', brand: 'anthropic', hue: 280, status: true, group: 'et_classify', x: 600, y: 540 },

  // Decide
  { id: 'et_confidence', title: 'Confidence gate', sub: 'EMAIL_AI_CONFIDENCE_MIN · 0.72', icon: '🎚️', hue: 200, status: true, group: 'et_decide', x: 880, y: 260 },
  { id: 'et_trusted', title: 'Trusted label', sub: 'Apply AI category · meeting fields', icon: '✅', hue: 140, status: true, group: 'et_decide', x: 880, y: 120 },
  { id: 'et_explain', title: 'Uncertain → Explain', sub: 'Only if a keyword rule matched', icon: '❓', hue: 10, status: true, group: 'et_decide', x: 880, y: 400 },
  { id: 'et_dedupe', title: 'One banner / email', sub: 'Ingest + tag + OTP code collapse', icon: '🎯', hue: 350, status: true, group: 'et_decide', x: 880, y: 540 },

  // Automate outcomes
  { id: 'et_otp', title: 'OTP / auth link', sub: 'Copy · Activate · 5 min TTL', icon: '🔑', hue: 55, status: true, group: 'et_automate', x: 1160, y: 60 },
  { id: 'et_meeting', title: 'Meeting automation', sub: 'Intent + clock in email · never invent', icon: '📅', hue: 120, status: true, group: 'et_automate', x: 1160, y: 180 },
  { id: 'et_project', title: 'Project automation', sub: 'Match existing · skip if forwarded', icon: '💼', hue: 195, status: true, group: 'et_automate', x: 1160, y: 300 },
  { id: 'et_file', title: 'File to job', sub: 'Append note · attachments', icon: '📎', hue: 210, status: true, group: 'et_automate', x: 1160, y: 420 },
  { id: 'et_sort', title: 'Spam · archive · auto-delete', sub: 'Junk = spam filter only · DELETE → Auto deleted · archive stays Archive', icon: '🗂️', hue: 25, status: true, group: 'et_automate', x: 1160, y: 540 },

  // Surfaces
  { id: 'et_inbox', title: 'Inbox log', sub: 'App Postgres · wipe sample seed on first API', icon: '🗃️', brand: 'postgresql', hue: 215, status: true, group: 'et_surfaces', x: 1440, y: 160 },
  { id: 'et_dash', title: 'Dashboard banner', sub: 'No banner if email deleted or junk', icon: '📊', hue: 185, status: true, group: 'et_surfaces', x: 1440, y: 300 },
  { id: 'et_push', title: 'Web Push', sub: 'Phone PWA · one tray item per email/code', icon: '🔔', hue: 45, status: true, group: 'et_surfaces', x: 1440, y: 440 },
  { id: 'et_chat', title: 'System alerts chat', sub: 'Ops automations · deploy repair reuses one Session per service', icon: '💬', hue: 300, status: true, group: 'et_surfaces', x: 1440, y: 580 },
];

const EMAIL_TRIAGE_EDGES = [
  { from: 'et_mailbox', to: 'et_copy', label: 'filter' },
  { from: 'et_copy', to: 'et_resend', label: 'MX' },
  { from: 'et_resend', to: 'et_webhook', label: 'webhook' },
  { from: 'et_webhook', to: 'et_gates' },
  { from: 'et_webhook', to: 'et_dedupe', label: 'same Message-ID', dashed: true },
  { from: 'et_gates', to: 'et_contact', label: 'awake' },
  { from: 'et_gates', to: 'et_inbox', label: 'sleep deferred', dashed: true },

  { from: 'et_contact', to: 'et_rules', label: 'then rules' },
  { from: 'et_rules', to: 'et_lab', label: 'try email', dashed: true },
  { from: 'et_lab', to: 'et_rules', label: 'same classifyEmail', dashed: true },
  { from: 'et_contact', to: 'et_agent', label: 'unknown / service' },
  { from: 'et_contact', to: 'et_legacy', label: 'known client' },
  { from: 'et_rules', to: 'et_otp', label: 'OTP · AUTH_LINK' },
  { from: 'et_rules', to: 'et_inbox', label: 'no match', dashed: true },
  { from: 'et_rules', to: 'et_sort', label: 'spam · archive · auto-delete', dashed: true },

  { from: 'et_agent', to: 'et_confidence' },
  { from: 'et_confidence', to: 'et_trusted', label: 'high' },
  { from: 'et_confidence', to: 'et_explain', label: 'low' },
  { from: 'et_legacy', to: 'et_trusted', dashed: true },
  { from: 'et_explain', to: 'et_dedupe' },
  { from: 'et_trusted', to: 'et_meeting', dashed: true, label: 'if grounded' },
  { from: 'et_trusted', to: 'et_project', dashed: true },
  { from: 'et_trusted', to: 'et_file', dashed: true },
  { from: 'et_trusted', to: 'et_sort', dashed: true },
  { from: 'et_meeting', to: 'et_dedupe', label: 'skip if uncertain', dashed: true },
  { from: 'et_dedupe', to: 'et_dash' },

  { from: 'et_otp', to: 'et_inbox' },
  { from: 'et_otp', to: 'et_push' },
  { from: 'et_meeting', to: 'et_inbox' },
  { from: 'et_project', to: 'et_inbox' },
  { from: 'et_file', to: 'et_inbox' },
  { from: 'et_sort', to: 'et_inbox' },
  { from: 'et_explain', to: 'et_push', label: 'triage push' },
  { from: 'et_inbox', to: 'et_dash', dashed: true },
  { from: 'et_meeting', to: 'et_chat', label: 'automation', dashed: true },
  { from: 'et_project', to: 'et_chat', dashed: true },
  { from: 'et_dash', to: 'et_push', dashed: true },
];

const EMAIL_TRIAGE_GROUPS = [
  { id: 'et_source', title: 'Source', hue: 300, members: ['et_mailbox', 'et_copy'] },
  { id: 'et_ingest', title: 'Ingest', hue: 150, members: ['et_resend', 'et_webhook', 'et_gates'] },
  { id: 'et_classify', title: 'Classify', hue: 265, members: ['et_contact', 'et_rules', 'et_lab', 'et_agent', 'et_legacy'] },
  { id: 'et_decide', title: 'Decide', hue: 200, members: ['et_confidence', 'et_trusted', 'et_explain', 'et_dedupe'] },
  { id: 'et_automate', title: 'Automate', hue: 120, members: ['et_otp', 'et_meeting', 'et_project', 'et_file', 'et_sort'] },
  { id: 'et_surfaces', title: 'Surfaces', hue: 45, members: ['et_inbox', 'et_dash', 'et_push', 'et_chat'] },
];


// ───────────────────────── exports ─────────────────────────
export const MAPS = {
  dashboard: { id: 'dashboard', title: 'Dashboard', icon: 'layout-dashboard', type: 'dashboard', nodes: [],             edges: [],             groups: [] },
  system:    { id: 'system',    title: 'System',     icon: '🖥️',  special: true, nodes: SYSTEM_NODES,   edges: SYSTEM_EDGES,   groups: SYSTEM_GROUPS },
  tooling:   { id: 'tooling',   title: 'MCP & CLI',  icon: '🔧',  special: true, nodes: TOOLING_NODES,  edges: TOOLING_EDGES,  groups: TOOLING_GROUPS },
  'email-triage': {
    id: 'email-triage',
    title: 'Email triage',
    icon: '🔀',
    special: true,
    nodes: EMAIL_TRIAGE_NODES,
    edges: EMAIL_TRIAGE_EDGES,
    groups: EMAIL_TRIAGE_GROUPS,
  },
  // Telegram integration removed — admin Chats tab + Siri Shortcuts are the primary agent surfaces
  todo:      { id: 'todo',      title: 'To\u2011do',  icon: '✅',  type: 'todo',          nodes: [],             edges: [],             groups: [] },
  punchlist: { id: 'punchlist', title: 'Punch list', icon: '📋',  type: 'punchlist',     nodes: [],             edges: [],             groups: [] },
  documents: { id: 'documents', title: 'Documents',  icon: '📄',  type: 'documents',     nodes: [],             edges: [],             groups: [] },
  knowledge: { id: 'knowledge', title: 'Knowledge',  icon: '📚',  type: 'knowledge',     nodes: [],             edges: [],             groups: [] },
  chats:     { id: 'chats',     title: 'Sessions',   icon: '💬',  type: 'chats',         nodes: [],             edges: [],             groups: [] },
  email:     { id: 'email',     title: 'Inbox',      icon: '📬',  type: 'email',         nodes: [],             edges: [],             groups: [] },
  rules:     { id: 'rules',     title: 'Email Lab',  icon: '🧪',  type: 'rules',         nodes: [],             edges: [],             groups: [] },
  newsletter:{ id: 'newsletter',title: 'Newsletter', icon: '📰',  type: 'newsletter',    nodes: [],             edges: [],             groups: [] },
  work:      { id: 'work',      title: 'Projects',   icon: '💼',  type: 'work',          nodes: [],             edges: [],             groups: [] },
  schedule:  { id: 'schedule',  title: 'Schedule',   icon: '📅',  type: 'schedule',      nodes: [],             edges: [],             groups: [] },
  clients:   { id: 'clients',   title: 'Contacts',   icon: '👥',  type: 'clients',       nodes: [],             edges: [],             groups: [] },
  social:    { id: 'social',    title: 'Social',     icon: '📣',  type: 'social',        nodes: [],             edges: [],             groups: [] },
  reviews:   { id: 'reviews',   title: 'Reviews',    icon: '⭐',  type: 'reviews',       nodes: [],             edges: [],             groups: [] },
  media:     { id: 'media',     title: 'Media Library', icon: '🖼️', type: 'media',     nodes: [],             edges: [],             groups: [] },
  analytics: { id: 'analytics', title: 'Analytics',  icon: '📈',  type: 'analytics',     nodes: [],             edges: [],             groups: [] },
  fleet:     { id: 'fleet',     title: 'Fleet',      icon: '🚚',  type: 'fleet',         nodes: [],             edges: [],             groups: [] },
  modules:   { id: 'modules',   title: 'Modules',    icon: '🧩',  type: 'modules',       nodes: [],             edges: [],             groups: [] },
  deploy:    { id: 'deploy',    title: 'Deploy Wizard', icon: 'sparkles', link: '/deploy', nodes: [], edges: [], groups: [] },
  'sales-sheet': { id: 'sales-sheet', title: 'Sales sheet', icon: 'receipt', link: '/admin/sales-sheet', nodes: [], edges: [], groups: [] },
  profile:   { id: 'profile',   title: 'Profile',    icon: '👤',  type: 'profile',       nodes: [],             edges: [],             groups: [] },
  company:   { id: 'company',   title: 'Company',    icon: '🏢',  type: 'company',       nodes: [],             edges: [],             groups: [] },
  settings:  { id: 'settings',  title: 'Settings',   icon: '⚙️',  type: 'settings',      nodes: [],             edges: [],             groups: [] },
  socials:   { id: 'socials',   title: 'Socials',    icon: '🔗',  type: 'socials',       nodes: [],             edges: [],             groups: [] },
  industries:{ id: 'industries',title: 'Industries', icon: '🎯',  type: 'industries',    nodes: [],             edges: [],             groups: [] },
  catalog:   { id: 'catalog',   title: 'Catalog',    icon: 'layers', type: 'catalog',     nodes: [],             edges: [],             groups: [] },
  vapi:      { id: 'vapi',      title: 'Vapi',       icon: '🎙️',  type: 'vapi',          nodes: [],             edges: [],             groups: [] },
  'lead-scanner': { id: 'lead-scanner', title: 'Lead Scanner', icon: '📍', type: 'lead-scanner', nodes: [], edges: [], groups: [] },
  dscr: { id: 'dscr', title: 'DSCR Calculator', icon: '🧮', type: 'dscr', nodes: [], edges: [], groups: [] },
  addons:    { id: 'addons',    title: 'Add-ons',    icon: '🧩',  type: 'addons',        nodes: [],             edges: [],             groups: [] },
  finance:   { id: 'finance',   title: 'Finance',    icon: '💰' },
};

/** Footer / home tabs keep the wordmark. Keep in sync with src/lib/adminSpecialPages.ts. */
export const ADMIN_PRIMARY_PAGE_KEYS = ['dashboard', 'chats', 'email', 'work', 'schedule', 'clients', 'todo', 'punchlist'];

/** Account pages keep the wordmark + their own pane back. Keep in sync with src/lib/adminSpecialPages.ts. */
export const ADMIN_SETTINGS_PAGE_KEYS = ['profile', 'company', 'settings', 'socials', 'addons', 'industries', 'vapi', 'lead-scanner'];

const ADMIN_PRIMARY_PAGE_SET = new Set(ADMIN_PRIMARY_PAGE_KEYS);
const ADMIN_SETTINGS_PAGE_SET = new Set(ADMIN_SETTINGS_PAGE_KEYS);

/**
 * Special-page chrome: header back chevron beside the wordmark.
 * Canvas maps (`special: true`) and dashboard-grid destinations.
 * Override per map with `special: true` / `special: false`.
 * Styles: src/styles/admin/special-page.css. Standalone: AdminSpecialLayout.astro.
 */
export function isSpecialAdminPage(key, map = MAPS[key]) {
  if (!key || key === 'finance') return false;
  if (!map || map.link) return false;
  if (map.special === true) return true;
  if (map.special === false) return false;
  if (ADMIN_PRIMARY_PAGE_SET.has(key)) return false;
  if (ADMIN_SETTINGS_PAGE_SET.has(key) || ADMIN_SETTINGS_PAGE_SET.has(map.type)) return false;
  return true;
}

/** Canvas maps grouped under the header "System" dropdown. */
export const SYSTEM_MAP_KEYS = ['system', 'tooling', 'email-triage'];
/** Placeholder key in saved tab order for the System dropdown slot. */
export const SYSTEM_TAB_SLOT = '__system__';
/** Mobile: Chats dropdown also opens Knowledge. */
export const CHAT_MAP_KEYS = ['chats', 'knowledge'];
export const CHAT_TAB_SLOT = '__chat__';

// Back-compat: the "System" map is still the default export surface.
export const NODES = SYSTEM_NODES;
export const EDGES = SYSTEM_EDGES;
export const GROUPS = SYSTEM_GROUPS;
