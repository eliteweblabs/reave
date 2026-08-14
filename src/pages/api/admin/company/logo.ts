import type { APIContext } from 'astro';
import { getCompanyConfig } from '../../../../lib/companyConfig';
import {
  clearStoredCompanyLogo,
  setStoredCompanyConfig,
  setStoredCompanyLogo,
} from '../../../../lib/companyConfigStore';
import { parseCompanyBrandUpload } from '../../../../lib/companyLogo';
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

  const parsed = await parseCompanyBrandUpload(file);
  if (!parsed.ok) return json({ error: parsed.error }, 400);

  const ok =
    parsed.kind === 'svg'
      ? await setStoredCompanyConfig({
          logoSvg: parsed.svg,
          logoData: null,
          logoMediaType: null,
          logoPath: null,
        })
      : await setStoredCompanyLogo({
          dataBase64: parsed.dataBase64,
          mediaType: parsed.mediaType,
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
