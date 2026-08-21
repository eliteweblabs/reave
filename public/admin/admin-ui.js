/**
 * Shared admin panel UI primitives (back chevrons, icon toolbar buttons).
 * Import from os-map-loader.js and any future admin client modules.
 */

export const IOS_ICONS = {
  'chevron-left':
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>',
  'chevron-right':
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>',
  copy: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
  check:
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>',
  link: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
  download:
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>',
  upload:
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>',
  share:
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>',
  reply:
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 14 4 9l5-5"/><path d="M4 9h10a4 4 0 0 1 4 4v3"/></svg>',
  'reply-all':
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 19-7-7 7-7"/><path d="M5 12v5h12"/><path d="m19 19-7-7 7-7"/><path d="M22 12v5h-6"/></svg>',
  edit: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
  trash:
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>',
  x: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>',
  stopwatch:
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2"/><path d="M10 2h4"/></svg>',
  send: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>',
  square: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="18" height="18" x="3" y="3" rx="2"/></svg>',
  plus: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="M12 5v14"/></svg>',
  sparkles:
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/><path d="M4 17v2"/><path d="M5 18H3"/></svg>',
  archive:
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/></svg>',
  receipt:
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 17.5v-11"/></svg>',
  rewind:
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="11 19 2 12 11 5 11 19"/><polygon points="22 19 13 12 22 5 22 19"/></svg>',
  /* IOS_ICONS.undo — Lucide undo; shake-to-undo toast */
  undo: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6.7 2.8L3 13"/></svg>',
  play: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="6 3 20 12 6 21 6 3"/></svg>',
  pause:
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="14" y="4" width="4" height="16" rx="1"/><rect x="6" y="4" width="4" height="16" rx="1"/></svg>',
  /* IOS_ICONS.grip — drag handle for list / pipeline reorder */
  grip:
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/></svg>',
  'skip-forward':
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" x2="19" y1="5" y2="19"/></svg>',
  user: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
  mail: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>',
  bell: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>',
  'bell-off':
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8.7 6A4.67 4.67 0 0 1 12 4a4.67 4.67 0 0 1 4.3 2"/><path d="M19 4v3a4 4 0 0 0-4 4v0a6 6 0 0 1-6 6v0H5"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/><path d="m2 2 20 20"/></svg>',
  phone:
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384"/></svg>',
  message:
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg>',
  'message-square':
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
  eye: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/></svg>',
  'eye-off':
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"/><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242"/><path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 13.058-4.076"/><path d="m2 2 20 20"/></svg>',
  search:
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>',
  /* IOS_ICONS.scan-text — Lucide scan-text; document shortcode scan */
  'scan-text':
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M7 8h8"/><path d="M7 12h10"/><path d="M7 16h6"/></svg>',
  'chevron-down':
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>',
  ban: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/></svg>',
  paperclip:
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m16 6-8.414 8.586a2 2 0 0 0 2.829 2.829l8.414-8.586a4 4 0 1 0-5.657-5.657l-8.379 8.551a6 6 0 1 0 8.485 8.485l8.586-8.414"/></svg>',
  /* IOS_ICONS.file-text — Lucide file-text; PDF / document tiles */
  'file-text':
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/></svg>',
  /* IOS_ICONS.flask — Lucide flask-conical; Email Lab mode */
  flask:
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 2v7.527a2 2 0 0 1-.211.896L4.72 20.55a1 1 0 0 0 .9 1.45h12.76a1 1 0 0 0 .9-1.45l-5.069-10.127A2 2 0 0 1 14 9.527V2"/><path d="M8.5 2h7"/><path d="M7 16h10"/></svg>',
  /* IOS_ICONS.folder — keep in sync with media-panel drop-folder card */
  folder:
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>',
  /* IOS_ICONS.image — keep in sync with media-panel empty state */
  image:
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>',
  more: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>',
  refresh:
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>',
  /* IOS_ICONS.dashboard — layout-dashboard; keep in sync with AdminFooterNav LayoutDashboard */
  dashboard:
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>',
  /* IOS_ICONS.key — Lucide key; shared REΛVE Claude key flag in chat */
  key: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15.5 7.5 2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4"/><path d="m21 2-9.6 9.6"/><circle cx="7.5" cy="15.5" r="5.5"/></svg>',
  /* IOS_ICONS.map-pin — Lucide map-pin; court / office pin on Knowledge gate */
  'map-pin':
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/></svg>',
  /* IOS_ICONS.settings — keep in sync with public/admin/clients-geo-map.js */
  settings:
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>',
};

/** Resize an IOS_ICONS glyph (keeps paths; swaps width/height attrs). */
export function iosIcon(key, size = 20) {
  const svg = IOS_ICONS[key];
  if (!svg) return '';
  return String(svg)
    .replace(/\bwidth="\d+"/, `width="${size}"`)
    .replace(/\bheight="\d+"/, `height="${size}"`);
}

let _agentIconClipSeq = 0;

/**
 * Hat-glasses agent icon.
 * Right eye winks on hover via clipped lid rects; both eyes close when
 * `html.reave-agent-asleep` is set (sleep mode) — see .agent-icon CSS.
 * Sleep mode swaps the day hat for a floppy sock nightcap; waking plays a
 * brief hat-swap via `html.reave-agent-waking` (push-client).
 */
export function agentIconSvg(size = 20) {
  const seq = ++_agentIconClipSeq;
  const clipLeft = `agent-eye-clip-l-${seq}`;
  const clipRight = `agent-eye-clip-r-${seq}`;
  return (
    `<svg class="agent-icon" xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">` +
    `<defs>` +
    `<clipPath id="${clipLeft}"><circle cx="7" cy="18" r="3"/></clipPath>` +
    `<clipPath id="${clipRight}"><circle cx="17" cy="18" r="3"/></clipPath>` +
    `</defs>` +
    '<path d="M14 18a2 2 0 0 0-4 0"/>' +
    /* Day fedora — hidden while asleep / flying on during wake swap */
    '<g class="agent-hat-day">' +
    '<path d="m19 11-2.11-6.657a2 2 0 0 0-2.752-1.148l-1.276.61A2 2 0 0 1 12 4H8.5a2 2 0 0 0-1.925 1.456L5 11"/>' +
    '</g>' +
    /* Sock nightcap + pom — shown while asleep / tossed off on wake */
    '<g class="agent-hat-sleep">' +
    '<path d="M5 11c1.1-5.4 3.9-7.9 7.2-7.9s6.1 2.5 7.2 7.9"/>' +
    '<path d="M15.2 3.9c1.9-.9 4.1-.4 5.6 1.9"/>' +
    '<circle cx="21.3" cy="6.2" r="1.2"/>' +
    '</g>' +
    '<path d="M2 11h20"/>' +
    '<circle cx="7" cy="18" r="3"/>' +
    '<circle cx="17" cy="18" r="3"/>' +
    `<g clip-path="url(#${clipLeft})">` +
    '<rect class="agent-eye-lid agent-eye-lid-left-top" x="4" y="15" width="6" height="3" fill="currentColor" stroke="none"/>' +
    '<rect class="agent-eye-lid agent-eye-lid-left-bottom" x="4" y="18" width="6" height="3" fill="currentColor" stroke="none"/>' +
    '</g>' +
    `<g clip-path="url(#${clipRight})">` +
    '<rect class="agent-eye-lid agent-eye-lid-top" x="14" y="15" width="6" height="3" fill="currentColor" stroke="none"/>' +
    '<rect class="agent-eye-lid agent-eye-lid-bottom" x="14" y="18" width="6" height="3" fill="currentColor" stroke="none"/>' +
    '</g></svg>'
  );
}

Object.defineProperty(IOS_ICONS, 'agent', {
  get: () => agentIconSvg(20),
  enumerable: true,
  configurable: true,
});

/**
 * Circular branded agent control (same shell as pane headers everywhere).
 * Default classes: agent-btn em-header-action-btn — never de-new-btn (that
 * shell carries list-FAB margins that shove the control into the title).
 */
export function createAgentBtn(opts = {}) {
  const {
    onClick,
    className = 'agent-btn em-header-action-btn',
    label = 'Agent',
    title = 'Send to Agent',
  } = opts;
  const btn = createIosIconBtn({
    iconKey: 'agent',
    label,
    className,
    onClick,
  });
  if (title != null) {
    btn.title = title;
    btn.setAttribute('aria-label', title);
  }
  // Header agent glyph is 16px (matches panels that previously hand-rolled this).
  const svg = btn.querySelector('svg');
  if (svg) {
    svg.setAttribute('width', '16');
    svg.setAttribute('height', '16');
  }
  return btn;
}

/**
 * Icon-only toolbar button (44pt touch target, iOS-style).
 * Prefer this (or paneDeleteIcon / paneShareIcon / createAgentBtn / createPanelBackBtn)
 * over hand-rolled <button> + SVG so chrome stays consistent.
 */
export function createIosIconBtn(opts = {}) {
  const { iconKey, label, className = 'ios-icon-btn', onClick, confirmDelete = false, confirmTimeout } = opts;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = normalizeIosIconBtnClass(className);
  btn.setAttribute('aria-label', label);
  btn.title = label;
  btn.innerHTML = IOS_ICONS[iconKey] || '';
  if (confirmDelete) {
    bindConfirmDeleteButton(btn, () => onClick?.(btn), { timeout: confirmTimeout });
  } else {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      onClick?.(btn);
    });
  }
  return btn;
}

/** Alternate button shells that intentionally omit `.ios-icon-btn` sizing/color. */
const IOS_ICON_BTN_ALT_BASES = [
  'agent-btn',
  'em-agent-btn',
  'list-selection-bar-btn',
  'swipe-act',
  'de-new-btn',
  'em-filter-tab',
];

function normalizeIosIconBtnClass(className) {
  const classes = String(className || 'ios-icon-btn')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (classes.length === 0) return 'ios-icon-btn';
  const hasAlt = classes.some((c) =>
    IOS_ICON_BTN_ALT_BASES.some((base) => c === base || c.startsWith(`${base}--`) || c.startsWith(`${base}-`)),
  );
  if (!hasAlt && !classes.includes('ios-icon-btn')) {
    classes.unshift('ios-icon-btn');
  }
  return classes.join(' ');
}

/** Vercel-style copy feedback — swap button content to a checkmark briefly. */
export const COPY_FEEDBACK_MS = 1000;

/** @type {WeakMap<HTMLElement, number>} */
const copyFeedbackTimers = new WeakMap();

export function showCopyButtonFeedback(btn, opts = {}) {
  if (!btn) return;
  const duration = opts.duration ?? COPY_FEEDBACK_MS;
  const existing = copyFeedbackTimers.get(btn);
  if (existing) clearTimeout(existing);

  if (!btn.dataset.copyFeedbackOrig) {
    btn.dataset.copyFeedbackOrig = btn.innerHTML;
    if (btn.hasAttribute('aria-label')) {
      btn.dataset.copyFeedbackAria = btn.getAttribute('aria-label');
    }
    if (btn.title) btn.dataset.copyFeedbackTitle = btn.title;
  }

  btn.innerHTML = IOS_ICONS.check;
  btn.setAttribute('aria-label', 'Copied');
  if (btn.title) btn.title = 'Copied';
  btn.classList.add('is-copy-success');

  const timer = window.setTimeout(() => {
    btn.innerHTML = btn.dataset.copyFeedbackOrig || '';
    const prevAria = btn.dataset.copyFeedbackAria;
    if (prevAria) btn.setAttribute('aria-label', prevAria);
    else btn.removeAttribute('aria-label');
    if (btn.dataset.copyFeedbackTitle) btn.title = btn.dataset.copyFeedbackTitle;
    btn.classList.remove('is-copy-success');
    delete btn.dataset.copyFeedbackOrig;
    delete btn.dataset.copyFeedbackAria;
    delete btn.dataset.copyFeedbackTitle;
    copyFeedbackTimers.delete(btn);
  }, duration);

  copyFeedbackTimers.set(btn, timer);
}

/**
 * Canonical on/off switch — `.prof-plugin-toggle` in settings.css.
 * Use this (or that class on a <button role="switch">) everywhere an admin
 * toggle appears. Do not invent a second switch look.
 *
 * @param {{
 *   checked?: boolean,
 *   disabled?: boolean,
 *   label?: string,
 *   title?: string,
 *   className?: string,
 *   onClick?: (btn: HTMLButtonElement, ev: MouseEvent) => void,
 * }} [opts]
 */
export function createToggleSwitch(opts = {}) {
  const { checked = false, disabled = false, label = '', title, className = '', onClick } = opts;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = ['prof-plugin-toggle', className].filter(Boolean).join(' ');
  btn.setAttribute('role', 'switch');
  setToggleSwitch(btn, checked);
  if (label) {
    btn.setAttribute('aria-label', label);
    btn.title = title ?? label;
  } else if (title) {
    btn.title = title;
  }
  if (disabled) btn.disabled = true;
  if (typeof onClick === 'function') {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (btn.disabled) return;
      onClick(btn, e);
    });
  }
  return btn;
}

/** Set aria-checked on a `.prof-plugin-toggle`. */
export function setToggleSwitch(el, checked) {
  if (!(el instanceof HTMLElement)) return;
  const on = Boolean(checked);
  el.setAttribute('aria-checked', on ? 'true' : 'false');
}

/**
 * Canonical copy control: IOS_ICONS.copy → checkmark via showCopyButtonFeedback.
 * Prefer this over hand-rolled Copy text buttons or one-off createIosIconBtn({ iconKey: 'copy' }).
 *
 * @param {{
 *   getText?: () => (string | Promise<string>),
 *   text?: string,
 *   label?: string,
 *   className?: string,
 *   onSuccess?: (btn: HTMLElement, text: string) => void,
 *   onError?: (err: unknown, btn: HTMLElement) => void,
 * }} [opts]
 */
