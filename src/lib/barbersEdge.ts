/** Barber's Edge proposal site — shop copy and staff used on /barbers pages. */

export const BARBERS_EDGE = {
  name: "Barber's Edge",
  phone: "(978) 720-8194",
  phoneHref: "tel:+19787208194",
  bookHref: "https://www.thebarbersedge.com/",
  address: "324 Rantoul St, Beverly, MA 01915",
  email: "barbersedge350@gmail.com",
  /** Shop hours from thebarbersedge.com — used in the mocked staff intro. */
  availableFrom: "Tuesday–Saturday, 9am–6pm",
} as const;

export type BarbersEdgeBarber = {
  slug: string;
  firstName: string;
  name: string;
  role: string;
  tagline: string;
  photo?: string;
  photoAlt: string;
  availableFrom?: string;
};

export const BARBERS_EDGE_BARBERS: BarbersEdgeBarber[] = [
  {
    slug: "horell-cruz",
    firstName: "Horell",
    name: "Horell Cruz",
    role: "Owner / Master Barber",
    tagline: "Old-world ritual, modern fade",
    photo: "/api/media/barbers-horell-cruz",
    photoAlt: "Horell Cruz, owner and master barber at Barber's Edge",
  },
  {
    slug: "audriana-cruz",
    firstName: "Audriana",
    name: "Audriana Cruz",
    role: "Assistant",
    tagline: "The chair is ready when you are",
    photo: "/api/media/barbers-audriana-cruz",
    photoAlt: "Audriana Cruz, assistant at Barber's Edge",
  },
  {
    slug: "abraham",
    firstName: "Abraham",
    name: "Abraham",
    role: "Barber",
    tagline: "Clean lines, easy conversation",
    photoAlt: "Abraham, barber at Barber's Edge",
  },
  {
    slug: "henry",
    firstName: "Henry",
    name: "Henry",
    role: "Barber",
    tagline: "Classic cut, no rush",
    photoAlt: "Henry, barber at Barber's Edge",
  },
  {
    slug: "tj",
    firstName: "TJ",
    name: "TJ",
    role: "Barber",
    tagline: "Fades that hold up all week",
    photoAlt: "TJ, barber at Barber's Edge",
  },
  {
    slug: "jc",
    firstName: "JC",
    name: "JC",
    role: "Barber",
    tagline: "Sharp from the first pass",
    photoAlt: "JC, barber at Barber's Edge",
  },
  {
    slug: "christian",
    firstName: "Christian",
    name: "Christian",
    role: "Barber",
    tagline: "Detail in every outline",
    photoAlt: "Christian, barber at Barber's Edge",
  },
  {
    slug: "maddy",
    firstName: "Maddy",
    name: "Maddy",
    role: "Barber",
    tagline: "Walk in looking like yourself, leave looking sharper",
    photoAlt: "Maddy, barber at Barber's Edge",
  },
];

export function getBarbersEdgeBarber(slug: string): BarbersEdgeBarber | undefined {
  return BARBERS_EDGE_BARBERS.find((barber) => barber.slug === slug);
}

export function barbersEdgeGreeting(barber: BarbersEdgeBarber): string {
  const hours = barber.availableFrom ?? BARBERS_EDGE.availableFrom;
  return `What's up, my name is ${barber.firstName}. I'm available from ${hours}.`;
}
