/** Resolve Data — IT & cybersecurity company site data. */

export const RESOLVE_DATA = {
  name: "Resolve Data",
  tagline: "IT Security & Managed IT for Growing Businesses",
  description:
    "Resolve Data delivers enterprise-grade cybersecurity and managed IT services to businesses in the Haverhill, MA area. Fast response. No jargon. No nonsense.",
  phone: "(978) 228-5733",
  phoneHref: "tel:+19782285733",
  email: "info@resolvedata.com",
  address: "Haverhill, MA",
  url: "https://resolvedata.com",
  gbpLink: "https://maps.app.goo.gl/resolvedata",
  // Brand
  colors: {
    navy: "#0a1628",
    blue: "#2563eb",
    white: "#ffffff",
    slate: "#64748b",
    lightBg: "#f8fafc",
  },
} as const;

export const RESOLVE_DATA_SERVICES = [
  {
    slug: "it-security",
    icon: "shield",
    title: "IT Security",
    description:
      "Endpoint protection, threat monitoring, vulnerability assessments, and incident response — so a breach stays a near-miss, not a headline.",
  },
  {
    slug: "managed-it",
    icon: "server",
    title: "Managed IT",
    description:
      "Proactive monitoring, patch management, helpdesk support, and strategic planning. We run your IT so you can run your business.",
  },
  {
    slug: "digital-transformation",
    icon: "layers",
    title: "Digital Transformation",
    description:
      "Cloud migrations, workflow automation, and infrastructure modernization. Move faster without breaking things.",
  },
  {
    slug: "software-solutions",
    icon: "code",
    title: "Software Solutions",
    description:
      "Custom integrations, business application rollouts, and legacy system migrations. The right tools, configured the right way.",
  },
] as const;

export const RESOLVE_DATA_TESTIMONIALS = [
  {
    quote:
      "Resolve Data completely transformed how we handle IT. Response time is night and day from our old provider — they actually pick up the phone.",
    name: "Ryan Garrett",
    company: "",
  },
  {
    quote:
      "We brought Resolve Data in after a ransomware scare. They locked everything down, got us back up fast, and set up monitoring so we'd catch anything like that going forward.",
    name: "Morse Constructions",
    company: "Morse Constructions",
  },
] as const;

export const RESOLVE_DATA_FAQS = [
  {
    question: "What areas do you serve?",
    answer:
      "We serve businesses throughout the Merrimack Valley — Haverhill, Lawrence, Andover, Methuen, and surrounding communities. Remote support is available anywhere in New England.",
  },
  {
    question: "How fast do you respond to issues?",
    answer:
      "Critical issues get a response within the hour. Our managed IT clients have direct access to our helpdesk with guaranteed SLAs — no ticket queues, no runaround.",
  },
  {
    question: "Do you work with small businesses?",
    answer:
      "Yes. Most of our clients are 5–50 person companies that need enterprise-level protection without an enterprise IT budget. We scale our services to fit.",
  },
  {
    question: "What does a cybersecurity assessment involve?",
    answer:
      "We audit your network, endpoints, user access controls, backup integrity, and software vulnerabilities. You get a plain-English report with a prioritized action plan — no upsell pressure.",
  },
  {
    question: "Can you take over from our current IT provider?",
    answer:
      "Yes — we handle the transition. We document your environment, migrate monitoring and management tools, and coordinate the handoff so there's no gap in coverage.",
  },
] as const;
