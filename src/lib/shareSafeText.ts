/**
 * Fold stylized / non-ASCII glyphs so titles stay readable in iMessage / Slack /
 * mail clients. Legacy brand spellings used Greek lambda (Λ) for the "A"
 * (e.g. reΛVe.app) — without folding, link previews render as `re/\Ve.app`.
 * Canonical public brand is plain `rekko.studio` (legacy reave.app folds here for previews).
 */
export function shareSafeText(value: string): string {
  const folded = String(value ?? '')
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
