-- Inline animated SVG overrides for header logo and homepage hero icon.
ALTER TABLE company_config ADD COLUMN IF NOT EXISTS logo_svg TEXT;
ALTER TABLE company_config ADD COLUMN IF NOT EXISTS icon_svg TEXT;
