import type { APIContext } from 'astro';
import { json } from '../../../../lib/apiJson';
import { getCompanyConfig } from '../../../../lib/companyConfig';
import {
  clearStoredCompanyIcon,
  setStoredCompanyIcon,
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

  const file = form.get('icon');
  if (!(file instanceof File) || !file.size) {
    return json({ error: 'Missing icon file' }, 400);
  }

  const mediaType = inferLogoUploadMediaType(file);
  if (!mediaType) {
    return json({ error: 'Icon must be PNG, JPEG, or WebP' }, 400);
  }
  if (file.size > LOGO_UPLOAD_MAX_BYTES) {
    return json({ error: 'Icon too large (max 2 MB)' }, 400);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const ok = await setStoredCompanyIcon({
    dataBase64: buffer.toString('base64'),
    mediaType,
  });
  if (!ok) return json({ error: 'Failed to save icon' }, 500);

  const company = await getCompanyConfig(context.request);
  return json({ ok: true, company });
}

export async function DELETE(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  const { userId } = auth;

  const ok = await clearStoredCompanyIcon();
  if (!ok) return json({ error: 'Failed to remove icon' }, 500);

  const company = await getCompanyConfig(context.request);
  return json({ ok: true, company });
}