export function createCopyIconBtn(opts = {}) {
  const {
    getText,
    text = '',
    label = 'Copy',
    className = 'ios-icon-btn',
    onSuccess,
    onError,
  } = opts;
  return createIosIconBtn({
    iconKey: 'copy',
    label,
    className,
    onClick: async (btn) => {
      let value = '';
      try {
        value = typeof getText === 'function' ? await getText() : text;
      } catch (err) {
        onError?.(err, btn);
        return;
      }
      const str = String(value ?? '');
      if (!str) return;
      try {
        await navigator.clipboard.writeText(str);
        showCopyButtonFeedback(btn);
        onSuccess?.(btn, str);
      } catch (err) {
        onError?.(err, btn);
      }
    },
  });
}

/** Return a normalized http(s) href when `value` is a valid URL; otherwise null. */
export function looksLikeHttpUrl(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed || !/^https?:\/\//i.test(trimmed)) return null;
  try {
    const u = new URL(trimmed);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.href;
  } catch {
    return null;
  }
}

// ---- Timing ring (stopwatch + countdown) — sealed widget ----
// Lucide stopwatch clock sits at (12, 13) in 24-space. Translate (2, 1) in a
// 28 viewBox so the face and ring share (14, 14). Do not split icon / ring
// into two SVGs — that is what made confirm-delete / undo drift.
//
// Isolation rules (do not regress):
// 1. createTimingRing() is the only public constructor. It mounts the SVG
//    in a shadow root so parent toast / toolbar / delete-confirm CSS cannot
//    target the circle.
// 2. Countdown is an SVG presentation attribute driven by rAF — never a CSS
//    animation or style.strokeDashoffset (those enter the cascade and get
//    stolen by .ch-undo-toast / .delete-confirm-btn keyframes).
// 3. Duration lives on the host (data-timing-ring-ms + WeakMap), not inherited
//    custom properties a parent can override.
// 4. This timer is functional (remaining undo / confirm time), not decorative.
//    Do not snap it off for prefers-reduced-motion.

const DELETE_CONFIRM_MS = 3000;
const TIMING_RING_VB = 28;
const TIMING_RING_CX = 14;
const TIMING_RING_R = 12.25;
const TIMING_RING_STROKE = 1.75;
const TIMING_RING_CIRC = (2 * Math.PI * TIMING_RING_R).toFixed(2);
const TIMING_RING_SEAL_ID = 'reave-timing-ring-seal';

/** @type {WeakMap<HTMLElement, number>} */
const deleteConfirmTimeouts = new WeakMap();
/** @type {WeakMap<Element, number>} */
const timingRingRafs = new WeakMap();
/** @type {WeakMap<Element, number>} */
const timingRingDurations = new WeakMap();

const TIMING_RING_SHADOW_CSS = `
:host {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  line-height: 0;
  flex-shrink: 0;
  color: inherit;
}
.timing-ring {
  display: block;
  width: 100%;
  height: 100%;
  overflow: visible;
}
.timing-ring-circle,
.timing-ring-track {
  animation: none !important;
  animation-name: none !important;
}
`;

const TIMING_RING_DOCUMENT_SEAL_CSS = `
/* Light-DOM overlay rings (filter-purge) + leftover markup. !important so
   parent keyframes cannot own stroke-dashoffset even if a stylesheet
   re-grows a delete-confirm-draw-ring rule. */
.timing-ring-host,
.timing-ring-circle,
.delete-confirm-ring-circle {
  animation: none !important;
  animation-name: none !important;
}
`;

function ensureTimingRingDocumentSeal() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(TIMING_RING_SEAL_ID)) return;
  const el = document.createElement('style');
  el.id = TIMING_RING_SEAL_ID;
  el.textContent = TIMING_RING_DOCUMENT_SEAL_CSS;
  (document.head || document.documentElement).appendChild(el);
}

function stopwatchIconMarkup(size = 18) {
  return (
    IOS_ICONS.stopwatch
      .replace(/width="\d+" height="\d+"/, `width="${size}" height="${size}"`)
      .replace(
        'aria-hidden="true"',
        'class="delete-confirm-icon delete-confirm-stopwatch" aria-hidden="true"',
      ) ||
    ''
  );
}

function deleteConfirmRingCircumference(radius) {
  return (2 * Math.PI * radius).toFixed(1);
}

/** Overlay ring only (filter-purge chip cap). Prefer `timingRingMarkup` / `createTimingRing`. */
export function deleteConfirmRingMarkup(size = 36, radius = 18) {
  const circ = deleteConfirmRingCircumference(radius);
  return (
    `<svg class="delete-confirm-ring" width="${size}" height="${size}" viewBox="0 0 44 44" fill="none" aria-hidden="true">` +
    `<circle class="delete-confirm-ring-track" cx="22" cy="22" r="${radius}" fill="none" stroke="currentColor" stroke-width="2.5" opacity="0.35"/>` +
    `<circle class="delete-confirm-ring-circle" cx="22" cy="22" r="${radius}" fill="none" stroke="currentColor" ` +
    `stroke-width="2.5" stroke-dasharray="${circ}" stroke-dashoffset="${circ}" transform="rotate(-90 22 22)"/>` +
    `</svg>`
  );
}

/**
 * Canonical stopwatch + countdown ring. Clock face and ring share one center.
 * Paths stay in sync with IOS_ICONS.stopwatch.
 * Callers should prefer createTimingRing() — this markup is for the sealed
 * shadow tree (and tests). Do not add delete-confirm-ring-circle here; that
 * class is how parent delete-confirm CSS used to steal the animation.
 */
export function timingRingMarkup(size = 26) {
  const c = TIMING_RING_CX;
  const r = TIMING_RING_R;
  return (
    `<svg class="timing-ring" width="${size}" height="${size}" viewBox="0 0 ${TIMING_RING_VB} ${TIMING_RING_VB}" fill="none" aria-hidden="true">` +
    `<circle class="timing-ring-track" cx="${c}" cy="${c}" r="${r}" stroke="currentColor" stroke-width="${TIMING_RING_STROKE}" opacity="0.35"/>` +
    `<circle class="timing-ring-circle" cx="${c}" cy="${c}" r="${r}" stroke="currentColor" ` +
    `stroke-width="${TIMING_RING_STROKE}" stroke-linecap="butt" stroke-dasharray="${TIMING_RING_CIRC}" stroke-dashoffset="${TIMING_RING_CIRC}" transform="rotate(-90 ${c} ${c})"/>` +
    `<g class="timing-ring-glyph" transform="translate(2 1)" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">` +
    `<circle cx="12" cy="13" r="8"/>` +
    `<path d="M12 9v4l2 2"/>` +
    `<path d="M10 2h4"/>` +
    `</g>` +
    `</svg>`
  );
}

function isTimingRingCircle(el) {
  return Boolean(
    el?.classList?.contains('timing-ring-circle') || el?.classList?.contains('delete-confirm-ring-circle'),
  );
}

function timingRingCircle(root) {
  if (!root) return null;
  if (isTimingRingCircle(root)) return root;

  if (root.shadowRoot) {
    const inner = timingRingCircle(root.shadowRoot);
    if (inner) return inner;
  }

  const hosts = root.querySelectorAll?.('.timing-ring-host');
  if (hosts) {
    for (const host of hosts) {
      const inner = timingRingCircle(host);
      if (inner) return inner;
    }
  }

  return root.querySelector?.('.timing-ring-circle, .delete-confirm-ring-circle') || null;
}

function rememberTimingRingDuration(el, durationMs) {
  if (!el || durationMs == null) return;
  const ms = Number(durationMs);
  if (!Number.isFinite(ms)) return;
  timingRingDurations.set(el, ms);
  if (el.dataset) el.dataset.timingRingMs = String(ms);
}

function readTimingRingDurationMs(circle) {
  let node = circle;
  while (node) {
    const stored = timingRingDurations.get(node);
    if (Number.isFinite(stored) && stored > 0) return stored;
    const data = Number.parseFloat(node.dataset?.timingRingMs || '');
    if (Number.isFinite(data) && data > 0) return data;
    const root = node.getRootNode?.();
    node = node.parentElement || (root instanceof ShadowRoot ? root.host : null);
  }
  return DELETE_CONFIRM_MS;
}

function setTimingRingOffset(circle, value) {
  // Attribute only. Setting style.strokeDashoffset puts the value in the CSS
  // cascade, where parent keyframes / reduced-motion rules pin it.
  circle.setAttribute('stroke-dashoffset', String(value));
  circle.style.removeProperty('stroke-dashoffset');
  circle.style.removeProperty('animation');
  circle.style.setProperty('animation', 'none', 'important');
}

/** Stop an in-flight countdown (toast hide / re-arm). */
export function stopTimingRing(root) {
  const circle = timingRingCircle(root);
  if (!circle) return;
  const raf = timingRingRafs.get(circle);
  if (raf) {
    cancelAnimationFrame(raf);
    timingRingRafs.delete(circle);
  }
}

/**
 * Sealed stopwatch + countdown. Use this everywhere — undo toast, gallery,
 * armed paneDeleteIcon. Parent classes cannot reach the animated circle.
 */
export function createTimingRing(opts = {}) {
  ensureTimingRingDocumentSeal();
  const { size = 26, durationMs = DELETE_CONFIRM_MS, className = '', autoplay = true } = opts;
  const host = document.createElement('span');
  host.className = ['timing-ring-host', 'delete-confirm-icon', className].filter(Boolean).join(' ');
  host.setAttribute('aria-hidden', 'true');
  host.style.width = `${size}px`;
  host.style.height = `${size}px`;
  rememberTimingRingDuration(host, durationMs);

  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `<style>${TIMING_RING_SHADOW_CSS}</style>${timingRingMarkup(size)}`;

  if (autoplay !== false) restartTimingRing(host);
  return host;
}

/**
 * Play the countdown. SVG attribute + rAF only — stylesheets do not own
 * stroke-dashoffset, so this works in the undo toast, a toolbar, or a chip.
 */
export function restartTimingRing(root) {
  ensureTimingRingDocumentSeal();
  const circle = timingRingCircle(root);
  if (!circle) return;

  if (root instanceof Element) rememberTimingRingDuration(root, root.dataset?.timingRingMs);

  const circ = Number.parseFloat(circle.getAttribute('stroke-dasharray') || TIMING_RING_CIRC);
  const safeCirc = Number.isFinite(circ) && circ > 0 ? circ : Number.parseFloat(TIMING_RING_CIRC);

  stopTimingRing(circle);
  setTimingRingOffset(circle, safeCirc);

  const durationMs = readTimingRingDurationMs(circle);
  if (durationMs <= 0) {
    setTimingRingOffset(circle, 0);
    return;
  }

  const started = performance.now();
  const tick = (now) => {
    const t = Math.min(1, (now - started) / durationMs);
    setTimingRingOffset(circle, safeCirc * (1 - t));
    if (t < 1) timingRingRafs.set(circle, requestAnimationFrame(tick));
    else timingRingRafs.delete(circle);
  };
  timingRingRafs.set(circle, requestAnimationFrame(tick));
}

function clearDeleteConfirmTimeout(btn) {
  const id = deleteConfirmTimeouts.get(btn);
  if (id != null) {
    clearTimeout(id);
    deleteConfirmTimeouts.delete(btn);
  }
}

function ensureDeleteConfirmChrome(btn, ringSize = 36, ringRadius = 18, overlayRing = false) {
  if (btn.dataset.deleteConfirmReady === '1') return;
  btn.dataset.deleteConfirmReady = '1';
  btn.classList.add('delete-confirm-btn');
  btn.dataset.state = 'trash';
  if (overlayRing) btn.dataset.timingRing = 'overlay';
  const icon = btn.querySelector('svg');
  if (icon) {
    icon.classList.add('delete-confirm-icon');
    btn.dataset.originalIconHtml = icon.outerHTML;
  }
  if (!overlayRing) return;
  const holder = document.createElement('span');
  holder.className = 'delete-confirm-ring-holder';
  holder.setAttribute('aria-hidden', 'true');
  holder.innerHTML = deleteConfirmRingMarkup(ringSize, ringRadius);
  const ringAnchor = btn.querySelector('.em-filter-purge-icon') || btn;
  ringAnchor.appendChild(holder);
}

export function resetDeleteConfirmButton(btn) {
  if (!(btn instanceof HTMLElement)) return;
  clearDeleteConfirmTimeout(btn);
  if (btn.dataset.state !== 'confirm') return;
  stopTimingRing(btn);
  btn.dataset.state = 'trash';
  const label = btn.dataset.originalTitle || btn.getAttribute('aria-label') || 'Delete';
  btn.title = label;
  if (btn.dataset.originalAriaLabel) {
    btn.setAttribute('aria-label', btn.dataset.originalAriaLabel);
  }
  const stopwatch = btn.querySelector('.timing-ring-host, .timing-ring, .delete-confirm-stopwatch');
  if (stopwatch && btn.dataset.originalIconHtml) {
    stopwatch.outerHTML = btn.dataset.originalIconHtml;
  }
}

