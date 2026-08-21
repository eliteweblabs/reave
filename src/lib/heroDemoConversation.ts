/** Crafted hero demo scenes — multi-turn conversations with optional action chips. */
export type HeroDemoActionEffect =
  | "invoice-payment"
  | "invoice-review"
  | "proposal-flow"
  | "signing-status";
/** Plays during an assistant turn (e.g. status line) before the scene continues. */
export type HeroDemoTurnEffect = "gps-locate";

export type HeroDemoAction = {
  label: string;
  variant?: "primary" | "secondary";
  /** After the simulated press, play a skeleton UI beat (e.g. invoice + payment). */
  effect?: HeroDemoActionEffect;
};

export type HeroDemoTurn = {
  role: "user" | "assistant";
  text: string;
  /**
   * `mention` — types `@` then the picker.
   * `soft-mention` — picker from to/from/for after send/bill/… (no `@` typed).
   */
  kind?: "voice" | "slash" | "mention" | "soft-mention";
  /** Shown below assistant copy — e.g. Review draft, View status. */
  actions?: HeroDemoAction[];
  /** Pause before this turn appears (ms). */
  pauseMs?: number;
  /** Skeleton / visual beat while this turn is on screen (status lines, etc.). */
  effect?: HeroDemoTurnEffect;
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
  { slash: "/knowledge", summary: "List knowledge docs" },
  { slash: "/inbox", summary: "List inbox emails" },
  { slash: "/todo", summary: "List personal todos" },
  { slash: "/remember", summary: "What the agent already knows" },
  { slash: "/work", summary: "List open jobs" },
  { slash: "/contact", summary: "Look up a contact" },
  { slash: "/invoice", summary: "List recent invoices" },
  { slash: "/document", summary: "Send a document for signing" },
  { slash: "/meeting", summary: "Today's calendar" },
  { slash: "/send", summary: "Send an email" },
  { slash: "/portal", summary: "Get a client portal link" },
] as const;

export type HeroDemoMentionOption = {
  name: string;
  company: string;
  email?: string;
  phone?: string;
  kind?: "contact" | "team";
};

/**
 * Spoofed people for the hero @-mention picker (demo only).
 * Includes "The …" contacts for soft-mention demos like "send contract to The".
 */
export const HERO_DEMO_MENTION_PICKER: HeroDemoMentionOption[] = [
  {
    name: "Pete Alvarez",
    company: "Field crew",
    email: "pete@fieldcrew.demo",
    kind: "team",
  },
  {
    name: "Sarah Chen",
    company: "Approvals",
    email: "sarah@parkermktg.com",
    kind: "team",
  },
  {
    name: "Parker Marketing",
    company: "Parker Marketing",
    email: "sarah@parkermktg.com",
    phone: "6175550142",
  },
  {
    name: "The Bottle Shop Beverly",
    company: "The Bottle Shop",
    email: "alex@thebottleshopbeverly.com",
    phone: "16175431000",
  },
  {
    name: "The Cabot Theatre",
    company: "The Cabot Performing Arts Center",
    email: "info@thecabot.org",
    phone: "9789273100",
  },
  {
    name: "The Reading Studio",
    company: "The Reading Studio",
    email: "kdimauro@thereadingstudio.com",
  },
  {
    name: "The Rustic Mandala",
    company: "The Rustic Mandala",
  },
  {
    name: "The Solid Builder",
    company: "The Solid Builder",
    email: "reggie@thesolidbuilder.com",
    phone: "19788106088",
  },
];

/**
 * Extra people referenced in demo copy (assistant replies, SMS lists) who are
 * not in the @-picker — still rendered as mention chips when prefixed with `@`.
 */
export const HERO_DEMO_MENTION_EXTRAS: HeroDemoMentionOption[] = [
  {
    name: "Reggie",
    company: "The Solid Builder",
    email: "reggie@thesolidbuilder.com",
  },
  {
    name: "Mike Torres",
    company: "Field crew",
    kind: "team",
  },
  {
    name: "Jordan Hale",
    company: "Field crew",
    kind: "team",
  },
  {
    name: "Ava Brooks",
    company: "Field crew",
    kind: "team",
  },
];

/** Longest-first names for parsing `@Name` tokens in demo bubble text. */
export function heroDemoMentionNames(): string[] {
  const names = new Set<string>();
  for (const option of HERO_DEMO_MENTION_PICKER) names.add(option.name);
  for (const option of HERO_DEMO_MENTION_EXTRAS) names.add(option.name);
  return [...names].sort((a, b) => b.length - a.length);
}

