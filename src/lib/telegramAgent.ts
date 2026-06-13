import { listKnowledgeSlugs, readKnowledgeMarkdown, summarizeKnowledgeIndex } from './localKnowledge';
import { isContactApiConfigured, resolveContact, formatResolveForTelegram } from './contactApi';
import {
  isCraterConfigured,
  craterCreateInvoice,
  craterSearchCustomers,
  craterListInvoices,
} from './craterClient';
import { serverEnv } from './serverEnv';

type ChatMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content?: string; tool_calls?: ToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };

type ToolCall = {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
};

function buildTools(): Array<{
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}> {
  const base: Array<{
    type: 'function';
    function: { name: string; description: string; parameters: Record<string, unknown> };
  }> = [
    {
      type: 'function' as const,
      function: {
        name: 'list_knowledge',
        description: 'List bundled knowledge markdown slugs with one-line previews.',
        parameters: { type: 'object', properties: {}, additionalProperties: false },
      },
    },
    {
      type: 'function' as const,
      function: {
        name: 'read_knowledge',
        description: 'Read full bundled markdown for a slug (filename without .md).',
        parameters: {
          type: 'object',
          properties: { slug: { type: 'string' } },
          required: ['slug'],
          additionalProperties: false,
        },
      },
    },
  ];
  if (isContactApiConfigured()) {
    base.push({
      type: 'function' as const,
      function: {
        name: 'resolve_contact',
        description:
          'Fuzzy-match a client/person against the master contact-api (names, typos, aliases). Use when the user mentions a client name or asks who someone is.',
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Full or partial name to match' },
            email: { type: 'string' },
            phone: { type: 'string' },
          },
          additionalProperties: false,
        },
      },
    });
  }
  if (isCraterConfigured()) {
    base.push(
      {
        type: 'function' as const,
        function: {
          name: 'create_invoice',
          description:
            'Create an invoice in Crater for a customer. Crater finds or creates the customer by name. Prices are in whole dollars. Defaults to a DRAFT invoice unless status is given.',
          parameters: {
            type: 'object',
            properties: {
              customer_name: { type: 'string', description: 'Customer/client name' },
              customer_email: { type: 'string', description: 'Optional email for a new customer' },
              items: {
                type: 'array',
                description: 'Line items. For a simple "$X for <desc>" request, use one item with quantity 1.',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string', description: 'Line item name (e.g. "Web development")' },
                    description: { type: 'string' },
                    quantity: { type: 'number', description: 'Defaults to 1 if omitted' },
                    price: { type: 'number', description: 'Unit price in whole dollars' },
                  },
                  required: ['name', 'price'],
                  additionalProperties: false,
                },
              },
              notes: { type: 'string' },
              status: {
                type: 'string',
                enum: ['DRAFT', 'SENT', 'VIEWED', 'OVERDUE', 'COMPLETED'],
                description: 'Defaults to DRAFT. Only set SENT if the user says it was sent.',
              },
            },
            required: ['customer_name', 'items'],
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function' as const,
        function: {
          name: 'search_customers',
          description: 'Search Crater customers by name/email/phone. Use to confirm a customer exists or disambiguate before invoicing.',
          parameters: {
            type: 'object',
            properties: { q: { type: 'string', description: 'Search text (optional; empty lists all)' } },
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function' as const,
        function: {
          name: 'list_recent_invoices',
          description: 'List recent invoices from Crater with status, totals, and links.',
          parameters: { type: 'object', properties: {}, additionalProperties: false },
        },
      }
    );
  }
  return base;
}

async function runTool(name: string, argsJson: string): Promise<string> {
  try {
    if (name === 'list_knowledge') {
      return JSON.stringify({ files: summarizeKnowledgeIndex() });
    }
    if (name === 'read_knowledge') {
      const args = JSON.parse(argsJson) as { slug?: string };
      const slug = (args.slug ?? '').trim();
      if (!slug) return JSON.stringify({ error: 'missing slug' });
      const doc = readKnowledgeMarkdown(slug);
      if (!doc) return JSON.stringify({ error: 'unknown slug', known: listKnowledgeSlugs() });
      const cap = 14_000;
      const content = doc.content.length > cap ? `${doc.content.slice(0, cap)}\n\n…(truncated)` : doc.content;
      return JSON.stringify({ slug: doc.slug, content });
    }
    if (name === 'resolve_contact') {
      const args = JSON.parse(argsJson) as { name?: string; email?: string; phone?: string };
      const result = await resolveContact({
        name: args.name,
        email: args.email,
        phone: args.phone,
      });
      if (!result.ok) {
        return JSON.stringify({
          error: result.error,
          status: result.status,
        });
      }
      return JSON.stringify(result.data);
    }
    if (name === 'create_invoice') {
      const args = JSON.parse(argsJson) as {
        customer_name?: string;
        customer_email?: string;
        items?: Array<{ name?: string; description?: string; quantity?: number; price?: number }>;
        notes?: string;
        status?: 'DRAFT' | 'SENT' | 'VIEWED' | 'OVERDUE' | 'COMPLETED';
      };
      const items = (args.items ?? [])
        .filter((i) => i && typeof i.price === 'number')
        .map((i) => ({
          name: (i.name ?? 'Service').trim() || 'Service',
          description: i.description,
          quantity: typeof i.quantity === 'number' && i.quantity > 0 ? i.quantity : 1,
          price: i.price as number,
        }));
      if (!args.customer_name?.trim()) return JSON.stringify({ error: 'customer_name is required' });
      if (!items.length) return JSON.stringify({ error: 'at least one item with a price is required' });
      const result = await craterCreateInvoice({
        customerName: args.customer_name,
        customerEmail: args.customer_email,
        items,
        notes: args.notes,
        status: args.status,
      });
      if (!result.ok) return JSON.stringify({ error: result.error, status: result.status });
      return JSON.stringify(result.data);
    }
    if (name === 'search_customers') {
      const args = JSON.parse(argsJson) as { q?: string };
      const result = await craterSearchCustomers(args.q ?? '');
      if (!result.ok) return JSON.stringify({ error: result.error, status: result.status });
      const customers = result.data.customers?.slice(0, 25) ?? [];
      return JSON.stringify({ count: result.data.count, customers });
    }
    if (name === 'list_recent_invoices') {
      const result = await craterListInvoices();
      if (!result.ok) return JSON.stringify({ error: result.error, status: result.status });
      const invoices = result.data.invoices?.slice(0, 20) ?? [];
      return JSON.stringify({ count: result.data.count, invoices });
    }
    return JSON.stringify({ error: `unknown tool ${name}` });
  } catch (e) {
    return JSON.stringify({ error: e instanceof Error ? e.message : String(e) });
  }
}

/**
 * Minimal agent loop: model may call list_knowledge / read_knowledge / resolve_contact, we execute and continue.
 */
export async function runTelegramKnowledgeAgent(userText: string): Promise<string> {
  const apiKey = serverEnv('OPENAI_API_KEY');
  if (!apiKey) {
    return 'LLM is not configured. Set OPENAI_API_KEY, or use /list, /get, /resolve.';
  }

  const model = serverEnv('OPENAI_MODEL')?.trim() || 'gpt-4o-mini';
  const tools = buildTools();

  const sysParts = [
    'You are a concise assistant for a solo developer business OS.',
    'Ground answers in tools: call list_knowledge if you need playbooks; call resolve_contact when the user mentions a client/person name or asks who they are (typos, nicknames).',
    'After tools, answer in plain text for Telegram (short paragraphs, avoid huge markdown tables).',
  ];
  if (isCraterConfigured()) {
    sysParts.push(
      'Billing: use create_invoice to make invoices in Crater. Treat amounts as whole US dollars. For "invoice <name> for $X" with no line detail, create one line item named "Services rendered" with quantity 1 and price X. Invoices default to DRAFT; do not mark SENT unless the user says it was sent. After creating, report the invoice number, amount, and the public link returned by the tool.'
    );
  } else {
    sysParts.push('Note: invoicing tools are unavailable (CRATER_API_BASE_URL / CRATER_API_TOKEN not set).');
  }
  if (!isContactApiConfigured()) {
    sysParts.push('Note: resolve_contact is unavailable (CONTACT_API_BASE_URL not set).');
  }

  const messages: ChatMessage[] = [
    { role: 'system', content: sysParts.join('\n') },
    { role: 'user', content: userText },
  ];

  const maxRounds = 5;

  for (let round = 0; round < maxRounds; round++) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        tools,
        tool_choice: 'auto',
        temperature: 0.3,
      }),
    });

    if (!res.ok) {
      const t = await res.text().catch(() => '');
      return `OpenAI error (${res.status}): ${t.slice(0, 500)}`;
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { role?: string; content?: string | null; tool_calls?: ToolCall[] } }>;
    };

    const msg = data.choices?.[0]?.message;
    if (!msg) return 'OpenAI returned no message.';

    const toolCalls = msg.tool_calls;
    if (toolCalls?.length) {
      messages.push({ role: 'assistant', tool_calls: toolCalls });
      for (const tc of toolCalls) {
        const name = tc.function.name;
        const out = await runTool(name, tc.function.arguments || '{}');
        messages.push({ role: 'tool', tool_call_id: tc.id, content: out });
      }
      continue;
    }

    const text = (msg.content ?? '').trim();
    return text || '(no text)';
  }

  return 'Stopped after max tool rounds. Try a narrower question.';
}
