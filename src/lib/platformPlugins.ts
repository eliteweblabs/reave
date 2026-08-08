/** Optional platform modules (the “last 10%”) — accordion content for /modules. */

export type PlatformPlugin = {
  id: string;
  title: string;
  teaser: string;
  body: string;
  bullets?: string[];
};

export const PLATFORM_PLUGINS: PlatformPlugin[] = [
  {
    id: 'dealership',
    title: 'Dealership Inventory Wizard',
    teaser:
      'Swipe-to-browse inventory, a 6-step lead wizard, and test-drive booking — built for one dealership, ready for the next.',
    body: 'Inventory syncs straight in. A caller asks for "a red SUV under $25k," gets a magic link, and can finish a deal — vehicle, trade-in, credit, documents, deposit — without ever calling back.',
    bullets: [
      'Public inventory search by make, price, and condition',
      'Magic-link deal flow: Vehicle → Contact → Trade-In → Credit → Documents → Deposit',
      'Test-drive booking tied straight to the lead',
      'Voice widget on the inventory page for hands-free browsing',
    ],
  },
  {
    id: 'fleet',
    title: 'Fleet GPS Tracking',
    teaser:
      'Live GPS for every van, truck, and field crew — on a map dispatch can actually use.',
    body: "Built for businesses running delivery vans or service trucks. Assign a vehicle to a driver's sign-in and location pings start the moment they open the app — no extra hardware.",
    bullets: [
      'Multi-vehicle map with live location updates',
      'No extra hardware — mobile browser GPS',
      'Agent tools for dispatch-style lookups in chat',
      'Separate fleet-api service on Railway',
    ],
  },
  {
    id: 'inventory',
    title: 'Multi-Channel Inventory Sync',
    teaser:
      'One stock view across Shopify, WooCommerce, Square, and the platforms you already sell on — query from admin or the agent.',
    body: 'Retailers and brands often run a Shopify storefront, a WooCommerce wholesale site, and Square at the counter. inventory-api normalizes SKU, price, and quantity into one shape the agent can search — then map into Crater quotes when billing is on.',
    bullets: [
      'Shopify, WooCommerce, and Square provider slots (live sync when a client prioritizes it)',
      'Mock multi-channel catalog for demos and sales conversations today',
      'Agent tools: search_inventory, get_inventory_product, list_inventory_channels',
      'Separate inventory-api microservice on Railway — same pattern as materials-api',
    ],
  },
  {
    id: 'real-estate',
    title: 'Real Estate Data',
    teaser:
      'Property facts, compliance timelines, hazard profiles, and municipal violations — plus a Lead Scanner for nearby properties.',
    body: 'Assessor-backed property lookup, floor area, and compliance timelines by age and state — roof, panel, HVAC, and more. The Lead Scanner geofences an area and creates inquiry projects for properties that match your trades.',
    bullets: [
      'Assessor-backed property lookup and floor area',
      'Compliance timeline by age and state (roof, panel, HVAC, etc.)',
      'Daily geofenced Lead Scanner → inquiry projects',
      'Property Liability Radar with trade-specific lead score',
    ],
  },
  {
    id: 'documents',
    title: 'Document Signing',
    teaser:
      'Proposals and contracts that get signed on the same portal the client already trusts.',
    body: "Templates for the paperwork that actually needs a signature, surfaced right on the client's Documents tab — no separate e-sign tool to log into.",
    bullets: [
      'Templates for paperwork that needs a signature',
      'Documents tab on the client portal',
      'Status tracking from sent to signed',
    ],
  },
  {
    id: 'voice',
    title: 'Voice & Call Routing',
    teaser:
      'Real call routing with Telnyx — answer, qualify, hand off, or book without anyone picking up the phone.',
    body: 'One layer handles the conversation, another routes the actual call. Together they cover a caller from "hello" all the way to "booked."',
    bullets: [
      'Inbound call routing and IVR-style flows',
      'Works alongside the Live Speak Agent Widget',
      'Conversation layer through to booked appointment',
    ],
  },
  {
    id: 'vapi',
    title: 'Live Speak Agent Widget',
    teaser:
      'A Vapi-powered voice assistant on your homepage — callers browse inventory, ask questions, or start a deal hands-free.',
    body: 'Optional upsell add-on (off by default). Syncs with admin for prompt and tool updates, and pairs with dealership inventory and lead flows when those modules are on.',
    bullets: [
      'Optional upsell add-on (off by default)',
      'Syncs with admin for prompt and tool updates',
      'Pairs with dealership inventory and lead flows',
    ],
  },
  {
    id: 'carddav',
    title: 'CardDAV Contact Sync',
    teaser:
      'The master client list, live in the iPhone Contacts app — no Google account, no iCloud detour.',
    body: 'One CardDAV account, set up once in iOS Settings, and every contact you add in the dashboard shows up on your phone exactly the way it always has.',
    bullets: [
      'No Google account or iCloud detour',
      'Contacts added in admin appear on your phone',
      'Standard vCard format',
    ],
  },
  {
    id: 'newsletter',
    title: 'Newsletter & Lifecycle Email',
    teaser:
      'Welcome emails, follow-ups, review requests, and win-back campaigns — sent automatically, on a schedule you set once.',
    body: 'Every lifecycle and broadcast email renders through a shared branded HTML wrapper — your logo, styled CTA, optional QR code — then sends server-side via Resend from your domain. Built-in templates cover welcome, check-in, thank-you, review request, and re-engagement without a separate ESP login.',
    bullets: [
      'HTML templates built for real inboxes — table layout, inline fallbacks, dark-mode support',
      'Resend API delivery from your domain — not a no-reply@ vendor address',
      'Automations on new contact, project complete, and timed follow-ups',
      'Broadcast to all clients or a hand-picked list from admin',
      'CAN-SPAM footer and one-click unsubscribe on every marketing send',
    ],
  },
  {
    id: 'monitoring',
    title: 'Website Monitoring & Audits',
    teaser:
      'Uptime checks, change detection, and Lighthouse-style audits — so you know before the client does.',
    body: "Three layers watch client sites from the admin dashboard: UptimeRobot for downtime, ChangeDetection.io for content changes, and built-in audits for SSL, DNS, broken links, and Lighthouse scores. Alerts land in the smart inbox instead of a separate monitoring tab you'll forget to check.",
    bullets: [
      'UptimeRobot sync — auto-discover production domains and import monitors',
      'Change detection watches key pages and diffs what changed',
      'Website audits: Lighthouse performance, SSL expiry, DNS records, broken links',
      'Agent tools can run audits and summarize results in chat',
    ],
  },
  {
    id: 'time-tracking',
    title: 'Project Time Tracking',
    teaser:
      'Log hours and notes on any project — then bridge straight into invoicing.',
    body: 'Optional time log on each job: start/stop timers or manual entries with notes. When billing is enabled, the agent can suggest invoice line items from logged hours instead of reconstructing the week from memory.',
    bullets: [
      'Per-project time entries with hours and optional notes',
      'Invoice suggestions pull unbilled hours into Crater line items',
      'Enabled per install — off by default for businesses that do not bill hourly',
    ],
  },
  {
    id: 'content-management',
    title: 'Website Content Management',
    teaser:
      'Update headline, navigation, and page copy through chat — no CMS login, no page builder.',
    body: 'The business owner describes what they want changed on their public site and the agent handles the rest — read the config, edit the Astro files, commit to GitHub, and Railway deploys it. Same agent they already use for billing and projects; no separate CMS product to learn.',
    bullets: [
      'Change copy, headlines, and nav by asking in plain English',
      'Swap images — stock photos via Pexels or upload through Media',
      'Edits commit to main and go live after deploy (no draft queue)',
      'Uses existing agent tools — no WordPress or Webflow admin',
    ],
  },
  {
    id: 'dev-infra',
    title: 'Dev & Deploy Infrastructure',
    teaser:
      'Git, Railway, Kinsta, and deploy status — for agency installs that ship code, not just configure.',
    body: 'Agency-facing tooling: inspect repos, trigger deploys, read Railway logs, and manage hosting from the same admin the client never sees. The agent can check deploy status and answer "did my push go live?" without opening four dashboards.',
    bullets: [
      'Inspect repos and trigger deploys from admin',
      'Read Railway logs without opening dashboards',
      'Agent answers "did my push go live?"',
    ],
  },
  {
    id: 'namecom-dns',
    title: 'DNS Record Management',
    teaser:
      'Add and edit Name.com DNS records from admin — no separate registrar login during launch week.',
    body: 'For agency installs managing client domains: list, create, and update DNS records through agent tools or admin flows. Credentials can come from the client vault when no global registrar token is configured.',
    bullets: [
      'List, create, and update DNS records',
      'Agent tools or admin flows',
      'Credentials from client vault when needed',
    ],
  },
];
