import { dscrCalculatorAgentTools } from './agentTools';
import type { ReavePlugin } from '../_shared/types';

/** Lender-grade DSCR calculator — admin panel, public /dscr, agent tool. */
export const dscrCalculatorPlugin: ReavePlugin = {
  id: 'dscr-calculator',
  feature: 'dscr_calculator',
  agentTools: dscrCalculatorAgentTools,
};
