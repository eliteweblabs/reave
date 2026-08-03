/** Crafted hero demo exchanges — voice prompts and slash commands with plausible replies. */
export type HeroDemoExchange = {
  prompt: string;
  answer: string;
  /** Voice-style prompt vs admin slash command. */
  kind: "voice" | "slash";
};

export const HERO_DEMO_EXCHANGES: HeroDemoExchange[] = [
  {
    kind: "voice",
    prompt: "Siri, how many hours did we bill last week?",
    answer: "Last week: 47.5 billable hours across 6 projects. Henderson led at 18 hours.",
  },
  {
    kind: "voice",
    prompt: "Is Pete at the Pine Street job?",
    answer: "Pete checked in at Pine Street at 8:42 AM. GPS shows him on site now.",
  },
  {
    kind: "slash",
    prompt: "/audit Run a Lighthouse audit on 210main.com.",
    answer: "Performance 91 · Accessibility 96 · Best practices 100. Two images need WebP.",
  },
  {
    kind: "voice",
    prompt: "Let's bill everything open on the Henderson project.",
    answer: "Draft invoice created — $4,280 across 12 line items. Ready for your review.",
  },
  {
    kind: "slash",
    prompt: "/invoice List my recent Crater invoices.",
    answer: "3 open: INV-0042 Henderson $4,280 · INV-0041 Westside $820 · INV-0039 Acme $1,500.",
  },
  {
    kind: "voice",
    prompt: "Siri, how many medium blue logo tees are in stock?",
    answer: "Medium blue logo tee: 142 in stock, 28 on backorder. Reorder point is 50.",
  },
  {
    kind: "slash",
    prompt: "/meeting What's on my calendar today and upcoming?",
    answer: "Today: Johnson inspection 2 PM, crew dispatch review 4:30. Tomorrow: Westside walkthrough.",
  },
  {
    kind: "voice",
    prompt: "What's our open AR on the Westside account?",
    answer: "Westside open AR: $2,340 — INV-0041 ($820) and INV-0037 ($1,520), both current.",
  },
  {
    kind: "slash",
    prompt: "/work List open jobs for Henderson.",
    answer: "4 open Henderson jobs: rough-in (Pete), finish carpentry, punch list, final billing.",
  },
  {
    kind: "voice",
    prompt: "Send tomorrow's crew dispatch for the roof jobs.",
    answer: "Dispatch sent to 6 crew — Maple Ave 7 AM, Oak Ridge 9 AM, Pine Street 11 AM.",
  },
  {
    kind: "slash",
    prompt: "/document Send document nda-standard to Parker Marketing for signing.",
    answer: "NDA sent to Parker Marketing — opened 2 min ago, awaiting signature.",
  },
  {
    kind: "voice",
    prompt: "Siri, pull up the lease renewal for unit 4B.",
    answer: "Unit 4B lease renews Apr 15. Current rent $1,850 — market comp suggests $1,975.",
  },
  {
    kind: "slash",
    prompt: "/contact Who is Parker Marketing?",
    answer: "Parker Marketing — Sarah Chen, sarah@parkermktg.com. 2 open projects, last contact 3 days ago.",
  },
  {
    kind: "voice",
    prompt: "How many pallets of oak flooring are on order?",
    answer: "Oak flooring: 6 pallets inbound from supplier, ETA Thursday. 2 pallets in warehouse.",
  },
  {
    kind: "slash",
    prompt: "/schedule Get my Cal.com booking link to share with a client.",
    answer: "Your booking link: cal.com/you/30min — copied. 4 open slots this week.",
  },
  {
    kind: "voice",
    prompt: "Siri, log four hours on the Miller design phase.",
    answer: "Logged 4 hours to Miller design phase — your week is now at 31.5 billable hours.",
  },
  {
    kind: "voice",
    prompt: "Text the homeowner we're running twenty minutes late.",
    answer: "Text sent to Johnson — delivery confirmed. Updated ETA 2:20 PM.",
  },
  {
    kind: "slash",
    prompt: "/send Email Tony at tony@example.com: Your portal link is ready.",
    answer: "Email queued to Tony — portal link included. Delivered.",
  },
  {
    kind: "voice",
    prompt: "Siri, what's the status on claim number 8842?",
    answer: "Claim #8842: adjuster review, photos uploaded yesterday. Expected decision within 5 days.",
  },
  {
    kind: "voice",
    prompt: "Run payroll for the Denver warehouse shift.",
    answer: "Denver warehouse shift payroll submitted — 14 employees, $8,420 gross.",
  },
];
