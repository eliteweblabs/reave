/** Geo landing pages for Dr. Paws Calls Google Ads — Western Mass & Connecticut. */

export type DrPawsAdsTown = {
  slug: string;
  name: string;
  state: "MA" | "CT";
  /** Short label for inline copy, e.g. "Longmeadow" or "Enfield, CT". */
  label: string;
};

export const DR_PAWS_ADS_TOWNS: DrPawsAdsTown[] = [
  { slug: "longmeadow", name: "Longmeadow", state: "MA", label: "Longmeadow" },
  { slug: "springfield", name: "Springfield", state: "MA", label: "Springfield" },
  { slug: "east-longmeadow", name: "East Longmeadow", state: "MA", label: "East Longmeadow" },
  { slug: "west-springfield", name: "West Springfield", state: "MA", label: "West Springfield" },
  { slug: "agawam", name: "Agawam", state: "MA", label: "Agawam" },
  { slug: "wilbraham", name: "Wilbraham", state: "MA", label: "Wilbraham" },
  { slug: "hampden", name: "Hampden", state: "MA", label: "Hampden" },
  { slug: "chicopee", name: "Chicopee", state: "MA", label: "Chicopee" },
  { slug: "holyoke", name: "Holyoke", state: "MA", label: "Holyoke" },
  { slug: "enfield", name: "Enfield", state: "CT", label: "Enfield, CT" },
  { slug: "somers", name: "Somers", state: "CT", label: "Somers, CT" },
];

const townBySlug = new Map(DR_PAWS_ADS_TOWNS.map((town) => [town.slug, town]));

export function getDrPawsAdsTown(slug: string | undefined): DrPawsAdsTown | undefined {
  const key = (slug ?? "").trim().toLowerCase();
  return key ? townBySlug.get(key) : undefined;
}

export function drPawsAdsTownPath(slug: string): string {
  return `/vet/${slug}`;
}

export function drPawsAdsPageTitle(town: DrPawsAdsTown): string {
  return `${town.name} Veterinary House Calls | Dr. Paws Calls`;
}

export function drPawsAdsMetaDescription(town: DrPawsAdsTown): string {
  return `House call veterinarian serving ${town.label}. Same-day & next-day in-home exams for stressed or vet-phobic pets. Book Dr. Paws Calls in 30 seconds.`;
}

export const DR_PAWS_ADS_SITE_KEY = "drpawscalls";
