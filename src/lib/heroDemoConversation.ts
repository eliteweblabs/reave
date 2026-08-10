/** Crafted hero demo scenes — multi-turn conversations with optional action chips. */
export type HeroDemoActionEffect = "invoice-payment";

export type HeroDemoAction = {
  label: string;
  variant?: "primary" | "secondary";
  /** After the simulated press, play a skeleton UI beat (e.g. invoice + payment). */
  effect?: HeroDemoActionEffect;
};

export type HeroDemoTurn = {
  role: "user" | "assistant";
  text: string;
  kind?: "voice" | "slash";
  /** Shown below assistant copy — e.g. Review draft, View status. */
  actions?: HeroDemoAction[];
  /** Pause before this turn appears (ms). */
  pauseMs?: number;
};

export type HeroDemoScene = {
  id: string;
  turns: HeroDemoTurn[];
  /** Headshot for the business owner in this scene's user messages. */
  userAvatar?: string;
  /** Pause after the last turn before the scene fades (ms). */
  holdMs?: number;
};

/** Slash commands shown in the hero demo picker when the user types "/". */
export const HERO_DEMO_SLASH_PICKER = [
  { slash: "/invoice", summary: "List recent invoices" },
  { slash: "/document", summary: "Send a document for signing" },
  { slash: "/work", summary: "List open jobs" },
  { slash: "/contact", summary: "Look up a client" },
  { slash: "/meeting", summary: "Today's calendar" },
  { slash: "/send", summary: "Send an email" },
] as const;

