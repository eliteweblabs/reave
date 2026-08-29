import type { APIContext } from 'astro';
import { getCompanyConfig } from '../../../../lib/companyConfig';
import {
  clearStoredCompanyOg,
  setStoredCompanyOg,
} from '../../../../lib/companyConfigStore';
import { parseCompanyOgUpload } from '../../../../lib/companyLogo';
import { requireDashboardUser } from '../../../../lib/dashboardAuth';
import { jsonResponse } from '../../../../lib/apiResponse';

export const prerender = false;


export async function POST(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  let form: FormData;
  try {
    form = await context.request.formData();
  } catch {
    return jsonResponse({ error: 'Expected multipart form data' }, 400);
  }

  const file = form.get('og');
  if (!(file instanceof File) || !file.size) {
    return jsonResponse({ error: 'Missing share image file' }, 400);
  }

  const parsed = await parseCompanyOgUpload(file);
  if (!parsed.ok) return jsonResponse({ error: parsed.error }, 400);
  if (parsed.kind !== 'raster') {
    return jsonResponse({ error: 'Share image must be PNG, JPEG, or WebP (1200×630 recommended).' }, 400);
  }

  const ok = await setStoredCompanyOg({
    dataBase64: parsed.dataBase64,
    mediaType: parsed.mediaType,
  });
  if (!ok) return jsonResponse({ error: 'Failed to save share image' }, 500);

  const company = await getCompanyConfig(context.request);
  return jsonResponse({ ok: true, company });
}

export async function DELETE(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  const ok = await clearStoredCompanyOg();
  if (!ok) return jsonResponse({ error: 'Failed to remove share image' }, 500);

  const company = await getCompanyConfig(context.request);
  return jsonResponse({ ok: true, company });
}
