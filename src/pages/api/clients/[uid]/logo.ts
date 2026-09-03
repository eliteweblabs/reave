import type { APIContext } from 'astro';
import {
  clientBrandingAssetDelete,
  clientBrandingAssetGet,
  clientBrandingAssetPost,
} from '../../../../lib/clientBrandingRoute';

export const prerender = false;

export async function GET(context: APIContext): Promise<Response> {
  return clientBrandingAssetGet(context, 'logo');
}

export async function POST(context: APIContext): Promise<Response> {
  return clientBrandingAssetPost(context, 'logo');
}

export async function DELETE(context: APIContext): Promise<Response> {
  return clientBrandingAssetDelete(context, 'logo');
}