function armDeleteConfirm(btn, timeout) {
  rememberTimingRingDuration(btn, timeout);
  if (!btn.dataset.originalAriaLabel) {
    btn.dataset.originalAriaLabel = btn.getAttribute('aria-label') || 'Delete';
  }
  btn.dataset.originalTitle = btn.title || btn.dataset.originalAriaLabel;
  btn.dataset.state = 'confirm';
  btn.removeAttribute('title');
  btn.setAttribute('aria-label', 'Tap again to confirm delete');

  const overlay = btn.dataset.timingRing === 'overlay';
  const icon = btn.querySelector('.delete-confirm-icon, .timing-ring-host, svg:not(.delete-confirm-ring)');
  if (overlay) {
    if (icon && !icon.classList.contains('delete-confirm-stopwatch')) {
      if (!btn.dataset.originalIconHtml) btn.dataset.originalIconHtml = icon.outerHTML;
      const size = icon.getAttribute('width') || '18';
      icon.outerHTML = stopwatchIconMarkup(size);
    }
  } else if (icon && !icon.classList.contains('timing-ring-host') && !icon.classList.contains('timing-ring')) {
    if (!btn.dataset.originalIconHtml) btn.dataset.originalIconHtml = icon.outerHTML;
    const size = Number(btn.dataset.timingRingSize) || 26;
    icon.replaceWith(createTimingRing({ size, durationMs: timeout, autoplay: false }));
  }

  restartTimingRing(btn);

  clearDeleteConfirmTimeout(btn);
  const id = window.setTimeout(() => {
    resetDeleteConfirmButton(btn);
  }, timeout);
  deleteConfirmTimeouts.set(btn, id);
}

/**
 * Trash → stopwatch + countdown ring; second tap within timeout runs onConfirm.
 * Armed state uses `createTimingRing` except filter-purge (ring rides the chip cap).
 */
export function bindConfirmDeleteButton(btn, onConfirm, opts = {}) {
  const timeout = opts.timeout ?? DELETE_CONFIRM_MS;
  const isSwipe = btn.classList.contains('swipe-act');
  const isIosIcon = btn.classList.contains('ios-icon-btn');
  const isFilterPurge = btn.classList.contains('em-filter-tab--purge');
  const overlayRing = isFilterPurge;
  const ringSize = opts.ringSize ?? (isSwipe ? 40 : isIosIcon ? 28 : isFilterPurge ? 22 : 36);
  /* Filter purge: fill the 44 viewBox so the stroke rides the pill cap. */
  const ringRadius = opts.ringRadius ?? (isFilterPurge ? 20.75 : 18);
  btn.dataset.timingRingSize = String(opts.iconSize ?? (isSwipe ? 28 : 26));
  ensureDeleteConfirmChrome(btn, ringSize, ringRadius, overlayRing);

  // Guard against double-binding (would arm then immediately confirm on one click).
  if (btn.dataset.deleteConfirmBound === '1') return;
  btn.dataset.deleteConfirmBound = '1';

  btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (btn.disabled) return;

    if ((btn.dataset.state || 'trash') === 'trash') {
      armDeleteConfirm(btn, timeout);
      return;
    }

    clearDeleteConfirmTimeout(btn);
    resetDeleteConfirmButton(btn);
    btn.disabled = true;
    try {
      await onConfirm?.(btn);
    } finally {
      if (btn.isConnected) btn.disabled = false;
    }
  });
}

function resetDeleteConfirmsIn(el) {
  el?.querySelectorAll?.('.delete-confirm-btn[data-state="confirm"]').forEach(resetDeleteConfirmButton);
}

/** Chevron-only back control for panel subheaders (.de-header). Hidden on
 *  desktop split-view by default (`.de-back-btn`); panels that need it at
 *  every viewport (settings, clients, work referrer) override display in CSS. */
export function createPanelBackBtn(opts = {}) {
  const { label = 'Back', onClick } = opts;
  return createIosIconBtn({
    iconKey: 'chevron-left',
    label,
    className: 'ios-icon-btn nav-chevron-btn de-back-btn',
    onClick,
  });
}

/** Circular create FAB used in sidebar list subheaders. */
export function createFabNewBtn(label, onClick) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'de-new-btn ch-new-btn';
  btn.setAttribute('aria-label', label);
  btn.title = label;
  btn.innerHTML = IOS_ICONS.plus || '';
  btn.addEventListener('click', onClick);
  return btn;
}

/** Case-insensitive filter helper for client-side list search. */
export function matchesListSearch(query, ...parts) {
  const q = String(query ?? '').trim().toLowerCase();
  if (!q) return true;
  const hay = parts
    .flatMap((p) => (Array.isArray(p) ? p : [p]))
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return hay.includes(q);
}

const SEARCH_FIELD_CLEAR_ICON = () => iosIcon('x', 18);
const SEARCH_FIELD_SEARCH_ICON = () => iosIcon('search', 18);

function escapeSearchHintText(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Normalize a search placeholder into the "Type / to Search …" label.
 * Accepts either a subject ("45 Emails") or an existing "Search …" / "Type / to …" string.
 */
export function formatSlashSearchLabel(placeholder) {
  const raw = String(placeholder ?? '').trim() || 'Search…';
  if (/^type\s+\/\s+to\s+/i.test(raw)) return raw.replace(/^type\s+\/\s+to\s+/i, 'Type / to ');
  const rest = raw.replace(/^search\s+/i, '').trim() || '…';
  return `Type / to Search ${rest}`;
}

/** Build rich hint HTML with a kbd-styled `/` keycap. */
export function slashSearchHintHtml(placeholder) {
  const label = formatSlashSearchLabel(placeholder);
  const match = label.match(/^(Type\s+)\/(\s+to\s+Search\s+)([\s\S]*)$/i);
  if (!match) return escapeSearchHintText(label);
  return (
    `${escapeSearchHintText(match[1])}` +
    `<kbd class="panel-list-search-kbd">/</kbd>` +
    `${escapeSearchHintText(match[2])}` +
    `${escapeSearchHintText(match[3])}`
  );
}

function syncSlashSearchHintVisibility(input, hint) {
  if (!input || !hint) return;
  hint.hidden = input.value.length > 0;
}

/**
 * Attach (or refresh) a rich "Type / to Search …" overlay on a search field.
 * Intercepts `input.placeholder` so existing `searchInput.placeholder = …` call sites keep working.
 */
export function attachSlashSearchHint(field, input, placeholder) {
  if (!field || !input) return null;
  field.classList.add('has-slash-search-hint');
  let hint = field.querySelector(':scope > .panel-list-search-hint');
  if (!(hint instanceof HTMLElement)) {
    hint = document.createElement('span');
    hint.className = 'panel-list-search-hint';
    hint.setAttribute('aria-hidden', 'true');
    field.insertBefore(hint, input.nextSibling);
  }

  const apply = (raw) => {
    const source = raw == null || raw === '' ? input.dataset.searchPlaceholderRaw || 'Search…' : raw;
    input.dataset.searchPlaceholderRaw = String(source);
    const label = formatSlashSearchLabel(source);
    hint.innerHTML = slashSearchHintHtml(source);
    input.setAttribute('aria-label', label);
    // Native placeholder stays empty — the overlay carries the styled hint.
    input.setAttribute('placeholder', '');
    syncSlashSearchHintVisibility(input, hint);
  };

  if (!input.dataset.slashHintBound) {
    input.dataset.slashHintBound = '1';
    Object.defineProperty(input, 'placeholder', {
      configurable: true,
      enumerable: true,
      get() {
        return input.dataset.searchPlaceholderRaw || '';
      },
      set(value) {
        apply(value);
      },
    });
    input.addEventListener('input', () => syncSlashSearchHintVisibility(input, hint));
    input.addEventListener('focus', () => syncSlashSearchHintVisibility(input, hint));
    input.addEventListener('blur', () => syncSlashSearchHintVisibility(input, hint));
  }

  apply(
    placeholder ??
      input.dataset.searchPlaceholderRaw ??
      input.getAttribute('placeholder') ??
      'Search…',
  );
  return hint;
}

/** Focus the first visible panel/list search field. Returns true if focused. */
export function focusVisibleListSearch() {
  const inputs = document.querySelectorAll('.panel-list-search, .search-overlay-input');
  for (const el of inputs) {
    if (!(el instanceof HTMLInputElement) || el.disabled) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;
    el.focus();
    return true;
  }
  return false;
}

/** Toggle the right-side search adornment between magnifying glass (empty) and clear (has text). */
export function syncSearchFieldAdornment(input, btn) {
  if (!input || !btn) return;
  const hasText = input.value.length > 0;
  if (hasText) {
    btn.dataset.mode = 'clear';
    btn.classList.add('is-clear');
    btn.classList.remove('is-search');
    btn.setAttribute('aria-label', 'Clear search');
    btn.innerHTML = SEARCH_FIELD_CLEAR_ICON();
  } else {
    btn.dataset.mode = 'search';
    btn.classList.add('is-search');
    btn.classList.remove('is-clear');
    btn.setAttribute('aria-label', 'Search');
    btn.innerHTML = SEARCH_FIELD_SEARCH_ICON();
  }
  const field = input.closest('.has-slash-search-hint');
  const hint = field?.querySelector(':scope > .panel-list-search-hint');
  if (hint) syncSlashSearchHintVisibility(input, hint);
}

export function createSearchFieldAdornment(input, onClear) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'panel-list-search-clear search-overlay-clear panel-list-search-adornment';
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (btn.dataset.mode === 'clear') {
      input.value = '';
      syncSearchFieldAdornment(input, btn);
      onClear?.('');
      input.focus();
    } else {
      input.focus();
    }
  });
  syncSearchFieldAdornment(input, btn);
  return btn;
}

/** Toggle a clear-only adornment — hidden when empty, X when the field has text. */
export function syncInputClearAdornment(input, btn, label = 'Clear') {
  if (!input || !btn) return;
  const hasText = input.value.length > 0;
  btn.hidden = !hasText;
  if (hasText) {
    btn.dataset.mode = 'clear';
    btn.classList.add('is-clear');
    btn.classList.remove('is-search');
    btn.setAttribute('aria-label', label);
    btn.innerHTML = SEARCH_FIELD_CLEAR_ICON();
  }
}

/** Clear button for editable fields (address, etc.) — same shell as search clear. */
export function createInputClearAdornment(input, onClear, label = 'Clear') {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'panel-list-search-clear search-overlay-clear panel-list-search-adornment';
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (btn.hidden) return;
    input.value = '';
    syncInputClearAdornment(input, btn, label);
    onClear?.('');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.focus();
  });
  syncInputClearAdornment(input, btn, label);
  return btn;
}

const LIST_EMPTY_ICON = () => iosIcon('ban', 36);

/** Centered list empty state — icon + message, flex-filled in scroll lists. */
export function createCenteredListEmpty(opts = {}) {
  const { text, innerHtml } = opts;
  const el = document.createElement('div');
  el.className = 'list-empty-state';
  const body = innerHtml != null ? innerHtml : (text || 'Nothing here yet.');
  el.innerHTML =
    `<div class="list-empty-state-icon">${LIST_EMPTY_ICON()}</div>` +
    `<div class="list-empty-state-body">${body}</div>`;
  return el;
}

/** Sidebar list empty row — tappable to create when `onAction` is set and not a search miss. */
export function createListEmptyState(opts = {}) {
  const { text, filtered = false, onAction, actionText } = opts;

  if (filtered || !onAction) {
    const el = document.createElement('div');
    el.className = 'de-empty';
    el.textContent = text || (filtered ? 'No matches.' : 'Nothing here yet.');
    return el;
  }

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'de-empty de-empty-action';
  btn.textContent = actionText || text || 'Create new';
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    onAction(btn);
  });
  return btn;
}

/** Detail-pane placeholder — optional Create New button or tap-to-create for the whole block. */
export function createPanePlaceholder(opts = {}) {
  const { innerHtml, onAction, onCreate, btnLabel = 'Create New', ariaLabel } = opts;
  const el = document.createElement(onAction ? 'button' : 'div');
  if (onAction) {
    el.type = 'button';
    el.className = 'de-placeholder de-placeholder-action';
    el.setAttribute('aria-label', ariaLabel || 'Create new');
    el.addEventListener('click', onAction);
  } else {
    el.className = 'de-placeholder';
  }
  el.innerHTML = innerHtml;
  if (onCreate) {
    const createBtn = document.createElement('button');
    createBtn.type = 'button';
    createBtn.className = 'de-placeholder-create-btn';
    createBtn.textContent = btnLabel;
    createBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      onCreate(createBtn);
    });
    el.appendChild(createBtn);
  }
  return el;
}

/**
 * Segmented control with a sliding indicator (status, priority, etc.).
 *
 * @param {object} opts
 * @param {string} [opts.label] — optional field label above the pill
 * @param {string} opts.value — initial selected value
 * @param {{ value: string, label: string }[]} opts.options
 * @param {string} [opts.ariaLabel]
 * @param {(value: string) => void} [opts.onChange]
 * @param {string} [opts.className] — extra class on the pill track
 * @param {boolean} [opts.scrollable] — horizontal scroll when labels don't fit (auto when 4+ options)
 * @returns {{ el: HTMLElement, getValue: () => string, setValue: (value: string) => void }}
 */
