import type { APIContext } from 'astro';
import { getCompanyConfig } from '../../../../lib/companyConfig';
import {
  clearStoredCompanyIcon,
  setStoredCompanyConfig,
  setStoredCompanyIcon,
} from '../../../../lib/companyConfigStore';
import { syncCalcomIdentityFromReave } from '../../../../lib/calcomIdentitySync';
import { parseCompanyBrandUpload } from '../../../../lib/companyLogo';
import { requireDashboardUser } from '../../../../lib/dashboardAuth';
import { jsonResponse } from '../../../../lib/apiResponse';

export const prerender = false;


export async function POST(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  const { userId } = auth;

  let form: FormData;
  try {
    form = await context.request.formData();
  } catch {
    return jsonResponse({ error: 'Expected multipart form data' }, 400);
  }

  const file = form.get('icon');
  if (!(file instanceof File) || !file.size) {
    return jsonResponse({ error: 'Missing icon file' }, 400);
  }

  const parsed = await parseCompanyBrandUpload(file);
  if (!parsed.ok) return jsonResponse({ error: parsed.error }, 400);

  const ok =
    parsed.kind === 'svg'
      ? await setStoredCompanyConfig({
          iconSvg: parsed.svg,
          iconData: null,
          iconMediaType: null,
          iconPath: null,
        })
      : await setStoredCompanyIcon({
          dataBase64: parsed.dataBase64,
          mediaType: parsed.mediaType,
        });
  if (!ok) return jsonResponse({ error: 'Failed to save icon' }, 500);

  void syncCalcomIdentityFromReave({ force: true, request: context.request }).catch(() => undefined);
  const company = await getCompanyConfig(context.request);
  return jsonResponse({ ok: true, company });
}

export async function DELETE(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  const { userId } = auth;

  const ok = await clearStoredCompanyIcon();
  if (!ok) return jsonResponse({ error: 'Failed to remove icon' }, 500);

  void syncCalcomIdentityFromReave({ force: true, request: context.request }).catch(() => undefined);
  const company = await getCompanyConfig(context.request);
  return jsonResponse({ ok: true, company });
}
