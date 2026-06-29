import { clerkMiddleware, createRouteMatcher } from "@clerk/astro/server";
import { hasFeature } from "./lib/features";

const isAdminRoute = createRouteMatcher(["/admin(.*)"]);

/** PWA assets must be fetchable without a session (manifest, install flow). */
const isPublicAdminAsset = createRouteMatcher([
  "/admin/manifest.webmanifest",
  "/admin/sw.js",
]);

function featureBlockedResponse(): Response {
  return new Response("Not found", { status: 404 });
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

export const onRequest = clerkMiddleware((auth, context, next) => {
  const { pathname } = new URL(context.request.url);

  if (isFeatureBlockedPath(pathname)) {
    return featureBlockedResponse();
  }

  if (isAdminRoute(context.request) && !isPublicAdminAsset(context.request)) {
    const { userId, redirectToSignIn } = auth();
    if (!userId) {
      return redirectToSignIn();
    }
  }
  return next();
});
