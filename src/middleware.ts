import type { MiddlewareHandler } from "astro";
import { clerkMiddleware, createRouteMatcher } from "@clerk/astro/server";
import { hasFeature } from "./lib/features";
import { isModuleRuntimeAllowed } from "./lib/deployModuleStatus";
import {
  DEFAULT_DEMO_SUITE,
  DEMO_SUITE_COOKIE,
  DEMO_SUITE_COOKIE_MAX_AGE,
  parseDemoSuiteFromSearchParams,
  parseDemoSuiteCookie,
  serializeDemoSuite,
} from "./lib/demoSuite";
import { runWithDemoSuite } from "./lib/demoSuiteContext";
import { isDemoMode } from "./lib/demoMode";
import { isChatFocusSkinEnabled } from "./lib/chatFocusSkin";
import { applySecurityHeaders } from "./lib/securityHeaders";
import { isSitePageAllowed, loadSiteContentByKey, resolveSiteContentKey } from "./lib/siteContent";
import { serverEnv } from "./lib/serverEnv";
import { pruneRateLimitStore } from "./lib/inMemoryRateLimit";
// Arm SIGTERM drain as soon as the server handles any request (incl. health).
import "./lib/processDrain";

const RATE_LIMIT_PRUNE_MS = 5 * 60 * 1000;
let lastRateLimitPrune = 0;

function maybePruneRateLimitStore(): void {
  const now = Date.now();
  if (now - lastRateLimitPrune < RATE_LIMIT_PRUNE_MS) return;
  lastRateLimitPrune = now;
  pruneRateLimitStore(10 * 60 * 1000);
}

/** Railway liveness probe — must not depend on Clerk keys (see health/live.ts). */
function isHealthLiveProbe(pathname: string): boolean {
  return pathname.replace(/\/$/, "") === "/api/health/live";
}

/** Admin HTML sub-pages that require a session (not the main PWA shell). */
const isProtectedAdminPage = createRouteMatcher([
  "/admin/doc(.*)",
  "/admin/profile(.*)",
  "/admin/components(.*)",
  "/admin/visit-plan(.*)",
]);

/** PWA assets must be fetchable without a session (manifest, install flow). */
const isPublicAdminAsset = createRouteMatcher([
  "/admin/manifest.webmanifest",
  "/admin/sw.js",
]);

/** Service worker scripts must revalidate every load so fixes reach installed PWAs. */
function isServiceWorkerScript(pathname: string): boolean {
  return pathname === "/admin/sw.js" || pathname === "/c/sw.js";
}

/** Admin shell + module scripts must not sit in HTTP cache (installed PWAs keep stale JS for hours). */
function isAdminHotReloadAsset(pathname: string): boolean {
  if (pathname === "/admin" || pathname === "/admin/") return true;
  return pathname.startsWith("/admin/") && pathname.endsWith(".js");
}

function featureBlockedResponse(): Response {
  return applySecurityHeaders(new Response("Not found", { status: 404 }));
}

function isFeatureRuntimeBlocked(feature: Parameters<typeof hasFeature>[0]): boolean {
  return hasFeature(feature) && !isModuleRuntimeAllowed(feature);
}

function isFeatureBlockedPath(pathname: string): boolean {
  if (pathname.startsWith("/c/") && (!hasFeature("client_portal") || isFeatureRuntimeBlocked("client_portal"))) {
    return true;
  }
  if (
    (pathname === "/carddav" || pathname.startsWith("/carddav/") || pathname === "/.well-known/carddav") &&
    (!hasFeature("carddav") || isFeatureRuntimeBlocked("carddav"))
  ) {
    return true;
  }
  if (
    (pathname.startsWith("/doc/") ||
      pathname.startsWith("/admin/doc/") ||
      pathname.startsWith("/api/doc/") ||
      pathname.startsWith("/api/admin/doc/")) &&
    (!hasFeature("documents") || isFeatureRuntimeBlocked("documents"))
  ) {
    return true;
  }
  if ((pathname === "/focus" || pathname.startsWith("/focus/")) && !isChatFocusSkinEnabled()) {
    return true;
  }
  return false;
}

/** Old marketing routes → single-scroll homepage sections (/about has its own page). */
const HOME_SECTION_REDIRECTS: Record<string, string> = {
  "/contact": "contact",
  "/services": "contact",
};

