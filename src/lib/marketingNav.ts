/**
 * Marketing site navigation — shared between the header bar and hamburger menu.
 */

export type MarketingNavLink = {
  href: string;
  label: string;
  /** Highlight as primary action inside the menu panel. */
  primary?: boolean;
  /** Open in a new tab (external demo sandbox). */
  external?: boolean;
};

export type MarketingNavGroup = {
  id: string;
  label: string;
  links: MarketingNavLink[];
};

export const MARKETING_NAV_GROUPS: MarketingNavGroup[] = [
  {
    id: "product",
    label: "Product",
    links: [
      { href: "/features", label: "Platform" },
      { href: "/demo", label: "Demo", primary: true },
      { href: "/deck", label: "Walkthrough" },
    ],
  },
  {
    id: "company",
    label: "Company",
    links: [
      { href: "/about", label: "About" },
      { href: "/services", label: "Services" },
      { href: "/about#portfolio", label: "Portfolio" },
      { href: "/#contact", label: "Contact" },
    ],
  },
];

export function isMarketingPagePath(pathname: string): boolean {
  const path = pathname.replace(/\/$/, "") || "/";
  if (path === "/") return true;
  return (
    path === "/features" ||
    path === "/demo" ||
    path === "/about" ||
    path === "/services" ||
    path === "/privacy" ||
    path === "/terms" ||
    path.startsWith("/form/")
  );
}

export function marketingNavActivePath(pathname: string, href: string): boolean {
  const path = pathname.replace(/\/$/, "") || "/";
  const target = href.replace(/\/$/, "") || "/";
  if (target.startsWith("/#")) return false;
  if (target === path) return true;
  if (target === "/about" && path === "/about") return true;
  return false;
}
