/**
 * Reave brand text-button variants — admin ES module.
 * Keep in sync with src/lib/brandButton.ts (same keys and class strings).
 *
 * Visual tokens: src/styles/brand.css
 * Factory: createBrandBtn in admin-ui.js
 */

/** @typedef {'filled'|'solid'|'glass'|'danger'} BrandBtnVariant */

/** @type {Record<BrandBtnVariant, string>} */
export const BRAND_BTN_VARIANT_CLASS = {
  filled: 'brand-btn',
  solid: 'brand-btn brand-btn-solid',
  glass: 'brand-btn brand-btn-glass',
  danger: 'brand-btn brand-btn-danger',
};

/**
 * @param {BrandBtnVariant} [variant]
 * @param {string} [className]
 * @returns {string}
 */
export function brandBtnClasses(variant = 'filled', className = '') {
  return [BRAND_BTN_VARIANT_CLASS[variant] || BRAND_BTN_VARIANT_CLASS.filled, className]
    .filter(Boolean)
    .join(' ');
}
