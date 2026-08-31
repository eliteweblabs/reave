import { isAnthropicLlmConfigured } from './anthropicEndpoint';
import { isCanonicalReaveInstall } from './installConfig';
import { serverEnv } from './serverEnv';

/** Where this install’s Claude key came from. */
export type AnthropicKeySource = 'reave' | 'client' | 'none';

/**
 * Client installs without their own Anthropic key inherit the official
 * reave.app host key. Official reave.app never reports `reave` (it *is* the source).
 */
export function getAnthropicKeySource(): AnthropicKeySource {
  if (!isAnthropicLlmConfigured()) return 'none';
  if (serverEnv('OPENROUTER_API_KEY')?.trim()) return 'client';
  if (isCanonicalReaveInstall()) return 'client';
  const raw = (serverEnv('ANTHROPIC_KEY_SOURCE') || '').trim().toLowerCase();
  if (raw === 'client' || raw === 'own') return 'client';
  return 'reave';
}
