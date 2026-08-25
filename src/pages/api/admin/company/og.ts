import type { APIContext } from 'astro';
import { getCompanyConfig } from '../../../../lib/companyConfig';
import {
  clearStoredCompanyOg,
  setStoredCompanyOg,
} from '../../../../lib/companyConfigStore';
import { parseCompanyOgUpload } from '../../../../lib/companyLogo';
import { requireDashboardUser } from '../../../../lib/dashboardAuth';

export const prerender = false;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function POST(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  let form: FormData;
  try {
    form = await context.request.formData();
  } catch {
    return json({ error: 'Expected multipart form data' }, 400);
  }

  const file = form.get('og');
  if (!(file instanceof File) || !file.size) {
    return json({ error: 'Missing share image file' }, 400);
  }

  const parsed = await parseCompanyOgUpload(file);
  if (!parsed.ok) return json({ error: parsed.error }, 400);
  if (parsed.kind !== 'raster') {
    return json({ error: 'Share image must be PNG, JPEG, or WebP (1200×630 recommended).' }, 400);
  }

  const ok = await setStoredCompanyOg({
    dataBase64: parsed.dataBase64,
    mediaType: parsed.mediaType,
  });
  if (!ok) return json({ error: 'Failed to save share image' }, 500);

  const company = await getCompanyConfig(context.request);
  return json({ ok: true, company });
}

export async function DELETE(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  const ok = await clearStoredCompanyOg();
  if (!ok) return json({ error: 'Failed to remove share image' }, 500);

  const company = await getCompanyConfig(context.request);
  return json({ ok: true, company });
}
