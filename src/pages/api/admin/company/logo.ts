import type { APIContext } from 'astro';
import { getCompanyConfig } from '../../../../lib/companyConfig';
import {
  clearStoredCompanyLogo,
  setStoredCompanyLogo,
} from '../../../../lib/companyConfigStore';
import { isLogoUploadMediaType, LOGO_UPLOAD_MAX_BYTES } from '../../../../lib/companyLogo';

export const prerender = false;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function POST(context: APIContext): Promise<Response> {
  const { userId } = context.locals.auth();
  if (!userId) return json({ error: 'Unauthorized' }, 401);

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

  const mediaType = file.type.trim().toLowerCase();
  if (!isLogoUploadMediaType(mediaType)) {
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
  const { userId } = context.locals.auth();
  if (!userId) return json({ error: 'Unauthorized' }, 401);

  const ok = await clearStoredCompanyLogo();
  if (!ok) return json({ error: 'Failed to remove logo' }, 500);

  const company = await getCompanyConfig(context.request);
  return json({ ok: true, company });
}
