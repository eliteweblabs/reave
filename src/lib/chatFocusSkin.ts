import { getInstallConfigSync } from './installConfig.ts';

/** Whether the alternate `/focus` chat skin is enabled for this install. */
export function isChatFocusSkinEnabled(): boolean {
  return getInstallConfigSync().chatFocusSkin === true;
}
