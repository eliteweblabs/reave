import type { APIContext } from 'astro';
import { json } from '../../../../lib/apiJson';
import { getCompanyConfig } from '../../../../lib/companyConfig';
import {
  clearStoredCompanyLogo,
  setStoredCompanyLogo,
} from '../../../../lib/companyConfigStore';
import { inferLogoUploadMediaType, LOGO_UPLOAD_MAX_BYTES } from '../../../../lib/companyLogo';
import { requireDashboardUser } from '../../../../lib/dashboardAuth';

export const prerender = false;

export async function POST(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  const { userId } = auth;

  let form: FormData;
  try {
    form = await context.request.formData();
  } catch {
    return json({ error: 'Expected multipart form data' }, 400);
  }

  const file = form.get('logo');
  if (!(file instanceof File) || !file.size) {
    return json({ error: 'Missing logo file' }, 400);
  }

  const mediaType = inferLogoUploadMediaType(file);
  if (!mediaType) {
    return json({ error: 'Logo must be PNG, JPEG, or WebP' }, 400);
  }
  if (file.size > LOGO_UPLOAD_MAX_BYTES) {
    return json({ error: 'Logo too large (max 2 MB)' }, 400);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const ok = await setStoredCompanyLogo({
    dataBase64: buffer.toString('base64'),
    mediaType,
  });
  if (!ok) return json({ error: 'Failed to save logo' }, 500);

  const company = await getCompanyConfig(context.request);
  return json({ ok: true, company });
}

export async function DELETE(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  const { userId } = auth;

  const ok = await clearStoredCompanyLogo();
  if (!ok) return json({ error: 'Failed to remove logo' }, 500);

  const company = await getCompanyConfig(context.request);
  return json({ ok: true, company });
}