export function createSlidingPillSelect(opts = {}) {
  const {
    label = '',
    value,
    options = [],
    ariaLabel = '',
    onChange,
    className = '',
    scrollable = options.length >= 3,
  } = opts;

  const wrap = document.createElement('div');
  wrap.className = 'sliding-pill-select';

  if (label) {
    const labelEl = document.createElement('span');
    labelEl.className = 'de-label';
    labelEl.textContent = label;
    wrap.appendChild(labelEl);
  }

  const pill = document.createElement('div');
  pill.className = [
    'sliding-pill',
    scrollable ? 'sliding-pill--scroll' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  pill.setAttribute('role', 'tablist');
  if (ariaLabel) pill.setAttribute('aria-label', ariaLabel);

  const indicator = document.createElement('span');
  indicator.className = 'sliding-pill-indicator';
  indicator.setAttribute('aria-hidden', 'true');
  pill.appendChild(indicator);

  let currentValue = value ?? options[0]?.value ?? '';

  function syncIndicator(animate) {
    const activeBtn = pill.querySelector(`.sliding-pill-btn[data-value="${CSS.escape(currentValue)}"]`);
    if (!(activeBtn instanceof HTMLElement)) {
      indicator.hidden = true;
      return;
    }
    indicator.hidden = false;
    indicator.classList.toggle('sliding-pill-indicator--static', !animate);
    const pillRect = pill.getBoundingClientRect();
    const btnRect = activeBtn.getBoundingClientRect();
    indicator.style.width = `${btnRect.width}px`;
    indicator.style.transform = `translateX(${btnRect.left - pillRect.left}px)`;
  }

  function syncActive() {
    pill.querySelectorAll('.sliding-pill-btn').forEach((btn) => {
      const active = btn instanceof HTMLElement && btn.dataset.value === currentValue;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });
  }

  for (const opt of options) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sliding-pill-btn';
    btn.dataset.value = opt.value;
    btn.textContent = opt.label;
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-selected', opt.value === currentValue ? 'true' : 'false');
    if (opt.value === currentValue) btn.classList.add('is-active');
    btn.addEventListener('click', () => {
      if (currentValue === opt.value) return;
      currentValue = opt.value;
      syncActive();
      syncIndicator(true);
      if (scrollable) btn.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      onChange?.(currentValue);
    });
    pill.appendChild(btn);
  }

  wrap.appendChild(pill);

  const onResize = () => syncIndicator(false);
  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(onResize);
    ro.observe(pill);
  }
  window.addEventListener('resize', onResize);
  requestAnimationFrame(() => {
    syncIndicator(false);
    if (scrollable) {
      const activeBtn = pill.querySelector('.sliding-pill-btn.is-active');
      activeBtn?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  });

  return {
    el: wrap,
    getValue: () => currentValue,
    setValue: (next) => {
      if (!options.some((o) => o.value === next)) return;
      currentValue = next;
      syncActive();
      syncIndicator(true);
    },
  };
}

/**
 * Sidebar list subheader — search field with optional create FAB (mobile only via CSS).
 *
 * @param {object} opts
 * @param {object} [opts.search] — `{ value, placeholder, ariaLabel?, onInput(value) }`
 * @param {number} [opts.itemCount] — used for placeholders only
 * @param {false|object} [opts.addNew=false] — `{ label, onClick }` or `false` for search-only
 * @param {Node|Node[]} [opts.below] — nodes rendered below the search row (e.g. inbox filter tabs)
 */
function shouldShowListSearch(search) {
  return !!search;
}

export function listSearchAddNew(opts = {}) {
  const addNew = opts.addNew === false ? null : opts.addNew;
  const newBtn = addNew ? createFabNewBtn(addNew.label || 'New', addNew.onClick) : null;
  const belowNodes = opts.below == null ? [] : [].concat(opts.below).filter(Boolean);
  const showSearch = shouldShowListSearch(opts.search);

  if (showSearch) {
    const wrap = document.createElement('div');
    const stacked = belowNodes.length > 0;
    wrap.className =
      'panel-list-subheader' +
      (newBtn ? '' : ' panel-list-subheader--search-only') +
      (stacked ? ' panel-list-subheader--stacked' : '');
    const field = document.createElement('div');
    field.className = 'panel-list-search-field control-field';
    const input = document.createElement('input');
    input.className = 'panel-list-search';
    input.type = 'search';
    input.value = opts.search.value ?? '';
    const clearBtn = createSearchFieldAdornment(input, (value) => opts.search.onInput?.(value));
    input.addEventListener('input', (e) => {
      syncSearchFieldAdornment(input, clearBtn);
      opts.search.onInput?.(e.target.value, e);
    });
    field.appendChild(input);
    field.appendChild(clearBtn);
    attachSlashSearchHint(field, input, opts.search.placeholder || 'Search…');
    if (opts.search.ariaLabel) {
      input.setAttribute('aria-label', opts.search.ariaLabel);
    }
    if (newBtn) field.appendChild(newBtn);
    wrap.appendChild(field);
    for (const node of belowNodes) wrap.appendChild(node);
    return { el: wrap, input };
  }

  if (belowNodes.length > 0) {
    const wrap = document.createElement('div');
    wrap.className = 'panel-list-subheader panel-list-subheader--stacked';
    if (newBtn) wrap.appendChild(newBtn);
    for (const node of belowNodes) wrap.appendChild(node);
    return { el: wrap, input: null };
  }

  if (newBtn) {
    const toolbar = document.createElement('div');
    toolbar.className = 'panel-list-subheader panel-list-subheader--fab-only';
    toolbar.appendChild(newBtn);
    return { el: toolbar, input: null };
  }

  return null;
}

/** Standard sidebar search row — no inline create FAB (footer nav handles create). */
export function listSearchSubheader(opts = {}) {
  return listSearchAddNew({ ...opts, addNew: false });
}

const IOS_PTR_THRESHOLD = 70;
const IOS_PTR_MAX = 120;
const IOS_PTR_AXIS_SLOP = 8;
const IOS_PTR_VERTICAL_RATIO = 1.1;
const IOS_PTR_HORIZONTAL_RATIO = 3;
const IOS_PTR_HORIZONTAL_MIN = 28;
/** Never leave the PTR spinner spinning if a refresh callback hangs. */
const IOS_PTR_REFRESH_TIMEOUT_MS = 12000;

/**
 * iOS-style pull-to-refresh on a scroll container (touch).
 * Call after list children exist.
 *
 * @param {HTMLElement | { root?: HTMLElement, scrollEl?: HTMLElement, onRefresh?: () => unknown }} scrollElOrOpts
 * @param {(() => unknown) | undefined} [onRefresh]
 */
export function attachIosPullToRefresh(scrollElOrOpts, onRefresh) {
  const opts =
    scrollElOrOpts && typeof scrollElOrOpts === 'object' && !(scrollElOrOpts instanceof Element)
      ? scrollElOrOpts
      : { scrollEl: scrollElOrOpts, onRefresh };
  const scrollEl = opts.scrollEl || opts.root;
  const refreshFn = opts.onRefresh || onRefresh;
  if (!(scrollEl instanceof Element) || scrollEl.dataset.ptrBound) return;
  scrollEl.dataset.ptrBound = '1';
  scrollEl.classList.add('ios-ptr-host');

  const indicator = document.createElement('div');
  indicator.className = 'ios-ptr-indicator';
  indicator.innerHTML = '<span class="ios-ptr-spinner" aria-hidden="true"></span>';

  const content = document.createElement('div');
  content.className = 'ios-ptr-content';
  while (scrollEl.firstChild) content.appendChild(scrollEl.firstChild);

  scrollEl.appendChild(indicator);
  scrollEl.appendChild(content);

  const spinner = indicator.querySelector('.ios-ptr-spinner');
  let startX = 0;
  let startY = 0;
  let tracking = false;
  let refreshing = false;
  let refreshGeneration = 0;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let refreshTimer = null;
  /** @type {'vertical' | 'horizontal' | null} */
  let axis = null;

  function pullOffset() {
    return parseFloat(scrollEl.style.getPropertyValue('--ptr-y')) || 0;
  }

  function setPull(offset) {
    const y = Math.max(0, Math.min(offset, IOS_PTR_MAX));
    const progress = Math.min(1, y / IOS_PTR_THRESHOLD);
    scrollEl.style.setProperty('--ptr-y', `${y}px`);
    scrollEl.style.setProperty('--ptr-icon-opacity', String(Math.min(1, y / 32)));
    scrollEl.classList.toggle('ios-ptr-active', y > 0 && !refreshing);
    scrollEl.classList.toggle('ios-ptr-release', y >= IOS_PTR_THRESHOLD && !refreshing);
    if (spinner) {
      spinner.style.setProperty('--ptr-rot', `${progress * 300}deg`);
    }
  }

  function resetPull() {
    axis = null;
    scrollEl.classList.remove('ios-ptr-active', 'ios-ptr-release', 'ios-ptr-refreshing');
    scrollEl.style.removeProperty('--ptr-y');
    scrollEl.style.removeProperty('--ptr-icon-opacity');
    if (spinner) spinner.style.removeProperty('--ptr-rot');
  }

  function finishRefresh(generation) {
    if (generation !== refreshGeneration) return;
    if (refreshTimer != null) {
      clearTimeout(refreshTimer);
      refreshTimer = null;
    }
    refreshing = false;
    resetPull();
  }

  function startRefresh() {
    if (refreshing) return;
    refreshing = true;
    tracking = false;
    axis = null;
    const generation = ++refreshGeneration;
    scrollEl.classList.add('ios-ptr-refreshing');
    scrollEl.classList.remove('ios-ptr-active', 'ios-ptr-release');
    setPull(52);
    scrollEl.style.setProperty('--ptr-icon-opacity', '1');
    refreshTimer = setTimeout(() => finishRefresh(generation), IOS_PTR_REFRESH_TIMEOUT_MS);
    Promise.resolve()
      .then(() => refreshFn?.())
      .catch((err) => {
        console.warn('[ptr] refresh failed', err);
      })
      .finally(() => finishRefresh(generation));
  }

  function dampedPull(rawDy) {
    const y = rawDy * 0.52;
    if (y <= IOS_PTR_MAX) return y;
    return IOS_PTR_MAX + (y - IOS_PTR_MAX) * 0.15;
  }

  function endTracking(commit) {
    if (!tracking || refreshing) return;
    tracking = false;
    if (commit && axis === 'vertical' && pullOffset() >= IOS_PTR_THRESHOLD) startRefresh();
    else resetPull();
  }

  scrollEl.addEventListener(
    'touchstart',
    (e) => {
      if (refreshing || scrollEl.scrollTop > 1 || e.touches.length !== 1) return;
      tracking = true;
      axis = null;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    },
    { passive: true, capture: true },
  );

  scrollEl.addEventListener(
    'touchmove',
    (e) => {
      if (!tracking || refreshing || e.touches.length !== 1) return;
      if (scrollEl.scrollTop > 1) {
        tracking = false;
        resetPull();
        return;
      }

      const dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;

      if (axis == null) {
        const adx = Math.abs(dx);
        const ady = Math.abs(dy);
        if (adx < IOS_PTR_AXIS_SLOP && ady < IOS_PTR_AXIS_SLOP) return;
        if (ady >= adx * IOS_PTR_VERTICAL_RATIO && dy > 0) {
          axis = 'vertical';
        } else if (adx >= IOS_PTR_HORIZONTAL_MIN && adx >= ady * IOS_PTR_HORIZONTAL_RATIO) {
          tracking = false;
          return;
        } else if (ady > adx && dy > 0) {
          axis = 'vertical';
        } else if (dy <= 0) {
          tracking = false;
          return;
        } else {
          // Ambiguous diagonal — keep tracking until the gesture resolves.
          return;
        }
      }

      if (axis !== 'vertical') return;

      // Finger moved back above the start — collapse the rubber-band instead of
      // leaving a stranded spinner gap when touchend is skipped.
      if (dy <= 0) {
        setPull(0);
        return;
      }

      setPull(dampedPull(dy));
      e.preventDefault();
      e.stopPropagation();
    },
    { passive: false, capture: true },
  );

  scrollEl.addEventListener(
    'touchend',
    () => {
      endTracking(true);
    },
    { passive: true, capture: true },
  );

  scrollEl.addEventListener(
    'touchcancel',
    () => {
      endTracking(false);
    },
    { passive: true, capture: true },
  );

  // If the tab is backgrounded mid-pull, clear a stranded indicator.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && !refreshing) {
      tracking = false;
      resetPull();
    }
  });
}

/** Scroll list body used by pull-to-refresh (content wrapper if present). */
export function pullRefreshContentRoot(scrollEl, listSelector) {
  if (!scrollEl) return scrollEl;
  const host =
    typeof listSelector === 'string' && listSelector
      ? scrollEl.querySelector(listSelector) || scrollEl
      : scrollEl;
  return host.querySelector(':scope > .ios-ptr-content') || host;
}

