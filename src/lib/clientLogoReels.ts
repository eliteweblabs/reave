/**
 * Deal the about/home client-logo wall so the visible row never repeats a mark.
 *
 * A shared stride (15 logos, step 3) reused three residue classes across eight
 * columns, so Red Bull / Johnnie Walker / Mohegan Sun could sit on screen twice.
 * Each logo is assigned to exactly one column; leftovers stack in that reel.
 */

export const CLIENT_LOGO_COLS = 8;

export function dealClientLogoReels<T extends { name: string }>(
  items: T[],
  cols = CLIENT_LOGO_COLS,
): T[][] {
  const unique: T[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const key = item.name.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }
  if (unique.length === 0) return [];

  const columnCount = Math.min(cols, unique.length);
  const reels: T[][] = Array.from({ length: columnCount }, () => []);
  unique.forEach((logo, i) => {
    reels[i % columnCount].push(logo);
  });
  return reels;
}

/** True when no name appears in more than one reel (so it cannot double on screen). */
export function clientLogoReelsAreDisjoint<T extends { name: string }>(reels: T[][]): boolean {
  const seen = new Set<string>();
  for (const reel of reels) {
    for (const logo of reel) {
      const key = logo.name.trim().toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
    }
  }
  return true;
}
