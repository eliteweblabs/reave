/**
 * Crater payment-mode seeding — registered as a CORE agent module when CRATER_* env is set
 * (see src/lib/agentTools/core/craterPaymentModes.ts) so chat always gets these tools when
 * Crater is wired, independent of billing plugin load order.
 */
import {
  craterCreatePaymentMode,
  craterSeedPaymentModes,
} from '../../src/lib/craterClient';
import type { AgentToolDef, ToolContext, ToolHandler } from '../../src/lib/agentTools/types';

export const craterPaymentModeToolDefinitions = (_ctx: ToolContext): AgentToolDef[] => [
  {
    type: 'function',
    function: {
      name: 'seed_payment_modes',
      description:
        'Seed Crater Settings → Payment Modes so record_payment can resolve payment_mode. Call when the user says "add payment modes" or asks to set up billing payment methods. Idempotent: already_exists counts as success. Default list: Cash, Check, Credit Card, Bank Transfer, Apple Pay, Venmo, Zelle, Stripe, Cash App.',
      parameters: {
        type: 'object',
        properties: {
          names: {
            type: 'array',
            items: { type: 'string' },
            description: 'Optional override list of payment mode display names; omit to use the default nine.',
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_payment_mode',
      description:
        'Add a single payment mode name in Crater (Settings → Payment Modes). Use seed_payment_modes for the full default set.',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Display name, e.g. Venmo, Zelle, Cash App — must match record_payment payment_mode.',
          },
        },
        required: ['name'],
        additionalProperties: false,
      },
    },
  },
];

async function handle_seed_payment_modes(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  let names: string[] | undefined;
  if (Array.isArray(args.names)) {
    names = args.names.map((n) => String(n ?? '').trim()).filter(Boolean);
    if (!names.length) return JSON.stringify({ error: 'names must be a non-empty array of strings' });
  }
  const result = await craterSeedPaymentModes(names);
  if (!result.ok) return JSON.stringify({ error: result.error, status: result.status });
  return JSON.stringify(result.data);
}

async function handle_create_payment_mode(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const name = String(args.name ?? '').trim();
  if (!name) return JSON.stringify({ error: 'name is required' });
  const result = await craterCreatePaymentMode(name);
  if (!result.ok) return JSON.stringify({ error: result.error, status: result.status });
  return JSON.stringify(result.data);
}

export const craterPaymentModeToolHandlers: Record<string, ToolHandler> = {
  seed_payment_modes: handle_seed_payment_modes,
  create_payment_mode: handle_create_payment_mode,
};