function escAttr(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Rounded-square contact avatar (list rows, work client bar, pane titles).
 * Pass a branding URL when known; otherwise shows IOS_ICONS.user placeholder.
 */
export function contactAvatarHtml(opts = {}) {
  const url = String(opts.iconUrl || opts.logoUrl || '').trim();
  const size = Number(opts.iconSize) > 0 ? Number(opts.iconSize) : 18;
  const extra = opts.className ? ` ${opts.className}` : '';
  if (url) {
    return (
      `<span class="cl-list-avatar${extra}">` +
      `<img class="cl-list-avatar-img" src="${escAttr(url)}" alt="" loading="lazy" decoding="async" />` +
      `</span>`
    );
  }
  return (
    `<span class="cl-list-avatar cl-list-avatar--placeholder${extra}" aria-hidden="true">` +
    iosIcon('user', size) +
    `</span>`
  );
}

/** Swap a broken contact avatar image back to the user placeholder. */
export function bindContactAvatarFallback(img) {
  if (!(img instanceof HTMLImageElement)) return;
  img.addEventListener(
    'error',
    () => {
      const host = img.closest('.cl-list-avatar-wrap') || img.closest('.cl-list-avatar');
      if (host) host.innerHTML = contactAvatarHtml({ iconSize: 18 });
    },
    { once: true },
  );
}

export function mountContactAvatars(root) {
  root?.querySelectorAll?.('.cl-list-avatar-img').forEach(bindContactAvatarFallback);
}

/** Pencil icon beside editable pane titles (todo, work, chat rename, etc.). */
export function wrapEditableHeaderTitle(titleEl, opts = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'de-header-title-field';
  if (opts.clickable) wrap.classList.add('de-header-title-field--clickable');

  if (opts.leading != null && opts.leading !== false) {
    const leading = document.createElement('span');
    leading.className = 'de-header-title-leading';
    if (typeof opts.leading === 'string') leading.innerHTML = opts.leading;
    else if (opts.leading instanceof Node) leading.appendChild(opts.leading);
    wrap.appendChild(leading);
    mountContactAvatars(leading);
  }

  const icon = document.createElement('span');
  icon.className = 'de-header-title-edit-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.innerHTML = IOS_ICONS.edit;

  wrap.appendChild(icon);
  wrap.appendChild(titleEl);

  if (opts.clickable && typeof opts.onActivate === 'function') {
    const activate = (e) => {
      if (titleEl.dataset.editing === '1') return;
      e.preventDefault();
      opts.onActivate();
    };
    wrap.addEventListener('click', activate);
    wrap.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') activate(e);
    });
    wrap.setAttribute('role', 'button');
    wrap.setAttribute('tabindex', '0');
    wrap.title = opts.hint || 'Click to edit title';
    wrap.setAttribute('aria-label', opts.ariaLabel || opts.hint || 'Edit title');
  }

  return wrap;
}

/*
 * Auto-focus for the title field of a freshly started record.
 *
 * iOS only raises the software keyboard when focus() runs while the browser is
 * still handling the tap that asked for it, but create panes are built detached
 * and appended afterwards (and a few flows wait on the server first). So the tap
 * handler arms the request and parks focus on an offscreen input to hold the
 * keyboard open, then the renderer hands focus to the real title field.
 */

const TITLE_FOCUS_TIMEOUT = 3500;

let titleFocusKey = null;
let titleFocusTarget = null;
let titleFocusPrimer = null;
let titleFocusTimer = null;

function usesSoftwareKeyboard() {
  return window.matchMedia?.('(pointer: coarse)').matches ?? false;
}

function dropTitleFocusPrimer() {
  const primer = titleFocusPrimer;
  titleFocusPrimer = null;
  if (!primer) return;
  if (document.activeElement === primer) primer.blur();
  primer.remove();
}

/**
 * Arm title auto-focus for a record type ('work', 'todo', …). Must run
 * synchronously from the tap that starts the record.
 */
export function armTitleFocus(key) {
  // Some flows re-enter (a deep link lands on the tab and starts the record
  // again); tearing the primer down there would drop the keyboard mid-flight.
  const reArm = titleFocusKey != null && titleFocusKey === key;
  if (!reArm) cancelTitleFocus();
  titleFocusKey = key;
  titleFocusTarget = null;
  window.clearTimeout(titleFocusTimer);
  titleFocusTimer = window.setTimeout(cancelTitleFocus, TITLE_FOCUS_TIMEOUT);
  if (reArm || !usesSoftwareKeyboard()) return;
  const primer = document.createElement('input');
  primer.type = 'text';
  primer.tabIndex = -1;
  primer.setAttribute('aria-hidden', 'true');
  primer.autocomplete = 'off';
  primer.spellcheck = false;
  // Has to stay rendered and non-zero sized — iOS ignores focus() on hidden
  // inputs — and 16px keeps Safari from zooming while it is momentarily focused.
  primer.style.cssText =
    'position:fixed;top:0;left:0;width:1px;height:1px;z-index:-1;opacity:0;' +
    'padding:0;border:0;font-size:16px;background:transparent;caret-color:transparent;';
  document.body.appendChild(primer);
  titleFocusPrimer = primer;
  try {
    primer.focus({ preventScroll: true });
  } catch {
    /* ignore */
  }
}

/** Register the field an armed create pane wants focused once it is on screen. */
export function requestTitleFocus(key, field) {
  if (titleFocusKey == null || titleFocusKey !== key) return;
  titleFocusTarget = field instanceof HTMLElement ? field : null;
}

/** Hand focus to the registered field. Call once the pane is in the document. */
export function flushTitleFocus(key) {
  const field = titleFocusTarget;
  if (titleFocusKey == null || titleFocusKey !== key || !field) return;
  titleFocusTarget = null;
  if (field.isConnected) {
    try {
      field.focus({ preventScroll: true });
      const end = field.value?.length ?? 0;
      if (end && field instanceof HTMLInputElement) field.setSelectionRange(end, end);
    } catch {
      /* ignore */
    }
  }
  dropTitleFocusPrimer();
  window.clearTimeout(titleFocusTimer);
  titleFocusTimer = null;
  titleFocusKey = null;
}

/** Drop an armed request when the create flow bails out. */
export function cancelTitleFocus() {
  window.clearTimeout(titleFocusTimer);
  titleFocusTimer = null;
  titleFocusKey = null;
  titleFocusTarget = null;
  dropTitleFocusPrimer();
}

/**
 * Shared editable pane-header title (bold `.de-doc-name` + pencil affordance).
 * Prefer this (or `editableTitle` on createPaneHeader / createPaneSubheader)
 * over one-off title inputs so work, todo, clients, chat rename, etc. match.
 * @returns {{ el: HTMLElement, input: HTMLInputElement }}
 */
export function createEditableHeaderTitleInput(opts = {}) {
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'de-doc-name de-header-title-input';
  if (opts.className) input.classList.add(...opts.className.split(/\s+/).filter(Boolean));
  if (opts.placeholder) input.placeholder = opts.placeholder;
  if (opts.value != null) input.value = opts.value;
  input.setAttribute('aria-label', opts.ariaLabel || opts.placeholder || 'Title');
  return {
    el: wrapEditableHeaderTitle(input, {
      leading: opts.leading,
    }),
    input,
  };
}

/**
 * Detail-pane title row: back + title + optional middle + icon actions.
 *
 * Prefer `createPaneHeader` from `pane-header.js` when mounting under the logo
 * topbar — that API owns the full header/subheader stack (optional secondary
 * row) and the shared clearance CSS. Keep calling this only when you need the
 * bare `.de-header` node (e.g. inside `.detail-chrome`).
 *
 * @param {object} opts
 * @param {object|false} [opts.back] — back button opts; omit for none
 * @param {string} [opts.title] — static title text
 * @param {object} [opts.editableTitle] — passed to createEditableHeaderTitleInput
 * @param {HTMLElement} [opts.titleNode] — custom title block (click-to-edit, client name, etc.)
 * @param {string} [opts.subtitle]
 * @param {Node|Node[]} [opts.afterTitle] — nodes between title and actions (tabs, model switcher)
 * @param {Node|Node[]} [opts.beforeIcons] — nodes in .de-header-actions before icon buttons
 * @param {Node|Node[]} [opts.icons] — share, delete, etc. in .de-header-actions
 * @param {string} [opts.className] — extra classes on .de-header
 * @returns {{ header: HTMLElement, titleInput: HTMLInputElement|null }}
 */
export function createPaneSubheader(opts = {}) {
  const header = document.createElement('div');
  header.className = 'de-header' + (opts.className ? ` ${opts.className}` : '');

  if (opts.back) {
    header.appendChild(createPanelBackBtn(opts.back));
  }

  let titleInput = null;
  if (opts.editableTitle) {
    const created = createEditableHeaderTitleInput(opts.editableTitle);
    titleInput = created.input;
    header.appendChild(created.el);
  } else if (opts.titleNode) {
    header.appendChild(opts.titleNode);
    const found = opts.titleNode.querySelector?.('.de-header-title-input');
    if (found instanceof HTMLInputElement) titleInput = found;
  } else if (opts.title != null && opts.title !== '') {
    const titleEl = document.createElement('span');
    titleEl.className = 'de-doc-name' + (opts.titleClass ? ` ${opts.titleClass}` : '');
    titleEl.textContent = opts.title;
    header.appendChild(titleEl);
  }

  if (opts.subtitle != null && opts.subtitle !== '') {
    const subEl = document.createElement('span');
    subEl.className = 'de-doc-slug';
    subEl.textContent = opts.subtitle;
    header.appendChild(subEl);
  }

  for (const node of [].concat(opts.afterTitle || []).filter(Boolean)) {
    header.appendChild(node);
  }

  const beforeIcons = [].concat(opts.beforeIcons || []).filter(Boolean);
  const icons = [].concat(opts.icons || []).filter(Boolean);
  if (beforeIcons.length || icons.length) {
    const actions = document.createElement('div');
    actions.className = 'de-header-actions';
    for (const node of beforeIcons) actions.appendChild(node);
    for (const node of icons) actions.appendChild(node);
    header.appendChild(actions);
  }

  return { header, titleInput };
}

/** @deprecated Use createPaneSubheader */
export function createPanelHeader(opts = {}) {
  const { header } = createPaneSubheader({
    back: opts.back,
    title: opts.title,
    subtitle: opts.subtitle,
    afterTitle: opts.nodes,
    beforeIcons: opts.actions,
  });
  return header;
}

const SIDEBAR_W_STORE = 'reave-sidebar-w';
const SIDEBAR_DEFAULT_W = 260;
const SIDEBAR_MIN_W = 200;
const SIDEBAR_MAX_W = 520;
/** Detail pane needs at least this much width beside the sidebar in split view. */
const DETAIL_PANE_MIN_W = 340;
const SPLIT_VIEW_TYPES = new Set([
  'email',
  'chats',
  'clients',
  'work',
  'knowledge',
  'documents',
  'rules',
  'schedule',
  'todo',
  'social',
  'sales-sheet',
]);
const SIDEBAR_PANEL_IDS = [
  'email-panel',
  'chat-panel',
  'clients-editor',
  'work-editor',
  'knowledge-editor',
  'doc-editor',
  'rule-editor',
  'schedule-panel',
  'todo-editor',
  'social-panel',
  'sales-sheet-editor',
];
/** Split view (list + detail side-by-side) and sidebar resize at ≥640px. */
export const ADMIN_SPLIT_VIEW_MQ = window.matchMedia('(min-width: 640px)');
export const ADMIN_PANE_MQ = window.matchMedia('(max-width: 639px)');
const SIDEBAR_MQ = ADMIN_SPLIT_VIEW_MQ;

export function isAdminPaneMobile() {
  return ADMIN_PANE_MQ.matches;
}

let _sidebarDrag = null;

function readSidebarWidthVar() {
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--sidebar-w').trim();
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : SIDEBAR_DEFAULT_W;
}

function maxSidebarWidthForViewport() {
  if (!SIDEBAR_MQ.matches) return SIDEBAR_MAX_W;
  return Math.min(
    SIDEBAR_MAX_W,
    Math.max(SIDEBAR_MIN_W, window.innerWidth - DETAIL_PANE_MIN_W),
  );
}

function applySidebarWidth(px) {
  const w = Math.round(Math.max(SIDEBAR_MIN_W, Math.min(maxSidebarWidthForViewport(), px)));
  document.documentElement.style.setProperty('--sidebar-w', `${w}px`);
  return w;
}

function clampSidebarWidthToViewport() {
  if (!SIDEBAR_MQ.matches || _sidebarDrag) return;
  applySidebarWidth(readSidebarWidthVar());
}

/** Desktop split-view panels: sidebar + main pane both visible. */
export function syncAdminSplitView(mapType) {
  const use = SIDEBAR_MQ.matches && SPLIT_VIEW_TYPES.has(mapType);
  document.body.classList.toggle('admin-split-view', use);
}

export function mountSidebarResizer(sidebar) {
  if (!sidebar || !SIDEBAR_MQ.matches) return;
  if (sidebar.querySelector('.ch-sidebar-resizer')) return;
  sidebar.dataset.resizerMounted = '1';
  const handle = document.createElement('div');
  handle.className = 'ch-sidebar-resizer';
  handle.setAttribute('role', 'separator');
  handle.setAttribute('aria-orientation', 'vertical');
  handle.setAttribute('aria-label', 'Resize sidebar');
  sidebar.appendChild(handle);
}

export function scanPanelSidebars() {
  if (!SIDEBAR_MQ.matches) return;
  for (const id of SIDEBAR_PANEL_IDS) {
    const panel = document.getElementById(id);
    if (!panel) continue;
    panel.querySelectorAll('.ch-sidebar, .de-sidebar').forEach(mountSidebarResizer);
  }
}

function bindSidebarResizeDrag() {
  if (document.documentElement.dataset.sidebarResizeBound === '1') return;
  document.documentElement.dataset.sidebarResizeBound = '1';

  document.addEventListener('pointerdown', (e) => {
    const handle = e.target.closest?.('.ch-sidebar-resizer');
    if (!handle) return;
    e.preventDefault();
    handle.setPointerCapture(e.pointerId);
    handle.classList.add('dragging');
    document.body.classList.add('sidebar-resize-active');
    _sidebarDrag = { startX: e.clientX, startW: readSidebarWidthVar() };
  });

  document.addEventListener('pointermove', (e) => {
    if (!_sidebarDrag) return;
    applySidebarWidth(_sidebarDrag.startW + (e.clientX - _sidebarDrag.startX));
  });

  const finishDrag = (e) => {
    if (!_sidebarDrag) return;
    document.querySelectorAll('.ch-sidebar-resizer.dragging').forEach((el) => {
      if (el.hasPointerCapture?.(e.pointerId)) el.releasePointerCapture(e.pointerId);
      el.classList.remove('dragging');
    });
    document.body.classList.remove('sidebar-resize-active');
    try {
      localStorage.setItem(SIDEBAR_W_STORE, String(readSidebarWidthVar()));
    } catch {
      /* ignore */
    }
    _sidebarDrag = null;
  };

  document.addEventListener('pointerup', finishDrag);
  document.addEventListener('pointercancel', finishDrag);
}

