/** Crafted hero demo scenes — multi-turn conversations with optional action chips. */
export type HeroDemoAction = {
  label: string;
  variant?: "primary" | "secondary";
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
    holdMs: 4800,
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
    ],
  },
  {
    id: "henderson-billing",
    holdMs: 5200,
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
    holdMs: 5000,
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
        text: "Sarah opened the envelope 2 minutes ago.",
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
    holdMs: 4800,
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
];
