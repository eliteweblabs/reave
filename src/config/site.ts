/**
 * Global site metadata — single source of truth for name, description,
 * favicon paths, and OG / social-share images.
 *
 * All paths are root-relative (served from /public/).
 * Layout.astro reads from here; update this file to change site-wide branding.
 */
export const SITE = {
  /** Short display name used in <title> and og:site_name. */
  name: "/\\V",

  /** Default meta description for pages that don't supply their own. */
  description: "Reave Automatic",

  /** Default OG / Twitter card image — animated GIF, 600×315, 3.1 MB. */
  ogImage: "/og-image.gif",

  /** Default og:type. */
  ogType: "website" as const,

  favicons: {
    /** Modern browsers — inline SVG, no external fetches. */
    svg: "/favicon.svg",
    /** 32×32 PNG — Chrome, Firefox fallback. */
    png32: "/favicon-32x32.png",
    /** 16×16 PNG — older browser fallback. */
    png16: "/favicon-16x16.png",
    /** 180×180 — Apple touch icon (Home Screen bookmark). */
    appleTouchIcon: "/apple-touch-icon.png",
    /** Legacy shortcut icon — kept for IE / very old crawlers. */
    ico: "/favicon.ico",
  },
} as const;

export type SiteConfig = typeof SITE;
