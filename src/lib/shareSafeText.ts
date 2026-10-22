/**
 * Fold stylized / non-ASCII glyphs so titles stay readable in iMessage / Slack /
 * mail clients. Public brand is rekko.studio — legacy reave.app / REΛVE spellings
 * and bracket-encoded wordmarks fold here for link previews.
 */
export function shareSafeText(value: string): string {
  const folded = String(value ?? '')
    .replace(/re\s*>\s*I\s*<\s*o(?:\s+studio)?/gi, 'rekko.studio')
    .replace(/[ΛɅ△∆∧⋀ꓮᐱ]/g, 'A')
    .replace(/λ/g, 'a')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return folded
    .replace(/\breave(?:\.app)?(?!\w)/gi, 'rekko.studio')
    .replace(/\brekko(?:\.studio)?(?!\w)/gi, 'rekko.studio');
}
