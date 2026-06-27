import { clerkMiddleware, createRouteMatcher } from "@clerk/astro/server";

const isAdminRoute = createRouteMatcher(["/admin(.*)"]);

export const onRequest = clerkMiddleware((auth, context, next) => {
  if (isAdminRoute(context.request)) {
    const { userId, redirectToSignIn } = auth();
    if (!userId) {
      return redirectToSignIn();
    }
  }
  return next();
});
