import type { APIContext } from 'astro';
import {
  getCompanyConfig,
  normalizeCompanyInput,
  type CompanyConfigInput,
} from '../../../lib/companyConfig';
import { setStoredCompanyConfig } from '../../../lib/companyConfigStore';

export const prerender = false;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function GET(context: APIContext): Promise<Response> {
  const { userId } = context.locals.auth();
  if (!userId) return json({ error: 'Unauthorized' }, 401);

  const company = await getCompanyConfig(context.request);
  return json({ ok: true, company });
}

export async function POST(context: APIContext): Promise<Response> {
  const { userId } = context.locals.auth();
  if (!userId) return json({ error: 'Unauthorized' }, 401);

  let body: CompanyConfigInput;
  try {
    body = await context.request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const stored = normalizeCompanyInput(body);
  const ok = await setStoredCompanyConfig(stored);
  if (!ok) return json({ error: 'Failed to save company details' }, 500);

  const company = await getCompanyConfig(context.request);
  return json({ ok: true, company });
}
