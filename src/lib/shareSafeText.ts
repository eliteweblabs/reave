/**
 * Fold stylized brand glyphs so titles stay readable in iMessage / Slack /
 * mail clients that lack the wordmark font. Greek lambda (Λ) is the "A" in
 * reΛVe.app — without this, link previews render as `re/\Ve.app`.
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
  return folded.replace(/\breave(?:\.app)?(?!\w)/gi, 'reave.app');
}
