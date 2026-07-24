import { clerkMiddleware, createRouteMatcher } from "@clerk/astro/server";
import { hasFeature } from "./lib/features";
import { applySecurityHeaders } from "./lib/securityHeaders";

/** Admin HTML sub-pages that require a session (not the main PWA shell). */
const isProtectedAdminPage = createRouteMatcher(["/admin/doc(.*)", "/admin/profile(.*)"]);

/** PWA assets must be fetchable without a session (manifest, install flow). */
const isPublicAdminAsset = createRouteMatcher([
  "/admin/manifest.webmanifest",
  "/admin/sw.js",
]);

function featureBlockedResponse(): Response {
  return applySecurityHeaders(new Response("Not found", { status: 404 }));
}

function isFeatureBlockedPath(pathname: string): boolean {
  if (pathname.startsWith("/c/") && !hasFeature("client_portal")) return true;
  if (
    (pathname === "/carddav" || pathname.startsWith("/carddav/") || pathname === "/.well-known/carddav") &&
    !hasFeature("carddav")
  ) {
    return true;
  }
  if (
    (pathname.startsWith("/doc/") ||
      pathname.startsWith("/admin/doc/") ||
      pathname.startsWith("/api/doc/") ||
      pathname.startsWith("/api/admin/doc/")) &&
    !hasFeature("documents")
  ) {
    return true;
  }
  return false;
}

export const onRequest = clerkMiddleware(async (auth, context, next) => {
  const url = new URL(context.request.url);
  const { pathname } = url;

  // Canonical host: www → apex (works once DNS for www exists).
  const host = (context.request.headers.get("host") || url.host).split(":")[0];
  if (host === "www.reave.app") {
    const target = new URL(url.href);
    target.host = "reave.app";
    target.protocol = "https:";
    return applySecurityHeaders(
      new Response(null, {
        status: 301,
        headers: { Location: target.toString() },
      }),
    );
  }

  if (isFeatureBlockedPath(pathname)) {
    return featureBlockedResponse();
  }

  if (isProtectedAdminPage(context.request) && !isPublicAdminAsset(context.request)) {
    const { userId } = auth();
    if (!userId) {
      const returnTo = encodeURIComponent(pathname + new URL(context.request.url).search);
      return applySecurityHeaders(
        context.redirect(`/admin/?auth=sign-in&returnTo=${returnTo}`),
      );
    }
  }

  const response = await next();
  return applySecurityHeaders(response);
});