function observePanelSidebars() {
  if (document.documentElement.dataset.sidebarObserverBound === '1') return;
  document.documentElement.dataset.sidebarObserverBound = '1';
  const observer = new MutationObserver(() => scanPanelSidebars());
  for (const id of SIDEBAR_PANEL_IDS) {
    const panel = document.getElementById(id);
    if (panel) observer.observe(panel, { childList: true, subtree: true });
  }
}

export function initSidebarLayout() {
  let saved = SIDEBAR_DEFAULT_W;
  try {
    const n = parseInt(localStorage.getItem(SIDEBAR_W_STORE), 10);
    if (Number.isFinite(n)) saved = n;
  } catch {
    /* ignore */
  }
  applySidebarWidth(saved);
  bindSidebarResizeDrag();
  observePanelSidebars();
  scanPanelSidebars();
  clampSidebarWidthToViewport();
  SIDEBAR_MQ.addEventListener('change', () => {
    clampSidebarWidthToViewport();
    scanPanelSidebars();
  });
  window.addEventListener('resize', clampSidebarWidthToViewport);
}

// ---- List multi-select (icon click + long-press on touch) ----

const LIST_LONG_PRESS_MS = 500;
const LIST_LONG_PRESS_SLOP = 10;
/** Keep in sync with `.list-selection-bar` transition in editor.css */
const LIST_SELECTION_BAR_MS = 500;

/** @type {WeakMap<HTMLElement, object>} */
const listSelectionControllers = new WeakMap();

function getSwipeRowItemId(row) {
  return row.dataset.id || row.dataset.slug || '';
}

function createListSelectionController(listEl, opts) {
  let active = false;
  /** @type {Set<string>} */
  const selected = new Set();
  /** @type {HTMLElement | null} */
  let toolbar = null;
  /** @type {HTMLElement | null} */
  let countEl = null;
  /** @type {HTMLButtonElement | null} */
  let archiveBtn = null;
  /** @type {HTMLButtonElement | null} */
  let deleteBtn = null;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let hideToolbarTimer = null;
  /** Pixel height captured before the subheader collapses (for a true 0.5s slide). */
  let stashedSubheaderHeight = 0;
  /** Computed margin-bottom of the subheader before stash (keeps list spacing stable). */
  let stashedSubheaderMarginBottom = '';
  const boundRows = new WeakSet();

  function sidebarEl() {
    return listEl.closest('.ch-sidebar') || listEl.parentElement;
  }

  function subheaderEl() {
    return sidebarEl()?.querySelector('.panel-list-subheader') ?? null;
  }

  function rowIdsInList() {
    const ids = new Set();
    listEl.querySelectorAll('.swipe-row').forEach((row) => {
      const id = getSwipeRowItemId(row);
      if (id) ids.add(id);
    });
    return ids;
  }

  function pruneStaleSelection() {
    const present = rowIdsInList();
    for (const id of selected) {
      if (!present.has(id)) selected.delete(id);
    }
  }

  function removeOrphanSelectionBars(keep) {
    sidebarEl()?.querySelectorAll('.list-selection-bar').forEach((el) => {
      if (el !== keep) el.remove();
    });
  }

  function clearHideToolbarTimer() {
    if (hideToolbarTimer != null) {
      clearTimeout(hideToolbarTimer);
      hideToolbarTimer = null;
    }
  }

  function measureNaturalToolbarHeight() {
    if (!toolbar) return 0;
    const prevHeight = toolbar.style.height;
    const prevMargin = toolbar.style.marginBottom;
    const wasHidden = toolbar.hidden;
    const wasOpen = toolbar.classList.contains('list-selection-bar--open');
    toolbar.hidden = false;
    toolbar.classList.add('list-selection-bar--open');
    toolbar.style.height = 'auto';
    toolbar.style.marginBottom = '0px';
    const h = Math.round(toolbar.scrollHeight);
    toolbar.style.height = prevHeight;
    toolbar.style.marginBottom = prevMargin;
    if (!wasOpen) toolbar.classList.remove('list-selection-bar--open');
    toolbar.hidden = wasHidden;
    return h;
  }

  function selectionBarTargetHeight() {
    const natural = measureNaturalToolbarHeight();
    // Prefer the stashed search/tabs height so the list does not jump; never shrink
    // below the bar's own content height (avoids clipping the action buttons).
    return Math.max(stashedSubheaderHeight || 0, natural);
  }

  function selectionBarTargetMargin() {
    return stashedSubheaderMarginBottom || '0.35rem';
  }

  function clearToolbarLayoutStyles(bar) {
    if (!bar) return;
    bar.style.height = '';
    bar.style.marginBottom = '';
  }

  function stashSubheader(subheader, animate) {
    subheader.hidden = false;
    subheader.setAttribute('aria-hidden', 'true');
    if (!subheader.classList.contains('panel-list-subheader--selection-stashed')) {
      stashedSubheaderHeight = subheader.scrollHeight;
      stashedSubheaderMarginBottom = getComputedStyle(subheader).marginBottom || '';
    }
    if (!animate || subheader.classList.contains('panel-list-subheader--selection-stashed')) {
      subheader.classList.add('panel-list-subheader--selection-stashed');
      subheader.style.maxHeight = '0px';
      return;
    }
    subheader.style.maxHeight = `${stashedSubheaderHeight}px`;
    void subheader.offsetHeight;
    subheader.classList.add('panel-list-subheader--selection-stashed');
    subheader.style.maxHeight = '0px';
  }

  function unstashSubheader(subheader, animate) {
    subheader.setAttribute('aria-hidden', 'false');
    subheader.hidden = false;
    if (!animate) {
      subheader.classList.remove('panel-list-subheader--selection-stashed');
      subheader.style.maxHeight = '';
      return;
    }
    const h = stashedSubheaderHeight || subheader.scrollHeight;
    subheader.style.maxHeight = '0px';
    subheader.classList.remove('panel-list-subheader--selection-stashed');
    void subheader.offsetHeight;
    subheader.style.maxHeight = `${h}px`;
    const clearMax = () => {
      if (!subheader.classList.contains('panel-list-subheader--selection-stashed')) {
        subheader.style.maxHeight = '';
      }
    };
    subheader.addEventListener('transitionend', clearMax, { once: true });
    setTimeout(clearMax, LIST_SELECTION_BAR_MS + 80);
  }

  function showSelectionChrome({ animate = true } = {}) {
    const subheader = subheaderEl();
    ensureToolbar();
    if (subheader) stashSubheader(subheader, animate);
    if (!toolbar) return;
    clearHideToolbarTimer();
    const targetH = selectionBarTargetHeight();
    const targetMargin = selectionBarTargetMargin();
    toolbar.hidden = false;
    toolbar.setAttribute('aria-hidden', 'false');
    if (!animate || toolbar.classList.contains('list-selection-bar--open')) {
      toolbar.style.height = `${targetH}px`;
      toolbar.style.marginBottom = targetMargin;
      toolbar.classList.add('list-selection-bar--open');
      return;
    }
    // Match the collapsing subheader: start at 0, then grow to the same height/margin.
    toolbar.style.height = '0px';
    toolbar.style.marginBottom = '0px';
    // Two frames: apply the collapsed starting styles, then open so height can transition.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!active || !toolbar) return;
        toolbar.style.height = `${targetH}px`;
        toolbar.style.marginBottom = targetMargin;
        toolbar.classList.add('list-selection-bar--open');
      });
    });
  }

  function hideSelectionChrome({ animate = true } = {}) {
    const subheader = subheaderEl();
    if (toolbar) {
      toolbar.classList.remove('list-selection-bar--open');
      toolbar.setAttribute('aria-hidden', 'true');
      toolbar.style.height = '0px';
      toolbar.style.marginBottom = '0px';
      resetDeleteConfirmsIn(toolbar);
      clearHideToolbarTimer();
      const bar = toolbar;
      const finishHide = () => {
        if (bar && !bar.classList.contains('list-selection-bar--open')) {
          bar.hidden = true;
          clearToolbarLayoutStyles(bar);
        }
      };
      if (animate) {
        bar.addEventListener('transitionend', finishHide, { once: true });
        hideToolbarTimer = setTimeout(finishHide, LIST_SELECTION_BAR_MS + 80);
      } else {
        finishHide();
      }
    }
    if (subheader) unstashSubheader(subheader, animate);
  }

  function ensureToolbar() {
    removeOrphanSelectionBars(toolbar);
    if (toolbar?.isConnected) return;

    toolbar = null;
    countEl = null;
    archiveBtn = null;
    deleteBtn = null;

    const subheader = subheaderEl();

    toolbar = document.createElement('div');
    toolbar.className = 'list-selection-bar';
    toolbar.hidden = true;
    toolbar.setAttribute('role', 'toolbar');
    toolbar.setAttribute('aria-label', 'Selection actions');
    toolbar.setAttribute('aria-hidden', 'true');

    const inner = document.createElement('div');
    inner.className = 'list-selection-bar-inner';

    const closeBtn = createIosIconBtn({
      iconKey: 'x',
      label: 'Cancel selection',
      className: 'list-selection-bar-btn list-selection-bar-btn--close',
      onClick: () => exit(),
    });

    countEl = document.createElement('span');
    countEl.className = 'list-selection-count';

    const actions = document.createElement('div');
    actions.className = 'list-selection-actions';

    if (typeof opts.onBulkArchive === 'function') {
      archiveBtn = createIosIconBtn({
        iconKey: 'archive',
        label: opts.archiveLabel || 'Archive',
        className: 'list-selection-bar-btn list-selection-bar-btn--archive',
        onClick: () => void runBulkArchive(),
      });
      actions.appendChild(archiveBtn);
    }

    if (typeof opts.onBulkDelete === 'function') {
      deleteBtn = paneDeleteIcon({
        label: 'Delete',
        className: 'list-selection-bar-btn list-selection-bar-btn--delete',
        onClick: () => void runBulkDelete(),
      });
      actions.appendChild(deleteBtn);
    }

    inner.appendChild(closeBtn);
    inner.appendChild(countEl);
    inner.appendChild(actions);
    toolbar.appendChild(inner);

    if (subheader) subheader.insertAdjacentElement('afterend', toolbar);
    else listEl.insertAdjacentElement('beforebegin', toolbar);
  }

  function syncRowSelectedClasses() {
    if (active) {
      pruneStaleSelection();
      if (selected.size === 0) {
        exit();
        return;
      }
    }
    listEl.querySelectorAll('.swipe-row').forEach((row) => {
      const id = getSwipeRowItemId(row);
      const item = row.querySelector('.ch-list-item, .em-list-item');
      if (!item) return;
      const on = selected.has(id);
      item.classList.toggle('ch-list-item--selected', on);
      item.classList.toggle('em-list-item--selected', on);
      item.setAttribute('aria-checked', on ? 'true' : 'false');
      const selectIcon = item.querySelector('.list-select-icon');
      if (selectIcon) {
        selectIcon.classList.toggle('list-select-icon--selected', on);
        selectIcon.setAttribute('aria-checked', on ? 'true' : 'false');
      }
    });
  }

  function updateUI() {
    ensureToolbar();
    pruneStaleSelection();
    const n = selected.size;
    if (active && n === 0) {
      exit();
      return;
    }
    if (countEl) countEl.textContent = n === 1 ? '1 selected' : `${n} selected`;
    if (archiveBtn) archiveBtn.disabled = n === 0;
    if (deleteBtn) deleteBtn.disabled = n === 0;
    syncRowSelectedClasses();
  }

  function enter(initialId) {
    closeOpenSwipeRow();
    if (!active) {
      active = true;
      listEl.classList.add('list-selection-mode');
      showSelectionChrome({ animate: true });
    }
    if (initialId) selected.add(initialId);
    if (selected.size === 0) {
      exit();
      return;
    }
    updateUI();
    opts.onSelectionChange?.(selected, active);
  }

  function exit() {
    const wasActive = active;
    active = false;
    selected.clear();
    listEl.classList.remove('list-selection-mode');
    hideSelectionChrome({ animate: wasActive });
    if (countEl) countEl.textContent = '';
    syncRowSelectedClasses();
    if (wasActive) opts.onSelectionChange?.(selected, active);
  }

  function toggle(id) {
    if (!active || !id) return;
    if (selected.has(id)) selected.delete(id);
    else selected.add(id);
    if (selected.size === 0) exit();
    else updateUI();
  }

  async function runBulkArchive() {
    const ids = [...selected];
    if (!ids.length || typeof opts.onBulkArchive !== 'function') return;
    await opts.onBulkArchive(ids);
    exit();
  }

  async function runBulkDelete() {
    const ids = [...selected];
    if (!ids.length || typeof opts.onBulkDelete !== 'function') return;
    await opts.onBulkDelete(ids);
    exit();
  }

  function rowSelectIcon(item) {
    return item?.querySelector('.sidebar-list-author-icon, .cl-list-avatar-wrap') ?? null;
  }

  function handleSelectIconClick(row, ev) {
    ev.preventDefault();
    ev.stopPropagation();
    const id = getSwipeRowItemId(row);
    if (!id) return;
    if (!active) enter(id);
    else toggle(id);
  }

  function bindRow(row, contentWrap, itemEl) {
    if (boundRows.has(row)) return;
    boundRows.add(row);

    const selectIcon = rowSelectIcon(itemEl);
    if (selectIcon) {
      selectIcon.classList.add('list-select-icon');
      selectIcon.setAttribute('role', 'checkbox');
      selectIcon.setAttribute('aria-label', 'Select item');
      selectIcon.addEventListener('click', (ev) => handleSelectIconClick(row, ev));
    }

    let longPressTimer = null;
    let longPressFired = false;
    let pressX = 0;
    let pressY = 0;

    function cancelLongPress() {
      if (longPressTimer != null) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
    }

    contentWrap.addEventListener('pointerdown', (ev) => {
      if (!usesSoftwareKeyboard()) return;
      if (active) return;
      if (ev.target.closest('.td-list-grip')) return;
      longPressFired = false;
      pressX = ev.clientX;
      pressY = ev.clientY;
      cancelLongPress();
      longPressTimer = window.setTimeout(() => {
        longPressTimer = null;
        longPressFired = true;
        enter(getSwipeRowItemId(row));
        try {
          navigator.vibrate?.(12);
        } catch {
          /* ignore */
        }
      }, LIST_LONG_PRESS_MS);
    });

    contentWrap.addEventListener('pointermove', (ev) => {
      if (longPressTimer == null) return;
      const dx = ev.clientX - pressX;
      const dy = ev.clientY - pressY;
      if (Math.abs(dx) > LIST_LONG_PRESS_SLOP || Math.abs(dy) > LIST_LONG_PRESS_SLOP) {
        cancelLongPress();
      }
    });

    const cancelPress = () => cancelLongPress();
    contentWrap.addEventListener('pointerup', cancelPress);
    contentWrap.addEventListener('pointerleave', cancelPress);
    contentWrap.addEventListener('pointercancel', cancelPress);

    itemEl.addEventListener(
      'click',
      (ev) => {
        if (longPressFired) {
          ev.preventDefault();
          ev.stopPropagation();
          longPressFired = false;
          return;
        }
        // Icon clicks use handleSelectIconClick; skip here so capture doesn't toggle twice.
        if (ev.target.closest('.list-select-icon')) return;
        if (!active) return;
        ev.preventDefault();
        ev.stopPropagation();
        toggle(getSwipeRowItemId(row));
      },
      true,
    );
  }

  function resyncAfterListRebuild() {
    if (!active) return;
    pruneStaleSelection();
    if (selected.size === 0) {
      exit();
      return;
    }
    listEl.classList.add('list-selection-mode');
    // List rebuild may recreate the subheader; restore chrome without replaying slide-in.
    showSelectionChrome({ animate: false });
    updateUI();
  }

  return {
    enter,
    exit,
    toggle,
    bindRow,
    isActive: () => active,
    getSelected: () => selected,
    resyncAfterListRebuild,
  };
}