export function heroDemoMentionKind(name: string): "contact" | "team" {
  const option =
    HERO_DEMO_MENTION_PICKER.find((o) => o.name === name) ??
    HERO_DEMO_MENTION_EXTRAS.find((o) => o.name === name);
  return option?.kind === "team" ? "team" : "contact";
}

export const HERO_DEMO_SCENES: HeroDemoScene[] = [
  {
    id: "field-checkin",
    userAvatar: "hero-field-checkin",
    holdMs: 1000,
    turns: [
      {
        role: "user",
        text: "Is @Pete Alvarez at the Franklin Street job?",
        kind: "mention",
      },
      {
        role: "assistant",
        /** Visual-only — Mapbox fly-in is the agent reply. */
        text: "",
        effect: "gps-locate",
      },
      {
        role: "assistant",
        text: "@Pete Alvarez checked in at Franklin Street at 8:42 AM. On site now.",
        pauseMs: 1600,
      },
      {
        role: "user",
        text: "Text the crew he's clear to start rough-in.",
        kind: "voice",
        pauseMs: 1400,
      },
      {
        role: "assistant",
        text: "SMS sent to @Mike Torres, @Jordan Hale, and @Ava Brooks.",
        pauseMs: 1200,
      },
    ],
  },
  {
    id: "susie-proposal",
    userAvatar: "hero-nda-signing",
    holdMs: 1400,
    turns: [
      {
        role: "user",
        /** New prospect / user-creation flow — plain name on purpose (no @mention). */
        text: "Generate a proposal for Susie's Cookies in Springfield.",
        kind: "voice",
      },
      {
        role: "assistant",
        text: "Found Susie's Cookies — bakery at 412 Main St, Springfield, MO. Owner Susie Miller, susie@susiescookies.com, (417) 555-0198. Looks like a fit for digital marketing. Does that look right?",
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
        text: "Do you want to use a template or start from scratch?",
        pauseMs: 1500,
        actions: [
          { label: "Bronze", variant: "secondary" },
          {
            label: "Silver",
            variant: "primary",
            effect: "proposal-flow",
          },
          { label: "Gold", variant: "secondary" },
        ],
      },
    ],
  },
  {
    id: "henderson-billing",
    userAvatar: "hero-henderson-billing",
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
        actions: [
          {
            label: "Review draft",
            variant: "primary",
            effect: "invoice-review",
          },
        ],
      },
      {
        role: "assistant",
        text: "Approval request sent to @Sarah Chen.",
        pauseMs: 1300,
      },
    ],
  },
  {
    id: "nda-signing",
    userAvatar: "hero-nda-signing",
    /** Hard-cut after the status press — keep this short if the cut is skipped. */
    holdMs: 400,
    turns: [
      {
        role: "user",
        /**
         * Soft-mention showcase: types "Send contract to The" (no `@`),
         * picker suggests The Solid Builder, then inserts @The Solid Builder.
         */
        text: "Send contract to @The Solid Builder for signing.",
        kind: "soft-mention",
      },
      {
        role: "assistant",
        text: "NDA sent to @The Solid Builder — @Reggie, reggie@thesolidbuilder.com.",
        pauseMs: 1500,
      },
      {
        role: "assistant",
        text: "@Reggie viewed the NDA document 2 minutes ago.",
        pauseMs: 1500,
        actions: [
          {
            label: "View signing status",
            variant: "primary",
            effect: "signing-status",
          },
        ],
      },
    ],
  },
  {
    id: "slash-invoice",
    userAvatar: "hero-henderson-billing",
    holdMs: 900,
    turns: [
      {
        role: "user",
        text: "/invoice List recent invoices.",
        kind: "slash",
      },
      {
        role: "assistant",
        text: "3 open invoices · $8,420 outstanding.",
        pauseMs: 1400,
        actions: [{ label: "View invoices", variant: "primary" }],
      },
    ],
  },
  {
    id: "inventory-channels",
    userAvatar: "hero-inventory-channels",
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
    userAvatar: "hero-henderson-billing",
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
    userAvatar: "hero-henderson-billing",
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
    userAvatar: "hero-materials-paint-pricing",
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
    userAvatar: "hero-henderson-billing",
    /** Hold on the settled invoice before the scene fades. */
    holdMs: 1400,
    turns: [
      {
        role: "user",
        /** Soft mention via payment + for — types "for The", not `@`. */
        text: "Add a $500 payment for @The Solid Builder",
        kind: "soft-mention",
      },
      {
        role: "assistant",
        text: "Looking up open invoices for @The Solid Builder…",
        pauseMs: 700,
      },
      {
        role: "assistant",
        text: "Great — two open invoices for @The Solid Builder. Which one should I apply the $500 to?",
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
