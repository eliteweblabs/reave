/**
 * GET /api/work-day/projects — list work projects for field picker
 */
import type { APIRoute } from 'astro';
import { jsonResponse } from '../../../lib/apiResponse';
import { requireWorkDayApi } from '../../../lib/workDayApiGate';
import { storeListWork } from '../../../lib/workStore';

export const prerender = false;

export const GET: APIRoute = async (context) => {
  const auth = await requireWorkDayApi(context);
  if (auth instanceof Response) return auth;

  const url = new URL(context.request.url);
  const contactUid = url.searchParams.get('contact')?.trim() || undefined;
  const q = url.searchParams.get('q')?.trim() || undefined;

  const jobs = await storeListWork({
    contact_uid: contactUid,
    status: 'active',
    q,
  });

  const projects = jobs.map((j) => ({
    slug: j.slug,
    title: j.title,
    contactUid: j.contact_uid,
    contactName: j.contact_name || j.client,
    siteAddress: j.site_address || '',
    siteLabel: j.site_label || '',
  }));

  return jsonResponse({ ok: true, projects });
};
