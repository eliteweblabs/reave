import {
  dealershipBookTestDrive,
  dealershipCreateLead,
  dealershipGetDeal,
  dealershipSearchVehicles,
  isPaulinoWizardConfigured,
} from '../../src/lib/paulinoWizardClient';
import { hasFeature } from '../../src/lib/features';
import type { AgentToolDef, AgentToolModule, ToolContext } from '../../src/lib/agentTools/types';

async function handle_search_dealership_inventory(
  args: Record<string, unknown>,
  _ctx: ToolContext,
): Promise<string> {
  if (!hasFeature('dealership_wizard')) {
    return JSON.stringify({ error: 'dealership_wizard not enabled in install config features' });
  }
  if (!isPaulinoWizardConfigured()) {
    return JSON.stringify({ error: 'PAULINO_WIZARD_API_BASE_URL is not configured' });
  }
  const result = await dealershipSearchVehicles({
    search: args.search != null ? String(args.search) : undefined,
    make: args.make != null ? String(args.make) : undefined,
    max_price: args.max_price != null ? Number(args.max_price) : undefined,
    condition: args.condition != null ? String(args.condition) : undefined,
    limit: args.limit != null ? Number(args.limit) : 10,
  });
  if (!result.ok) return JSON.stringify({ error: result.error });
  return JSON.stringify({ ok: true, count: result.data.vehicles.length, vehicles: result.data.vehicles });
}

async function handle_create_dealership_lead(
  args: Record<string, unknown>,
  _ctx: ToolContext,
): Promise<string> {
  if (!hasFeature('dealership_wizard')) {
    return JSON.stringify({ error: 'dealership_wizard not enabled in install config features' });
  }
  if (!isPaulinoWizardConfigured()) {
    return JSON.stringify({ error: 'PAULINO_WIZARD_API_BASE_URL is not configured' });
  }
  const name = String(args.name ?? '').trim();
  const phone = String(args.phone ?? '').trim();
  if (!name || !phone) return JSON.stringify({ error: 'name and phone are required' });
  const result = await dealershipCreateLead({
    name,
    phone,
    email: args.email != null ? String(args.email).trim() : undefined,
    vehicle_id: args.vehicle_id != null ? Number(args.vehicle_id) : undefined,
  });
  if (!result.ok) return JSON.stringify({ error: result.error });
  return JSON.stringify({
    ok: true,
    token: result.data.token,
    magicLink: result.data.magicLink,
    lead: result.data.lead,
  });
}

async function handle_get_dealership_deal(
  args: Record<string, unknown>,
  _ctx: ToolContext,
): Promise<string> {
  if (!hasFeature('dealership_wizard')) {
    return JSON.stringify({ error: 'dealership_wizard not enabled in install config features' });
  }
  if (!isPaulinoWizardConfigured()) {
    return JSON.stringify({ error: 'PAULINO_WIZARD_API_BASE_URL is not configured' });
  }
  const token = String(args.token ?? '').trim();
  if (!token) return JSON.stringify({ error: 'token is required' });
  const result = await dealershipGetDeal(token);
  if (!result.ok) return JSON.stringify({ error: result.error });
  return JSON.stringify({ ok: true, deal: result.data });
}

async function handle_book_dealership_test_drive(
  args: Record<string, unknown>,
  _ctx: ToolContext,
): Promise<string> {
  if (!hasFeature('dealership_wizard')) {
    return JSON.stringify({ error: 'dealership_wizard not enabled in install config features' });
  }
  if (!isPaulinoWizardConfigured()) {
    return JSON.stringify({ error: 'PAULINO_WIZARD_API_BASE_URL is not configured' });
  }
  const leadToken = String(args.leadToken ?? args.lead_token ?? '').trim();
  const name = String(args.name ?? '').trim();
  const phone = String(args.phone ?? '').trim();
  if (!leadToken) return JSON.stringify({ error: 'leadToken is required (from create_dealership_lead)' });
  if (!name || !phone) return JSON.stringify({ error: 'name and phone are required' });
  const result = await dealershipBookTestDrive({
    leadToken,
    name,
    phone,
    email: args.email != null ? String(args.email).trim() : undefined,
    preferred_time: args.preferred_time != null ? String(args.preferred_time).trim() : undefined,
    start: args.start != null ? String(args.start).trim() : undefined,
    vehicleName: args.vehicleName != null ? String(args.vehicleName).trim() : undefined,
    notes: args.notes != null ? String(args.notes).trim() : undefined,
  });
  if (!result.ok) return JSON.stringify({ error: result.error });
  return JSON.stringify({ ok: true, message: 'Test drive request saved' });
}

export const paulinoWizardModule: AgentToolModule = {
  id: 'paulino-wizard',
  enabled: () => hasFeature('dealership_wizard') && isPaulinoWizardConfigured(),
  definitions(_ctx: ToolContext): AgentToolDef[] {
    return [
      {
        type: 'function',
        function: {
          name: 'search_dealership_inventory',
          description:
            'Search synced used/new vehicle inventory (Paulino Auto Group via paulino-wizard). Filter by make, max price, condition, or free-text search.',
          parameters: {
            type: 'object',
            properties: {
              search: { type: 'string', description: 'Free-text search (make, model, keywords)' },
              make: { type: 'string', description: 'Filter by make, e.g. Jeep, Subaru' },
              max_price: { type: 'number', description: 'Maximum price in USD' },
              condition: { type: 'string', enum: ['new', 'used'], description: 'Vehicle condition' },
              limit: { type: 'number', description: 'Max results (default 10)' },
            },
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'create_dealership_lead',
          description:
            'Start a dealership deal wizard for a shopper. Returns a magic link token the customer can open to pick a vehicle and complete the 6-step deal flow.',
          parameters: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Customer name' },
              phone: { type: 'string', description: 'Customer phone (SMS)' },
              email: { type: 'string', description: 'Optional email' },
              vehicle_id: { type: 'number', description: 'Optional inventory id to pre-select a vehicle' },
            },
            required: ['name', 'phone'],
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_dealership_deal',
          description: 'Fetch deal wizard state by lead token (from create_dealership_lead).',
          parameters: {
            type: 'object',
            properties: {
              token: { type: 'string', description: 'Deal token, e.g. QQKR9WRK' },
            },
            required: ['token'],
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'book_dealership_test_drive',
          description:
            'Save a test-drive request for an existing lead. Requires leadToken from create_dealership_lead plus preferred_time in plain language (e.g. "Saturday afternoon").',
          parameters: {
            type: 'object',
            properties: {
              leadToken: { type: 'string', description: 'Lead token from create_dealership_lead' },
              name: { type: 'string' },
              phone: { type: 'string' },
              email: { type: 'string' },
              preferred_time: {
                type: 'string',
                description: 'When they want to visit, in plain language or ISO datetime',
              },
              vehicleName: { type: 'string', description: 'Vehicle they want to test drive' },
              notes: { type: 'string' },
            },
            required: ['leadToken', 'name', 'phone', 'preferred_time'],
            additionalProperties: false,
          },
        },
      },
    ];
  },
  handlers: {
    search_dealership_inventory: handle_search_dealership_inventory,
    create_dealership_lead: handle_create_dealership_lead,
    get_dealership_deal: handle_get_dealership_deal,
    book_dealership_test_drive: handle_book_dealership_test_drive,
  },
};
