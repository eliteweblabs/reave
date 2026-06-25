import type { APIRoute } from 'astro';
import { requireCardDavAuth } from './auth';
import { handleCardDav } from './server';

export const dispatchCardDav: APIRoute = async (context) => {
  const auth = requireCardDavAuth(context.request);
  if (auth instanceof Response) return auth;

  const raw = context.params.path;
  const segments =
    typeof raw === 'string'
      ? raw.split('/').filter(Boolean)
      : [];

  return handleCardDav(context.request, segments, auth);
};
