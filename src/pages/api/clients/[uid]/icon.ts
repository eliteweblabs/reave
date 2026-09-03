import type { APIContext } from 'astro';
import {
  clientBrandingAssetDelete,
  clientBrandingAssetGet,
  clientBrandingAssetPost,
} from '../../../../lib/clientBrandingRoute';

export const prerender = false;

export async function GET(context: APIContext): Promise<Response> {
  return clientBrandingAssetGet(context, 'icon');
}

export async function POST(context: APIContext): Promise<Response> {
  return clientBrandingAssetPost(context, 'icon');
}

export async function DELETE(context: APIContext): Promise<Response> {
  return clientBrandingAssetDelete(context, 'icon');
}
