import type { ReavePlugin } from '../_shared/types';
import { serverEnv } from '../../src/lib/serverEnv';

/** Apple Siri Shortcuts → POST /api/siri. */
export const siriPlugin: ReavePlugin = {
  id: 'siri',
  feature: 'siri',
  configured: () => Boolean(serverEnv('SIRI_API_KEY')?.trim()),
};
