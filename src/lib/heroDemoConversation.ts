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

export const HERO_DEMO_SCENES: HeroDemoScene[] = [
  {
    id: "field-checkin",
    holdMs: 3200,
    turns: [
      { role: "user", text: "Is Pete at the Pine Street job?", kind: "voice" },
      {
        role: "assistant",
        text: "Checking GPS for Pete Lawson…",
        pauseMs: 400,
      },
      {
        role: "assistant",
        text: "Pete checked in at Pine Street at 8:42 AM. On site now.",
        pauseMs: 1100,
      },
      {
        role: "user",
        text: "Text the crew lead he's clear to start rough-in.",
        kind: "voice",
        pauseMs: 900,
      },
      {
        role: "assistant",
        text: "Sent to Mike Torres — delivered.",
        pauseMs: 800,
      },
    ],
  },
  {
    id: "henderson-billing",
    holdMs: 3800,
    turns: [
      {
        role: "user",
        text: "Let's bill everything open on the Henderson project.",
        kind: "voice",
      },
      {
        role: "assistant",
        text: "Found 12 billable line items totaling $4,280.",
        pauseMs: 900,
      },
      {
        role: "assistant",
        text: "Draft invoice INV-0042 is ready for review.",
        pauseMs: 1000,
        actions: [{ label: "Review draft", variant: "primary" }],
      },
      {
        role: "user",
        text: "Send it to Sarah for approval.",
        kind: "voice",
        pauseMs: 1400,
      },
      {
        role: "assistant",
        text: "Approval request sent to Sarah Chen.",
        pauseMs: 800,
      },
    ],
  },
  {
    id: "nda-signing",
    holdMs: 3600,
    turns: [
      {
        role: "user",
        text: "/document Send document nda-standard to Parker Marketing for signing.",
        kind: "slash",
      },
      {
        role: "assistant",
        text: "NDA sent to Parker Marketing — Sarah Chen, sarah@parkermktg.com.",
        pauseMs: 1000,
      },
      {
        role: "assistant",
        text: "Sarah opened the envelope 2 minutes ago.",
        pauseMs: 900,
        actions: [{ label: "View signing status", variant: "secondary" }],
      },
      {
        role: "user",
        text: "Remind me if it's not signed by Friday.",
        kind: "voice",
        pauseMs: 1500,
      },
      {
        role: "assistant",
        text: "Reminder set for Friday at 9 AM.",
        pauseMs: 700,
      },
    ],
  },
  {
    id: "inventory-channels",
    holdMs: 3400,
    turns: [
      {
        role: "user",
        text: "How many medium blue logo tees do we have across channels?",
        kind: "voice",
      },
      {
        role: "assistant",
        text: "Shopify 94 · WooCommerce 31 · Square POS 17 — 142 total in stock.",
        pauseMs: 950,
      },
      {
        role: "assistant",
        text: "28 on backorder. You're below the reorder point of 50.",
        pauseMs: 900,
        actions: [{ label: "Create reorder PO", variant: "primary" }],
      },
      {
        role: "user",
        text: "Yes, draft that.",
        kind: "voice",
        pauseMs: 1300,
      },
      {
        role: "assistant",
        text: "PO draft #8841 created — 120 units from primary supplier.",
        pauseMs: 800,
      },
    ],
  },
];
