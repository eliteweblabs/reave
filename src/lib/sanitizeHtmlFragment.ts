/**
 * Sanitize admin-authored HTML fragments (email signatures, rich text snippets).
 * Reuses the inbound email sanitizer — same threat model (strip scripts/handlers).
 */
import { sanitizeEmailHtml } from './sanitizeEmailHtml';

export function sanitizeHtmlFragment(html: string): string {
  return sanitizeEmailHtml(html);
}
