# Standard UI icons (`IOS_ICONS`)

Shared Lucide-style stroke icons for admin chrome and matching Astro header controls.

## Source of truth

**File:** `public/admin/admin-ui.js`  
**Export:** `IOS_ICONS` — map of icon key → SVG HTML string (`currentColor`, outline stroke).  
**Helper:** `iosIcon(key, size)` — same glyph resized (use this instead of pasting a second SVG at 16/18px).

Also exported from that module:

- `createIosIconBtn({ iconKey, label, onClick, … })` — icon-only toolbar button
- `createAgentBtn` / `agentIconSvg` — branded agent control (`IOS_ICONS.agent` is a getter)

Admin panels import with a cache-busted query, e.g. `from './admin-ui.js?v=…'`.

## When to use

Use this pack for every UI chrome icon: toolbars, list row actions, header controls, notice actions, empty states, search adornments, and similar controls.

Do **not** invent a one-off SVG (or pull in another icon library) when the glyph belongs in this set. If you need a size the pack defaults don't use, call `iosIcon('x', 16)` — do not duplicate the path.

## Adding an icon

1. Add a new key to `IOS_ICONS` in `public/admin/admin-ui.js`, matching neighbors (`viewBox="0 0 24 24"`, `fill="none"`, `stroke="currentColor"`, typically `stroke-width="1.75"`).
2. Prefer Lucide path data so the set stays consistent.
3. Consume via `IOS_ICONS['your-key']`, `iosIcon('your-key', size)`, or `createIosIconBtn({ iconKey: 'your-key' })`.

Examples: `bell`, `bell-off`, `search`, `eye`, `eye-off`, `ban`, `chevron-down`, `paperclip`, `folder`, `message-square`, `trash`, `edit`, `share`, `copy`, `check`, `plus`, `mail`, `phone`, `refresh`, chevrons, etc.

## Astro / SSR / React

Astro and React cannot import the admin client bundle. Inline the **exact** path data from `IOS_ICONS.<key>` (adjust only width/height) and leave a comment naming the key so copies stay in sync. Update pack + inlines in the same change.

## Out of scope

- Brand / vendor logos → Simple Icons (`SIMPLE_ICONS_CDN`) or stored company SVG
- OS map node paths in `os-map-loader.js` (map-specific; still Lucide-shaped, but not the toolbar pack)
- Photos / raster brand marks
- Marketing-page lucide-astro illustrations that are not shared admin chrome
