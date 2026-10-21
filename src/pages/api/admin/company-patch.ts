import type { APIContext } from 'astro';
import { setStoredCompanyConfig, type StoredCompanyConfig } from '../../../lib/companyConfigStore';
import { serverEnv } from '../../../lib/serverEnv';
import { jsonResponse } from '../../../lib/apiResponse';

export const prerender = false;

/**
 * PATCH /api/admin/company-patch
 * 
 * Lightweight internal admin endpoint for patching single company fields.
 * Accepts Bearer token (SIRI_API_KEY or ADMIN_API_KEY) for authentication.
 * 
 * Allows tools and Siri Shortcuts to update company_config fields without
 * requiring a full session or dashboard user cookie.
 * 
 * Example:
 *   PATCH /api/admin/company-patch
 *   Authorization: Bearer <SIRI_API_KEY>
 *   Content-Type: application/json
 *   
 *   { "supportPhone": "+1 (508) 887-0344" }
 */
export async function PATCH(context: APIContext): Promise<Response> {
  // Check bearer token
  const authHeader = context.request.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  
  const siriApiKey = serverEnv('SIRI_API_KEY')?.trim();
  const adminApiKey = serverEnv('ADMIN_API_KEY')?.trim();
  
  if (!token || (!siriApiKey && !adminApiKey)) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }
  
  const isAuthorized = (siriApiKey && token === siriApiKey) || (adminApiKey && token === adminApiKey);
  if (!isAuthorized) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  // Parse request body
  let body: Partial<StoredCompanyConfig>;
  try {
    body = await context.request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400);
  }

  if (!body || typeof body !== 'object') {
    return jsonResponse({ error: 'Request body must be a JSON object' }, 400);
  }

  // Whitelist patchable fields (prevent accidental overwrites)
  const patchableFields = [
    'name',
    'legalName',
    'description',
    'supportEmail',
    'supportPhone',
    'fromEmail',
    'address',
    'socialTwitter',
    'socialInstagram',
    'socialLinkedin',
    'socialFacebook',
    'socialYoutube',
    'socialTiktok',
    'socialBluesky',
    'socialThreads',
    'socialYelp',
    'socialGoogleBusiness',
  ];

  const patch: Partial<StoredCompanyConfig> = {};
  for (const key of patchableFields) {
    if (key in body) {
      const value = body[key as keyof StoredCompanyConfig];
      // Allow null to clear a field, string to set it
      if (value === null || typeof value === 'string') {
        patch[key as keyof StoredCompanyConfig] = value as never;
      }
    }
  }

  if (Object.keys(patch).length === 0) {
    return jsonResponse({ error: 'No valid fields to patch' }, 400);
  }

  // Apply patch
  try {
    const ok = await setStoredCompanyConfig(patch);
    if (!ok) {
      return jsonResponse({ error: 'Failed to save company settings' }, 500);
    }
    return jsonResponse({ ok: true, patched: Object.keys(patch) });
  } catch (e) {
    console.error('[company-patch] error', e);
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
}
