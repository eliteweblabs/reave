/**
 * Reave brand text-button variants — single class map for every surface.
 *
 * Visual tokens live in src/styles/brand.css (.brand-btn*).
 * Admin client JS mirrors this file in public/admin/brand-button.js — keep in sync.
 *
 * Use:
 *   Astro  → <BrandBtn variant="glass">…</BrandBtn>
 *   Admin  → createBrandBtn({ variant: 'glass', label: '…' })
 *   Legacy → class={brandBtnClasses('glass')} on markup (de-btn* aliases still work)
 */

export type BrandBtnVariant = "filled" | "solid" | "glass" | "danger";

/** Modifier classes paired with `.brand-btn` — change here + brand.css, not one-offs. */
export const BRAND_BTN_VARIANT_CLASS: Record<BrandBtnVariant, string> = {
  filled: "brand-btn",
  solid: "brand-btn brand-btn-solid",
  glass: "brand-btn brand-btn-glass",
  danger: "brand-btn brand-btn-danger",
};

/** Join variant + optional layout/scope classes (e.g. dash-panel-btn). */
export function brandBtnClasses(
  variant: BrandBtnVariant = "filled",
  className = "",
): string {
  return [BRAND_BTN_VARIANT_CLASS[variant] ?? BRAND_BTN_VARIANT_CLASS.filled, className]
    .filter(Boolean)
    .join(" ");
}