export const HERO_DEMO_SCENES: HeroDemoScene[] = [
  {
    id: "field-checkin",
    userAvatar: "/images/hero-demo/field-checkin.png",
    holdMs: 1000,
    turns: [
      { role: "user", text: "Is Pete at the Pine Street job?", kind: "voice" },
      {
        role: "assistant",
        text: "Checking GPS for Pete Lawson…",
        pauseMs: 700,
      },
      {
        role: "assistant",
        text: "Pete checked in at Pine Street at 8:42 AM. On site now.",
        pauseMs: 1600,
      },
      {
        role: "user",
        text: "Text the crew lead he's clear to start rough-in.",
        kind: "voice",
        pauseMs: 1400,
      },
      {
        role: "assistant",
        text: "Sent to Mike Torres — delivered.",
        pauseMs: 1200,
      },
      {
        role: "assistant",
        text: "Susie from Susie's Cookies just opened your Digital Marketing Strategy proposal.",
        pauseMs: 1400,
        actions: [{ label: "View activity", variant: "secondary" }],
      },
    ],
  },
  {
    id: "henderson-billing",
    userAvatar: "/images/hero-demo/henderson-billing.png",
    holdMs: 1100,
    turns: [
      {
        role: "user",
        text: "Let's bill everything open on the Henderson project.",
        kind: "voice",
      },
      {
        role: "assistant",
        text: "Found 12 billable line items totaling $4,280.",
        pauseMs: 1400,
      },
      {
        role: "assistant",
        text: "Draft invoice INV-0042 is ready for review.",
        pauseMs: 1700,
        actions: [{ label: "Review draft", variant: "primary" }],
      },
      {
        role: "assistant",
        text: "Susie from Susie's Cookies opened the Digital Marketing Strategy proposal — 4 minutes ago.",
        pauseMs: 1300,
        actions: [{ label: "View proposal", variant: "secondary" }],
      },
      {
        role: "user",
        text: "Send it to Sarah for approval.",
        kind: "voice",
        pauseMs: 2000,
      },
      {
        role: "assistant",
        text: "Approval request sent to Sarah Chen.",
        pauseMs: 1300,
      },
    ],
  },
  {
    id: "nda-signing",
    userAvatar: "/images/hero-demo/nda-signing.png",
    holdMs: 1000,
    turns: [
      {
        role: "user",
        text: "/document Send document nda-standard to Parker Marketing for signing.",
        kind: "slash",
      },
      {
        role: "assistant",
        text: "NDA sent to Parker Marketing — Sarah Chen, sarah@parkermktg.com.",
        pauseMs: 1500,
      },
      {
        role: "assistant",
        text: "Sarah viewed the proposal 2 minutes ago.",
        pauseMs: 1500,
        actions: [{ label: "View signing status", variant: "secondary" }],
      },
      {
        role: "user",
        text: "Remind me if it's not signed by Friday.",
        kind: "voice",
        pauseMs: 1900,
      },
      {
        role: "assistant",
        text: "Reminder set for Friday at 9 AM.",
        pauseMs: 1200,
      },
    ],
  },
  {
    id: "inventory-channels",
    userAvatar: "/images/hero-demo/inventory-channels.png",
    holdMs: 1000,
    turns: [
      {
        role: "user",
        text: "How many medium blue logo tees do we have across channels?",
        kind: "voice",
      },
      {
        role: "assistant",
        text: "Shopify 94 · WooCommerce 31 · Square POS 17 — 142 total in stock.",
        pauseMs: 1500,
      },
      {
        role: "assistant",
        text: "28 on backorder. You're below the reorder point of 50.",
        pauseMs: 1500,
        actions: [{ label: "Create reorder PO", variant: "primary" }],
      },
      {
        role: "user",
        text: "Yes, draft that.",
        kind: "voice",
        pauseMs: 1800,
      },
      {
        role: "assistant",
        text: "PO draft #8841 created — 120 units from primary supplier.",
        pauseMs: 1200,
      },
    ],
  },
  {
    id: "site-update",
    userAvatar: "/images/hero-demo/henderson-billing.png",
    holdMs: 1000,
    turns: [
      {
        role: "user",
        text: "Change the homepage headline to Your business, one app.",
        kind: "voice",
      },
      {
        role: "assistant",
        text: "Homepage headline updated — deploying now.",
        pauseMs: 1400,
      },
      {
        role: "assistant",
        text: "Live on your website. Want me to swap the hero image while we're at it?",
        pauseMs: 1600,
      },
      {
        role: "user",
        text: "Yes — use the team photo from last month's shoot.",
        kind: "voice",
        pauseMs: 1400,
      },
      {
        role: "assistant",
        text: "Hero image swapped and deployed.",
        pauseMs: 1200,
      },
    ],
  },
  {
    id: "labor-day-hours",
    userAvatar: "/images/hero-demo/henderson-billing.png",
    holdMs: 1100,
    turns: [
      {
        role: "user",
        text: "Put a banner on the website announcing that we are closed for Labor Day weekend and change the hours of operation to close at noon on Fridays.",
        kind: "voice",
      },
      {
        role: "assistant",
        text: "Updating website banner and hours…",
        pauseMs: 700,
      },
      {
        role: "assistant",
        text: "All set. Would you like me to also update your Google Business Profile to reflect?",
        pauseMs: 1600,
      },
      {
        role: "user",
        text: "Yes.",
        kind: "voice",
        pauseMs: 1400,
      },
      {
        role: "assistant",
        text: "Updating Google Business Profile…",
        pauseMs: 700,
      },
      {
        role: "assistant",
        text: "Done.",
        pauseMs: 1300,
        actions: [
          { label: "Google Business Profile", variant: "primary" },
          { label: "View website", variant: "secondary" },
        ],
      },
    ],
  },
  {
    id: "materials-paint-pricing",
    userAvatar: "/images/hero-demo/materials-paint-pricing.png",
    holdMs: 1000,
    turns: [
      {
        role: "user",
        text: "What's the square footage for 15 gallons of interior paint?",
        kind: "voice",
      },
      {
        role: "assistant",
        text: "At 350 sq ft per gallon (one coat), 15 gallons covers about 5,250 sq ft. For two coats, plan on ~2,625 sq ft.",
        pauseMs: 1500,
      },
      {
        role: "user",
        text: "OK, can you give me prices on some options?",
        kind: "voice",
        pauseMs: 1400,
      },
      {
        role: "assistant",
        text: "Pulling live Home Depot prices…",
        pauseMs: 700,
      },
      {
        role: "assistant",
        text: "BEHR Premium Plus 1 gal — $34.98 · BEHR Dynasty 1 gal — $52.98 · Valspar Signature 5 gal — $124.98. All in stock at 02108.",
        pauseMs: 1600,
        actions: [{ label: "Add to quote", variant: "primary" }],
      },
    ],
  },
  {
    id: "reggie-payment",
    userAvatar: "/images/hero-demo/henderson-billing.png",
    /** Short hold after the invoice card has already swiped away. */
    holdMs: 900,
    turns: [
      {
        role: "user",
        text: "Reggie gave me $500 towards his bill.",
        kind: "voice",
      },
      {
        role: "assistant",
        text: "Looking up open invoices for The Solid Builder…",
        pauseMs: 700,
      },
      {
        role: "assistant",
        text: "Great — two open invoices for The Solid Builder. Which one should I apply the $500 to?",
        pauseMs: 1500,
        actions: [
          { label: "Website redesign", variant: "primary" },
          { label: "2027 Hosting", variant: "secondary" },
        ],
      },
      {
        role: "assistant",
        text: "Ok — I'll apply it to the website redesign invoice. How did he pay? Cash, check, Apple Pay, Venmo, or Zelle?",
        pauseMs: 1400,
      },
      {
        role: "user",
        text: "He wrote a check.",
        kind: "voice",
        pauseMs: 1400,
      },
      {
        role: "assistant",
        text: "Recording payment…",
        pauseMs: 700,
      },
      {
        role: "assistant",
        text: "Applied a $500 check to website redesign (INV-0087). Remaining balance: $2,150.",
        pauseMs: 1300,
        actions: [
          {
            label: "View invoice",
            variant: "primary",
            effect: "invoice-payment",
          },
        ],
      },
    ],
  },
];
