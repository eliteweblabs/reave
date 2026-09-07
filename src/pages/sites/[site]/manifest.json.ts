import type { APIRoute } from "astro";
import { getSiteContent } from "../../../lib/siteContent";

export const GET: APIRoute = async () => {
  const siteContent = getSiteContent();
  const manifest = siteContent.landing?.manifest;

  if (!manifest) {
    return new Response(JSON.stringify({ error: "Manifest not configured" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify(manifest), {
    status: 200,
    headers: { "Content-Type": "application/manifest+json" },
  });
};
