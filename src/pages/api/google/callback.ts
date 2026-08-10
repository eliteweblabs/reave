import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ url }) => {
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');

  if (error || !code) {
    return new Response(
      `<html><body style="font-family:sans-serif;padding:2rem">
        <h2>❌ Google authorization failed</h2>
        <p>${error || 'No code returned'}</p>
        <a href="/admin">← Back to Admin</a>
      </body></html>`,
      { status: 400, headers: { 'Content-Type': 'text/html' } }
    );
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const railwayToken = process.env.RAILWAY_API_TOKEN;
  const serviceId = process.env.RAILWAY_SERVICE_ID;
  const environmentId = process.env.RAILWAY_ENVIRONMENT_ID;

  if (!clientId || !clientSecret) {
    return new Response(JSON.stringify({ error: 'Google credentials not configured' }), { status: 500 });
  }

  // Exchange code for tokens
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: 'https://reave.app/api/google/callback',
      grant_type: 'authorization_code',
    }),
  });

  const tokens = await tokenRes.json();

  if (!tokens.refresh_token) {
    return new Response(
      `<html><body style="font-family:sans-serif;padding:2rem">
        <h2>⚠️ No refresh token returned</h2>
        <p>Google only returns a refresh token on first authorization. If you've authorized before, revoke access at <a href="https://myaccount.google.com/permissions" target="_blank">myaccount.google.com/permissions</a> and try again.</p>
        <a href="/admin">← Back to Admin</a>
      </body></html>`,
      { status: 400, headers: { 'Content-Type': 'text/html' } }
    );
  }

  // Store refresh token in Railway via GraphQL
  if (railwayToken && serviceId && environmentId) {
    const mutation = `
      mutation UpsertVariables($input: VariableCollectionUpsertInput!) {
        variableCollectionUpsert(input: $input)
      }
    `;
    await fetch('https://backboard.railway.app/graphql/v2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${railwayToken}`,
      },
      body: JSON.stringify({
        query: mutation,
        variables: {
          input: {
            serviceId,
            environmentId,
            variables: { GOOGLE_REFRESH_TOKEN: tokens.refresh_token },
          },
        },
      }),
    });
  }

  return new Response(
    `<html><body style="font-family:sans-serif;padding:2rem;max-width:500px;margin:auto">
      <h2>✅ Google Search Console connected!</h2>
      <p>Refresh token saved to Railway. REΛVE can now access Search Console on your behalf.</p>
      <p style="margin-top:1.5rem"><a href="/admin" style="background:#4f46e5;color:#fff;padding:.6rem 1.2rem;border-radius:.4rem;text-decoration:none">← Back to Admin</a></p>
    </body></html>`,
    { headers: { 'Content-Type': 'text/html' } }
  );
};