/** Enable icon-click and long-press multi-select on sidebar lists. Call once per list element. */
export function bindListMultiSelect(listEl, opts = {}) {
  if (!listEl) return null;
  if (listEl.dataset.listMultiSelectBound === '1') {
    return listSelectionControllers.get(listEl) ?? null;
  }
  listEl.dataset.listMultiSelectBound = '1';
  const ctrl = createListSelectionController(listEl, opts);
  listSelectionControllers.set(listEl, ctrl);
  return ctrl;
}

export function exitListMultiSelect(listEl) {
  listSelectionControllers.get(listEl)?.exit();
}

export function isListInSelectionMode(listEl) {
  return listSelectionControllers.get(listEl)?.isActive() ?? false;
}

/** Re-apply multi-select UI after a list DOM rebuild (rows replaced in place). */
export function resyncListMultiSelect(listEl) {
  listSelectionControllers.get(listEl)?.resyncAfterListRebuild();
}

// ---- Swipe row actions (shared across inbox, chats, docs, etc.) ----

const SWIPE_ACTIONS = {
  agent: { iconKey: 'agent', className: 'swipe-act swipe-act-agent', label: 'Send to Agent' },
  archive: { iconKey: 'archive', className: 'swipe-act swipe-act-archive', label: 'Archive' },
  delete: { iconKey: 'trash', className: 'swipe-act swipe-act-delete', label: 'Delete' },
  junk: { iconKey: 'ban', className: 'swipe-act swipe-act-junk', label: 'Junk' },
  receipt: { iconKey: 'receipt', className: 'swipe-act swipe-act-receipt', label: 'Receipt' },
  clear: { iconKey: 'rewind', className: 'swipe-act swipe-act-archive', label: 'Rewind' },
  copy: { iconKey: 'copy', className: 'swipe-act swipe-act-archive', label: 'Copy' },
};

function swipeIconMarkup(iconKey, size = 18) {
  const svg = IOS_ICONS[iconKey];
  if (!svg) {
    console.warn(`Swipe icon not found: ${iconKey}`);
    return '';
  }
  return svg.replace(/width="\d+" height="\d+"/, `width="${size}" height="${size}"`);
}

/** Build a swipe action descriptor — icon-only button with accessible label. */
export function swipeAction(kind, opts = {}) {
  const spec = SWIPE_ACTIONS[kind];
  if (!spec) throw new Error(`Unknown swipe action: ${kind}`);
  const { label = spec.label, onClick, confirmTimeout } = opts;
  if (typeof onClick !== 'function') throw new Error(`swipeAction(${kind}) requires onClick`);
  // Delete defaults to timer confirm; pass confirmDelete: false to keep a sheet/dialog.
  const confirmDelete =
    kind === 'delete' ? opts.confirmDelete !== false : !!opts.confirmDelete;
  return {
    label,
    iconKey: spec.iconKey,
    className: spec.className,
    onClick,
    confirmDelete,
    confirmTimeout,
  };
}

export const swipeAgentAction = (onClick) => swipeAction('agent', { onClick });
export const swipeArchiveAction = (opts) => swipeAction('archive', opts);
export const swipeDeleteAction = (opts) => swipeAction('delete', opts);
export const swipeJunkAction = (opts) => swipeAction('junk', opts);
export const swipeReceiptAction = (opts) => swipeAction('receipt', opts);
export const swipeClearAction = (opts) => swipeAction('clear', opts);
export const swipeCopyAction = (opts) => swipeAction('copy', opts);

const SWIPE_AXIS_SLOP = 12;
const SWIPE_HORIZONTAL_MIN = 28;
const SWIPE_HORIZONTAL_RATIO = 3;
const SWIPE_VERTICAL_RATIO = 1.1;
const SWIPE_CLOSE_HORIZONTAL_MIN = 14;
const SWIPE_CLOSE_HORIZONTAL_RATIO = 2;
const SWIPE_HINT_DELAY_MS = 450;
const SWIPE_HINT_OPEN_MS = 280;
const SWIPE_HINT_UNLOCK_MS = 230;
const SWIPE_HINT_STAGGER_MS = 110;
const SWIPE_HINT_MAX_ROWS = 6;
const SWIPE_HINT_STORAGE_PREFIX = 'admin-swipe-hint:';

let openSwipeRow = null;
const swipeHintPlayedScopes = new WeakSet();
const swipeRowApis = new WeakMap();

function getSwipeHintScope(list) {
  return (
    list.closest('[id$="-panel"], [id$="-editor"], #dashboard-panel') ||
    list.closest('.dash-events') ||
    list
  );
}

function isSwipeListVisible(list) {
  const scope = getSwipeHintScope(list);
  if (!scope?.isConnected) return false;
  if (scope === list) return list.offsetParent !== null;
  const style = window.getComputedStyle(scope);
  return style.display !== 'none' && style.visibility !== 'hidden' && scope.offsetParent !== null;
}

function prefersReducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

function getSwipeHintScopeKey(scope) {
  if (!scope) return '';
  if (scope.id) return scope.id;
  if (scope.dataset?.swipeHintScope) return scope.dataset.swipeHintScope;
  const cls = scope.className?.split(/\s+/).filter(Boolean)[0];
  return cls || 'swipe-list';
}

function swipeHintAlreadySeen(scopeKey) {
  if (!scopeKey) return true;
  try {
    return localStorage.getItem(`${SWIPE_HINT_STORAGE_PREFIX}${scopeKey}`) === '1';
  } catch {
    return false;
  }
}

function markSwipeHintSeen(scopeKey) {
  if (!scopeKey) return;
  try {
    localStorage.setItem(`${SWIPE_HINT_STORAGE_PREFIX}${scopeKey}`, '1');
  } catch {
    /* ignore quota / private mode */
  }
}

function isSwipeHintCascadeActive() {
  return !!document.querySelector('.ch-list.swipe-hint-cascade, .de-list.swipe-hint-cascade, .em-list.swipe-hint-cascade');
}

async function playSwipeHintCascade(list) {
  const rows = [...list.querySelectorAll(':scope > .swipe-row')].slice(0, SWIPE_HINT_MAX_ROWS);
  if (!rows.length) return;

  list.classList.add('swipe-hint-cascade');
  try {
    await Promise.all(
      rows.map((row, index) => {
        const api = swipeRowApis.get(row);
        if (!api?.playHint) return Promise.resolve();
        return new Promise((resolve) => {
          window.setTimeout(() => {
            api.playHint().then(resolve, resolve);
          }, index * SWIPE_HINT_STAGGER_MS);
        });
      }),
    );
  } finally {
    list.classList.remove('swipe-hint-cascade');
  }
}

function maybeScheduleSwipeHint(row) {
  if (!usesSoftwareKeyboard()) return;
  if (prefersReducedMotion()) return;
  const list = row.closest('.ch-list, .de-list, .em-list');
  if (!list) return;
  if (list.querySelector(':scope > .swipe-row') !== row) return;

  const scope = getSwipeHintScope(list);
  const scopeKey = getSwipeHintScopeKey(scope);
  if (swipeHintAlreadySeen(scopeKey)) return;
  if (swipeHintPlayedScopes.has(scope)) return;
  swipeHintPlayedScopes.add(scope);

  window.setTimeout(() => {
    if (!isSwipeListVisible(list)) return;
    if (!list.querySelector(':scope > .swipe-row')) return;
    playSwipeHintCascade(list).then(() => markSwipeHintSeen(scopeKey));
  }, SWIPE_HINT_DELAY_MS);
}

export function closeOpenSwipeRow() {
  if (openSwipeRow) {
    resetDeleteConfirmsIn(openSwipeRow.row);
    openSwipeRow.snap(false);
    openSwipeRow = null;
  }
}

export function bindSwipeListScroll(listEl) {
  listEl.addEventListener(
    'scroll',
    () => {
      closeOpenSwipeRow();
      closeContextMenu();
    },
    { passive: true },
  );
}

let openContextMenu = null;
let contextMenuDismissBound = false;
let contextMenuOpenedAt = 0;

export function closeContextMenu() {
  openContextMenu?.remove();
  openContextMenu = null;
}

function contextMenuWithinOpenGrace() {
  return Date.now() - contextMenuOpenedAt < 250;
}

function normalizeContextMenuItem(item) {
  const label = item.label || 'Action';
  const run = item.action || item.onClick;
  return {
    label,
    run: typeof run === 'function' ? run : null,
    confirmDelete: !!item.confirmDelete,
    confirmTimeout: item.confirmTimeout ?? DELETE_CONFIRM_MS,
  };
}

function armContextDeleteConfirm(btn, originalLabel, timeout) {
  clearTimeout(btn._confirmTimer);
  btn.dataset.confirmArmed = '1';
  btn.textContent = 'Confirm delete';
  btn.classList.add('ch-context-item--danger');
  btn._confirmTimer = setTimeout(() => {
    delete btn.dataset.confirmArmed;
    btn.textContent = originalLabel;
    btn.classList.remove('ch-context-item--danger');
  }, timeout);
}

/** Fixed-position menu for sidebar rows and other list items (right-click / long-press). */
export function showContextMenu(x, y, items, opts = {}) {
  const menuItems = (items || [])
    .map(normalizeContextMenuItem)
    .filter((item) => item.run);
  if (!menuItems.length) return;

  closeContextMenu();
  closeOpenSwipeRow();
  contextMenuOpenedAt = Date.now();

  const menu = document.createElement('div');
  menu.className = 'ch-context-menu';
  menu.setAttribute('role', 'menu');

  const title = typeof opts.title === 'string' ? opts.title.trim() : '';
  if (title) {
    const heading = document.createElement('div');
    heading.className = 'ch-context-menu-title';
    heading.textContent = title;
    menu.appendChild(heading);
  }

  for (const item of menuItems) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ch-context-item';
    btn.textContent = item.label;
    btn.setAttribute('role', 'menuitem');
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (item.confirmDelete && btn.dataset.confirmArmed !== '1') {
        armContextDeleteConfirm(btn, item.label, item.confirmTimeout);
        return;
      }
      closeContextMenu();
      try {
        await item.run();
      } catch (err) {
        console.error('[context-menu]', item.label, err);
      }
    });
    menu.appendChild(btn);
  }

  document.body.appendChild(menu);
  openContextMenu = menu;

  const rect = menu.getBoundingClientRect();
  menu.style.left = `${Math.min(x, window.innerWidth - rect.width - 8)}px`;
  menu.style.top = `${Math.min(y, window.innerHeight - rect.height - 8)}px`;

  const onKey = (ev) => {
    if (ev.key === 'Escape') close({ target: document.body });
  };
  const close = (ev) => {
    if (contextMenuWithinOpenGrace()) return;
    if (menu.contains(ev.target)) return;
    closeContextMenu();
    document.removeEventListener('pointerdown', close, true);
    document.removeEventListener('contextmenu', close, true);
    document.removeEventListener('keydown', onKey, true);
  };
  window.setTimeout(() => {
    document.addEventListener('pointerdown', close, true);
    document.addEventListener('contextmenu', close, true);
    document.addEventListener('keydown', onKey, true);
  }, 250);
}

