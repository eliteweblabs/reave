# Standard UI icons (`IOS_ICONS`)

Shared Lucide-style stroke icons for admin chrome and matching Astro header controls.

## Source of truth

**File:** `public/admin/admin-ui.js`  
**Export:** `IOS_ICONS` — map of icon key → SVG HTML string (`currentColor`, outline stroke).

Also exported from that module:

- `createIosIconBtn({ iconKey, label, onClick, … })` — icon-only toolbar button
- `createAgentBtn` / `agentIconSvg` — branded agent control (`IOS_ICONS.agent` is a getter)

Admin panels import with a cache-busted query, e.g. `from './admin-ui.js?v=…'`.

## When to use

Use this pack for every UI chrome icon: toolbars, list row actions, header controls, notice actions, empty states, and similar controls.

Do **not** invent a one-off SVG (or pull in another icon library) when the glyph belongs in this set.

## Adding an icon

1. Add a new key to `IOS_ICONS` in `public/admin/admin-ui.js`, matching neighbors (`viewBox="0 0 24 24"`, `fill="none"`, `stroke="currentColor"`, typically `stroke-width="1.75"`).
2. Prefer Lucide path data so the set stays consistent.
3. Consume via `IOS_ICONS['your-key']` or `createIosIconBtn({ iconKey: 'your-key' })`.

Examples already in the pack: `bell`, `bell-off`, `trash`, `edit`, `share`, `copy`, `check`, `plus`, `mail`, `phone`, `refresh`, chevrons, etc.

## Astro / SSR

Astro cannot import the admin client bundle. Inline the **exact** SVG from `IOS_ICONS.<key>` and leave a comment naming the key so copies stay in sync. Update pack + inlines in the same change.

## Out of scope

- Brand / vendor logos → Simple Icons (`SIMPLE_ICONS_CDN`) or stored company SVG
- OS map node paths in `os-map-loader.js` (map-specific; still Lucide-shaped, but not the toolbar pack)
- Photos / raster brand marks
