import type { CardDemoSite } from './cardDemoSites';

const KNOWN_CARD_DEMO_META: Record<string, Pick<CardDemoSite, 'emoji' | 'category'>> = {
  'karla cassidy designs': { emoji: '💐', category: 'Wedding Florist · Beverly, MA' },
  "standley bros": { emoji: '⚙️', category: 'Machine Shop · Beverly, MA' },
  'standley bros. machine co.': { emoji: '⚙️', category: 'Machine Shop · Beverly, MA' },
  'maddy the barber': { emoji: '💈', category: 'Barber · Beverly, MA' },
  'jc pena barber': { emoji: '🪒', category: 'Master Barber' },
  'jc pena': { emoji: '🪒', category: 'Master Barber' },
  "the barber's edge": { emoji: '✂️', category: 'Barbershop · Beverly, MA' },
  'lux cleaning': { emoji: '✨', category: 'Cleaning Service · Beverly, MA' },
  'kaykay cleaning company': { emoji: '✨', category: 'Cleaning · Beverly, MA' },
  'levines law': { emoji: '⚖️', category: 'Law · Beverly, MA' },
  levineslaw: { emoji: '⚖️', category: 'Law · Beverly, MA' },
  'life saving fire protection': { emoji: '🚒', category: 'Fire Protection' },
  'dr paws calls': { emoji: '🐾', category: 'Veterinary · Calls' },
  'pdx paws': { emoji: '🐾', category: 'Dog grooming · Portland' },
  'cala renee salon': { emoji: '💇', category: 'Salon' },
  'edwards electrical': { emoji: '⚡', category: 'Electrical' },
  'ece cheer site': { emoji: '📣', category: 'Cheer · Team site' },
  'resolve data': { emoji: '📊', category: 'Data & analytics' },
  'rothco built, llc': { emoji: '🏗️', category: 'General contractor' },
  "sam's catch basin": { emoji: '🚰', category: 'Drainage · Service' },
  'sams catch basin': { emoji: '🚰', category: 'Drainage · Service' },
  paradigm: { emoji: '🌿', category: 'Landscape design' },
  'pickled onion': { emoji: '🍽️', category: 'Restaurant' },
  'beverly depot': { emoji: '🏛️', category: 'Historic venue' },
  woocar: { emoji: '🚗', category: 'Automotive' },
  'stratus hub': { emoji: '☁️', category: 'Business hub' },
  'pat the plumber': { emoji: '🔧', category: 'Plumbing' },
  'christian gonzalez': { emoji: '💼', category: 'Professional services' },
};

const EMOJI_RULES: { test: RegExp; emoji: string; category: string }[] = [
  { test: /barber|barbershop|pena|whalley/i, emoji: '💈', category: 'Barber' },
  { test: /clean|lux|kaykay/i, emoji: '✨', category: 'Cleaning' },
  { test: /law|levine|esq/i, emoji: '⚖️', category: 'Law' },
  { test: /fire|protection/i, emoji: '🚒', category: 'Fire protection' },
  { test: /paws|vet|dr paw/i, emoji: '🐾', category: 'Pet care' },
  { test: /salon|hair|rene/i, emoji: '💇', category: 'Salon' },
  { test: /electrical|electric/i, emoji: '⚡', category: 'Electrical' },
  { test: /cheer/i, emoji: '📣', category: 'Cheer' },
  { test: /florist|karla|wedding|flower/i, emoji: '💐', category: 'Florist' },
  { test: /machine|standley|shop/i, emoji: '⚙️', category: 'Machine shop' },
  { test: /plumb/i, emoji: '🔧', category: 'Plumbing' },
  { test: /landscape|paradigm/i, emoji: '🌿', category: 'Landscape' },
  { test: /build|rothco|construction|contractor/i, emoji: '🏗️', category: 'Construction' },
  { test: /car|auto|woocar/i, emoji: '🚗', category: 'Automotive' },
  { test: /data|resolve/i, emoji: '📊', category: 'Data' },
  { test: /restaurant|onion|kitchen/i, emoji: '🍽️', category: 'Food & drink' },
  { test: /depot|venue/i, emoji: '🏛️', category: 'Venue' },
  { test: /catch basin|drain/i, emoji: '🚰', category: 'Drainage' },
];

function metaKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function emojiForCardDemoName(name: string): string {
  const known = KNOWN_CARD_DEMO_META[metaKey(name)];
  if (known) return known.emoji;
  for (const rule of EMOJI_RULES) {
    if (rule.test.test(name)) return rule.emoji;
  }
  return '🌐';
}

export function categoryForCardDemoName(name: string): string {
  const known = KNOWN_CARD_DEMO_META[metaKey(name)];
  if (known) return known.category;
  for (const rule of EMOJI_RULES) {
    if (rule.test.test(name)) return rule.category;
  }
  return 'Preview · Railway';
}

/** Restore industry emoji + friendlier category labels for Railway-scanned rows. */
export function decorateCardDemoSite(site: CardDemoSite): CardDemoSite {
  const key = metaKey(site.name);
  const known = KNOWN_CARD_DEMO_META[key];
  const genericCategory = !site.category.trim() || site.category === 'Preview · Railway';
  return {
    ...site,
    emoji: known?.emoji ?? (site.emoji === '🌐' ? emojiForCardDemoName(site.name) : site.emoji),
    category: known?.category ?? (genericCategory ? categoryForCardDemoName(site.name) : site.category),
  };
}