function bindSwipeRowContextMenu(row, contentEl, actions, opts = {}) {
  const handler = (e) => {
    e.preventDefault();
    e.stopPropagation();
    showContextMenu(e.clientX, e.clientY, actions, {
      title: opts.contextMenuTitle,
    });
  };
  row.addEventListener('contextmenu', handler);
  contentEl.addEventListener('contextmenu', handler);
}

/** Match .swipe-act { width: 3.25rem } — old 72px fallback left a visible void. */
const SWIPE_ACT_WIDTH_FALLBACK_PX = 52;

function measureSwipeRevealPx(actionsEl, actionCount) {
  const count = Math.max(1, actionCount || 0);
  const measured = actionsEl?.offsetWidth || 0;
  if (measured > 0) return measured;
  const first = actionsEl?.querySelector?.('.swipe-act');
  if (first) {
    const w = first.getBoundingClientRect().width || first.offsetWidth || 0;
    if (w > 0) return w * count;
  }
  return SWIPE_ACT_WIDTH_FALLBACK_PX * count;
}

function attachSwipeRow(row, contentEl, revealPxOrGet) {
  const getRevealPx =
    typeof revealPxOrGet === 'function' ? revealPxOrGet : () => Number(revealPxOrGet) || 0;
  let revealPx = Math.max(0, getRevealPx());
  let startX = 0;
  let swipeStartY = 0;
  let baseX = 0;
  let pending = false;
  let dragging = false;
  let moved = false;
  let open = false;
  let hintLock = false;
  let hintCloseTimer = null;
  let hintUnlockTimer = null;
  /** @type {'horizontal' | 'vertical' | null} */
  let axis = null;

  function refreshRevealPx() {
    const next = getRevealPx();
    if (next > 0) revealPx = next;
  }

  function currentTx() {
    const m = contentEl.style.transform.match(/translate3d\(([-\d.]+)px/);
    return m ? parseFloat(m[1]) : 0;
  }

  function setTranslate(x, animate) {
    contentEl.style.transition = animate ? 'transform 0.22s cubic-bezier(0.25, 0.46, 0.45, 0.94)' : 'none';
    contentEl.style.transform = `translate3d(${x}px, 0, 0)`;
  }

  function snap(shouldOpen) {
    open = shouldOpen;
    row.classList.toggle('swipe-open', open);
    row.classList.remove('swipe-dragging');
    setTranslate(open ? -revealPx : 0, true);
    if (open) {
      if (openSwipeRow && openSwipeRow !== api) {
        resetDeleteConfirmsIn(openSwipeRow.row);
        openSwipeRow.snap(false);
      }
      openSwipeRow = api;
    } else {
      resetDeleteConfirmsIn(row);
      if (openSwipeRow === api) openSwipeRow = null;
    }
  }

  function resetGesture() {
    pending = false;
    dragging = false;
    axis = null;
    row.classList.remove('swipe-dragging');
  }

  function horizontalThresholds() {
    if (open) {
      return { min: SWIPE_CLOSE_HORIZONTAL_MIN, ratio: SWIPE_CLOSE_HORIZONTAL_RATIO };
    }
    return { min: SWIPE_HORIZONTAL_MIN, ratio: SWIPE_HORIZONTAL_RATIO };
  }

  function endHintLock() {
    hintLock = false;
    row.classList.remove('swipe-hint-lock', 'swipe-hint-active');
    row.style.pointerEvents = '';
  }

  function playHint() {
    if (hintLock || !row.isConnected) return Promise.resolve();
    refreshRevealPx();
    hintLock = true;
    row.classList.add('swipe-hint-lock', 'swipe-hint-active');
    row.style.pointerEvents = 'none';
    // Hint uses direct translate so multiple rows can overlap (piano-key cascade).
    setTranslate(-revealPx, true);

    return new Promise((resolve) => {
      hintCloseTimer = window.setTimeout(() => {
        hintCloseTimer = null;
        if (!row.isConnected) {
          endHintLock();
          resolve();
          return;
        }
        setTranslate(0, true);
        row.classList.remove('swipe-hint-active');
        hintUnlockTimer = window.setTimeout(() => {
          hintUnlockTimer = null;
          endHintLock();
          resolve();
        }, SWIPE_HINT_UNLOCK_MS);
      }, SWIPE_HINT_OPEN_MS);
    });
  }

  function onStart(clientX, clientY) {
    if (hintLock) return;
    const listEl = row.closest('.ch-list, .de-list, .em-list');
    if (listEl && isListInSelectionMode(listEl)) return;
    if (openSwipeRow && openSwipeRow !== api) closeOpenSwipeRow();
    // Remeasure when the row is actually visible (panel may have been display:none
    // at create time, which made offsetWidth 0 and inflated the reveal void).
    refreshRevealPx();
    startX = clientX;
    swipeStartY = clientY;
    baseX = open ? -revealPx : 0;
    pending = true;
    dragging = false;
    axis = null;
    moved = false;
  }

  function onMove(clientX, clientY, prevent) {
    if (!pending && !dragging) return;
    const dx = clientX - startX;
    const dy = clientY - swipeStartY;
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);

    const listEl = row.closest('.ch-list, .de-list, .em-list');
    if (listEl && listEl.scrollTop <= 1 && dy > 0 && ady > adx * SWIPE_VERTICAL_RATIO) {
      resetGesture();
      setTranslate(open ? -revealPx : 0, false);
      return;
    }

    if (axis == null) {
      if (adx < SWIPE_AXIS_SLOP && ady < SWIPE_AXIS_SLOP) return;

      if (ady >= adx * SWIPE_VERTICAL_RATIO) {
        axis = 'vertical';
        pending = false;
        return;
      }

      const { min, ratio } = horizontalThresholds();
      if (adx >= min && adx >= ady * ratio) {
        axis = 'horizontal';
        dragging = true;
        pending = false;
        row.classList.add('swipe-dragging');
        contentEl.style.transition = 'none';
      } else if (ady > adx) {
        axis = 'vertical';
        pending = false;
        return;
      }
      return;
    }

    if (axis === 'vertical') return;

    if (axis === 'horizontal' && dragging) {
      if (adx > 8) moved = true;
      let next = baseX + dx;
      next = Math.min(0, Math.max(-revealPx, next));
      setTranslate(next, false);
      if (prevent) prevent();
    }
  }

  function onEnd() {
    if (!pending && !dragging) return;
    if (axis === 'vertical' || (axis == null && pending)) {
      resetGesture();
      return;
    }
    if (!dragging) {
      resetGesture();
      return;
    }
    dragging = false;
    pending = false;
    axis = null;
    row.classList.remove('swipe-dragging');
    const tx = currentTx();
    snap(tx <= -revealPx * 0.35);
  }

  contentEl.addEventListener(
    'touchstart',
    (e) => {
      if (e.touches.length !== 1) return;
      onStart(e.touches[0].clientX, e.touches[0].clientY);
    },
    { passive: true },
  );
  contentEl.addEventListener(
    'touchmove',
    (e) => onMove(e.touches[0].clientX, e.touches[0].clientY, () => e.preventDefault()),
    { passive: false },
  );
  contentEl.addEventListener('touchend', onEnd);
  contentEl.addEventListener('touchcancel', onEnd);

  contentEl.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    onStart(e.clientX, e.clientY);
    const onMouseMove = (ev) => onMove(ev.clientX, null);
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      onEnd();
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });

  contentEl.addEventListener(
    'click',
    (e) => {
      if (moved) {
        e.preventDefault();
        e.stopPropagation();
        moved = false;
      }
    },
    true,
  );

  const api = {
    snap,
    row,
    moved: () => moved,
    playHint,
    isHinting: () => hintLock,
  };
  swipeRowApis.set(row, api);
  return api;
}

/** iOS-style swipe row — pass content element + swipeAction() descriptors. */
export function createSwipeRow(contentEl, actions, opts = {}) {
  const row = document.createElement('div');
  row.className = 'swipe-row';
  if (contentEl.dataset?.id) row.dataset.id = contentEl.dataset.id;
  if (contentEl.dataset?.slug) row.dataset.slug = contentEl.dataset.slug;

  const actionsEl = document.createElement('div');
  actionsEl.className = 'swipe-actions';
  for (const act of actions) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = act.className || 'swipe-act';
    const iconKey = act.iconKey || act.icon;
    const iconMarkup = swipeIconMarkup(iconKey, 18);
    if (iconMarkup) {
      btn.innerHTML = iconMarkup;
    } else {
      console.error(`Swipe action missing icon: ${act.label || 'Unknown'} (key: ${iconKey})`);
    }
    btn.setAttribute('aria-label', act.label || 'Action');
    btn.title = act.label || 'Action';
    if (act.confirmDelete) {
      bindConfirmDeleteButton(btn, () => act.onClick(), { timeout: act.confirmTimeout });
    } else {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        act.onClick();
      });
    }
    actionsEl.appendChild(btn);
  }

  const content = document.createElement('div');
  content.className = 'swipe-content';
  content.appendChild(contentEl);
  row.appendChild(actionsEl);
  row.appendChild(content);

  bindSwipeRowContextMenu(row, content, actions, opts);

  requestAnimationFrame(() => {
    attachSwipeRow(row, content, () => measureSwipeRevealPx(actionsEl, actions.length));
    maybeScheduleSwipeHint(row);
    const list = row.closest('.ch-list, .de-list, .em-list');
    const ctrl = list ? listSelectionControllers.get(list) : null;
    if (ctrl) ctrl.bindRow(row, content, contentEl);
  });
  return row;
}

if (typeof document !== 'undefined' && !contextMenuDismissBound) {
  contextMenuDismissBound = true;
  document.addEventListener('click', (e) => {
    if (!openContextMenu) return;
    if (e.button && e.button !== 0) return;
    if (contextMenuWithinOpenGrace()) return;
    if (!openContextMenu.contains(e.target)) closeContextMenu();
  });
}

export function deBtnIconSvg(iconKey, size = 16) {
  const svg = IOS_ICONS[iconKey];
  if (!svg) return '';
  return svg.replace(/width="\d+" height="\d+"/, `width="${size}" height="${size}"`);
}

export function setDeBtnLabel(btn, label, iconKey) {
  const key = iconKey ?? btn.dataset.deBtnIcon ?? '';
  if (iconKey) btn.dataset.deBtnIcon = iconKey;
  btn.innerHTML =
    (key ? `<span class="de-btn-icon" aria-hidden="true">${deBtnIconSvg(key)}</span>` : '') +
    `<span class="de-btn-label">${label}</span>`;
}

export function getDeBtnLabel(btn) {
  return btn.querySelector('.de-btn-label')?.textContent?.trim() || '';
}

export function updateDeBtnLabel(btn, label) {
  const el = btn.querySelector('.de-btn-label');
  if (el) el.textContent = label;
  else btn.textContent = label;
}

const BRANDING_EXT_BY_TYPE = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
};

function brandingExtFromUrl(url) {
  const m = String(url || '')
    .split('?')[0]
    .match(/\.(png|jpe?g|webp|svg)$/i);
  if (!m) return '';
  const ext = m[1].toLowerCase();
  return ext === 'jpeg' ? 'jpg' : ext;
}

function triggerBlobDownload(blob, filename) {
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}

/** Fetch (same-origin) or link-download (external) a branding image. */
export async function downloadBrandingImage(url, baseName) {
  const src = String(url || '').trim();
  const name = String(baseName || 'image').trim() || 'image';
  if (!src) return;

  let sameOrigin = false;
  try {
    sameOrigin = new URL(src, window.location.origin).origin === window.location.origin;
  } catch {
    sameOrigin = src.startsWith('/');
  }

  if (sameOrigin) {
    try {
      const res = await fetch(src);
      if (!res.ok) throw new Error('Fetch failed');
      const blob = await res.blob();
      const ext = BRANDING_EXT_BY_TYPE[blob.type] || brandingExtFromUrl(src) || 'png';
      triggerBlobDownload(blob, `${name}.${ext}`);
      return;
    } catch {
      /* fall through to anchor download */
    }
  }

  const a = document.createElement('a');
  a.href = src;
  a.download = name;
  a.rel = 'noopener';
  a.target = '_blank';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Canonical pane-header trash (two-step confirm). Use everywhere — not one-off SVGs. */
/** Canonical trash + timing-ring delete control. Use everywhere entity deletes appear. */
export function paneDeleteIcon({ label, onClick, confirmDelete = true, className = '' } = {}) {
  const classes = ['ios-icon-btn', 'ch-delete-btn', className].filter(Boolean).join(' ');
  return createIosIconBtn({
    iconKey: 'trash',
    label,
    className: classes,
    confirmDelete,
    onClick,
  });
}

/** Canonical pane-header share control. */
export function paneShareIcon({ label, onClick }) {
  return createIosIconBtn({
    iconKey: 'share',
    label,
    className: 'ios-icon-btn de-share-btn',
    onClick,
  });
}

if (typeof document !== 'undefined' && !document.documentElement.dataset.swipeDismissBound) {
  document.documentElement.dataset.swipeDismissBound = '1';
  document.addEventListener('click', (e) => {
    if (!openSwipeRow) return;
    if (openSwipeRow.isHinting?.() || isSwipeHintCascadeActive()) return;
    if (openSwipeRow.row.contains(e.target)) return;
    closeOpenSwipeRow();
  });
}
