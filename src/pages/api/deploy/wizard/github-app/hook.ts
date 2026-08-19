/** Inactive webhook target for GitHub Apps created from the deploy-wizard manifest. */
export const prerender = false;

export function POST(): Response {
  return new Response(null, { status: 204 });
}

export function GET(): Response {
  return new Response(null, { status: 204 });
}
