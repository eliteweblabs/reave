/**
 * Crater payment-mode tools — CORE module (always in manifest when CRATER_* env is set).
 */
import { isCraterConfigured } from '../../craterClient';
import {
  craterPaymentModeToolDefinitions,
  craterPaymentModeToolHandlers,
} from '../../../../plugins/billing/craterPaymentModeAgentTools';
import type { AgentToolModule, ToolContext } from '../types';

export const craterPaymentModesModule: AgentToolModule = {
  id: 'crater-payment-modes',
  enabled: () => isCraterConfigured(),
  definitions: (ctx: ToolContext) => craterPaymentModeToolDefinitions(ctx),
  handlers: craterPaymentModeToolHandlers,
};
