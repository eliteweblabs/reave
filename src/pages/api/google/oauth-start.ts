import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ request, redirect }) => {
  const clientId = import.meta.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return new Response(JSON.stringify({ error: 'GOOGLE_CLIENT_ID not set' }), { status: 500 });
  }

  const scopes = [
    'https://www.googleapis.com/auth/webmasters.readonly',
    'https://www.googleapis.com/auth/webmasters',
  ].join(' ');

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: 'https://reave.app/api/google/callback',
    response_type: 'code',
    scope: scopes,
    access_type: 'offline',
    prompt: 'consent',
  });

  return redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
};