const appMiddleware = clerkMiddleware(async (auth, context, next) => {
  maybePruneRateLimitStore();
  const url = new URL(context.request.url);
  const { pathname } = url;

  // Canonical host: www → apex when COMPANY_DOMAIN / PUBLIC_SITE_DOMAIN is set.
  const host = (context.request.headers.get("host") || url.host).split(":")[0];
  const configuredDomain =
    serverEnv("COMPANY_DOMAIN")?.trim().replace(/^https?:\/\//, "").split("/")[0] ||
    serverEnv("PUBLIC_SITE_DOMAIN")?.trim().replace(/^https?:\/\//, "").split("/")[0] ||
    "";
  if (configuredDomain && host === `www.${configuredDomain}`) {
    const target = new URL(url.href);
    target.host = configuredDomain;
    target.protocol = "https:";
    return applySecurityHeaders(
      new Response(null, {
        status: 301,
        headers: { Location: target.toString() },
      }),
    );
  }

  const normalizedPath = pathname.replace(/\/$/, "") || "/";

  // Demo suite landing — ?demo=tier-1&modules=[001,004]&industry=plumbing
  const demoParsed = parseDemoSuiteFromSearchParams(url.searchParams);
  if (demoParsed?.ok && (normalizedPath === "/" || normalizedPath === "/admin")) {
    context.cookies.set(DEMO_SUITE_COOKIE, serializeDemoSuite(demoParsed.suite), {
      path: "/",
      maxAge: DEMO_SUITE_COOKIE_MAX_AGE,
      sameSite: "lax",
      secure: url.protocol === "https:",
      httpOnly: false,
    });
    const target = new URL("/admin/", url.origin);
    target.searchParams.set("demoSuite", "1");
    return applySecurityHeaders(context.redirect(target.toString()));
  }

  if (normalizedPath === "/portfolio") {
    return applySecurityHeaders(
      new Response(null, {
        status: 301,
        headers: { Location: new URL("/about#portfolio", url.origin).toString() },
      }),
    );
  }

  const section = HOME_SECTION_REDIRECTS[normalizedPath];
  if (section) {
    const target = new URL("/", url.origin);
    target.searchParams.set("section", section);
    return applySecurityHeaders(
      new Response(null, {
        status: 301,
        headers: { Location: target.toString() },
      }),
    );
  }

  if (pathname.replace(/\/$/, "") === "" && url.searchParams.get("section") === "about") {
    return applySecurityHeaders(
      new Response(null, {
        status: 301,
        headers: { Location: new URL("/about", url.origin).toString() },
      }),
    );
  }

  if (pathname.replace(/\/$/, "") === "" && url.searchParams.get("section") === "addons") {
    return applySecurityHeaders(
      new Response(null, {
        status: 301,
        headers: { Location: new URL("/modules", url.origin).toString() },
      }),
    );
  }

  if (isFeatureBlockedPath(pathname)) {
    return featureBlockedResponse();
  }

  const siteKey = resolveSiteContentKey(
    isDemoMode() ? parseDemoSuiteCookie(context.cookies.get(DEMO_SUITE_COOKIE)?.value)?.industry : undefined,
  );
  const siteContent = loadSiteContentByKey(siteKey);
  // Astro internals (/_image image transforms, /_astro hashed assets) are not
  // marketing pages — blocking them 404s every <Image> srcset on /about etc.
  const isAstroInternal = normalizedPath === "/_image" || normalizedPath.startsWith("/_");
  if (
    !isAstroInternal &&
    !isSitePageAllowed(normalizedPath, siteContent) &&
    normalizedPath !== "/sign-in" &&
    normalizedPath !== "/sign-up"
  ) {
    // App routes that are not marketing pages — keep them out of the site-content
    // allowlist gate. /go/:token is especially important: share links land here and
    // redirect to the portal; blocking them yields a bare-domain iMessage preview.
    const isMarketingLike =
      normalizedPath !== "/admin" &&
      !normalizedPath.startsWith("/admin/") &&
      !normalizedPath.startsWith("/api/") &&
      !normalizedPath.startsWith("/c/") &&
      !normalizedPath.startsWith("/doc/") &&
      !normalizedPath.startsWith("/focus") &&
      !normalizedPath.startsWith("/go/") &&
      normalizedPath !== "/dealer-map";
    if (isMarketingLike) {
      return featureBlockedResponse();
    }
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
  if (isServiceWorkerScript(pathname) || isAdminHotReloadAsset(pathname)) {
    response.headers.set("Cache-Control", "no-cache, no-store, must-revalidate");
    response.headers.set("Pragma", "no-cache");
    response.headers.set("Expires", "0");
  }
  return applySecurityHeaders(response);
});

export const onRequest: MiddlewareHandler = async (context, next) => {
  if (isHealthLiveProbe(new URL(context.request.url).pathname)) {
    const response = await next();
    return applySecurityHeaders(response);
  }

  const run = () => appMiddleware(context, next);

  if (isDemoMode()) {
    const cookieSuite = parseDemoSuiteCookie(context.cookies.get(DEMO_SUITE_COOKIE)?.value);
    return runWithDemoSuite(cookieSuite ?? DEFAULT_DEMO_SUITE, run);
  }

  return run();
};
