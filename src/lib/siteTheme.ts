export const SITE_THEME_STORAGE_KEY = "reave-theme";
export type SiteTheme = "light" | "dark";

export function isSiteTheme(value: string | null | undefined): value is SiteTheme {
  return value === "light" || value === "dark";
}
