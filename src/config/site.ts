/**
 * Global site metadata — single source of truth for name, description,
 * favicon paths, and OG / social-share images.
 *
 * All paths are root-relative (served from /public/).
 * Layout.astro reads from here; update this file to change site-wide branding.
 */
export const SITE = {
  /** Fallback display name when company details are not configured yet. */
  name: "Business OS",

  /** Fallback meta description when company details are not configured yet. */
  description: "Automated client communication platform",

  /** Fallback logo path (root-relative, under /public). Override in admin → Company details. */
  logoPath: "/reave-logo.png",

  /** Default OG / Twitter card image — animated GIF, 600×315, 3.1 MB. */
  ogImage: "/og-image.gif",

  /** Default og:type. */
  ogType: "website" as const,

  favicons: {
    /** Multi-resolution .ico (16/32/48) — the file browsers auto-request at /favicon.ico. */
    ico: "/favicon.ico",
    /** 32×32 PNG — primary tab icon for modern browsers. */
    png32: "/favicon-32x32.png",
    /** 16×16 PNG — smaller fallback. */
    png16: "/favicon-16x16.png",
    /** 180×180 — Apple touch icon (Home Screen bookmark). */
    appleTouchIcon: "/apple-touch-icon.png",
    /** 192×192 PNG — Android / PWA install icon. */
    png192: "/favicon-192.png",
    /** 512×512 PNG — PWA splash / maskable. */
    png512: "/favicon-512.png",
  },
} as const;

export type SiteConfig = typeof SITE;
