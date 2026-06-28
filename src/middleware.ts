import { clerkMiddleware, createRouteMatcher } from "@clerk/astro/server";

const isAdminRoute = createRouteMatcher(["/admin(.*)"]);

/** PWA assets must be fetchable without a session (manifest, install flow). */
const isPublicAdminAsset = createRouteMatcher([
  "/admin/manifest.webmanifest",
]);

export const onRequest = clerkMiddleware((auth, context, next) => {
  if (isAdminRoute(context.request) && !isPublicAdminAsset(context.request)) {
    const { userId, redirectToSignIn } = auth();
    if (!userId) {
      return redirectToSignIn();
    }
  }
  return next();
});
