import { isCanonicalReaveInstall } from './installConfig';
import { serverEnv } from './serverEnv';

/** Where this install’s Claude key came from. */
export type AnthropicKeySource = 'reave' | 'client' | 'none';

/**
 * Client installs without their own Anthropic key inherit the official
 * reave.app host key. Official reave.app never reports `reave` (it *is* the source).
 */
export function getAnthropicKeySource(): AnthropicKeySource {
  if (!serverEnv('ANTHROPIC_API_KEY')?.trim()) return 'none';
  if (isCanonicalReaveInstall()) return 'client';
  const raw = (serverEnv('ANTHROPIC_KEY_SOURCE') || '').trim().toLowerCase();
  if (raw === 'client' || raw === 'own') return 'client';
  return 'reave';
}
