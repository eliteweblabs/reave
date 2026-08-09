/**
 * Pane header + subheader chrome — single config API for detail panes.
 *
 * The global logo / sleep / profile topbar lives in `src/components/Header.astro`
 * (`#topbar`). Everything that sits under it in a detail pane (back, title,
 * actions, optional secondary row) is built here so spacing and structure stay
 * consistent across schedule, chat, email, clients, work, etc.
 *
 * Prefer `createPaneHeader(opts)` from this module. `createPaneSubheader` remains
 * available via admin-ui.js for callers that only need the title row.
 */

import { createPaneSubheader } from './admin-ui.js?v=20260809b';

// Re-export so panels can import header chrome from this one module.

/**
 * @typedef {object} PaneHeaderOpts
 * @property {object|false} [back] — back button opts; omit for none
 * @property {string} [title] — static title text
 * @property {object} [editableTitle] — passed to createEditableHeaderTitleInput
 * @property {HTMLElement} [titleNode] — custom title block
 * @property {string} [subtitle]
 * @property {string} [titleClass]
 * @property {Node|Node[]} [afterTitle] — nodes between title and actions
 * @property {Node|Node[]} [beforeIcons] — nodes in .de-header-actions before icons
 * @property {Node|Node[]} [icons] — share, delete, etc.
 * @property {string} [className] — extra classes on .de-header
 * @property {Node|Node[]} [secondary] — row(s) under the title bar (when-nav, tabs…)
 * @property {string} [stackClassName] — extra classes on the stack root
 */

/**
 * Build the standard detail-pane header stack from one config object.
 *
 * @param {PaneHeaderOpts} opts
 * @returns {{
 *   root: HTMLElement,
 *   header: HTMLElement,
 *   titleInput: HTMLInputElement|null,
 * }}
 */
export function createPaneHeader(opts = {}) {
  const { secondary, stackClassName, ...headerOpts } = opts;
  const { header, titleInput } = createPaneSubheader(headerOpts);
  const secondaryNodes = [].concat(secondary || []).filter(Boolean);

  if (!secondaryNodes.length) {
    header.classList.add('pane-header');
    if (stackClassName) header.classList.add(...stackClassName.split(/\s+/).filter(Boolean));
    return { root: header, header, titleInput };
  }

  const root = document.createElement('div');
  root.className = 'pane-header' + (stackClassName ? ` ${stackClassName}` : '');
  root.appendChild(header);
  for (const node of secondaryNodes) {
    if (node instanceof HTMLElement) node.classList.add('pane-header-secondary');
    root.appendChild(node);
  }
  return { root, header, titleInput };
}

export { createPaneSubheader };
