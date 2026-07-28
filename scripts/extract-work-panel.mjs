#!/usr/bin/env node
/**
 * One-off extractor: pulls work-panel code from os-map-loader.js into work-panel.js
 */
import fs from 'node:fs';

const SRC = '/workspace/public/admin/os-map-loader.js';
const OUT = '/workspace/public/admin/work-panel.js';

const lines = fs.readFileSync(SRC, 'utf8').split('\n');

const ranges = [
  [10942, 13417],
  [17363, 17376],
  [18900, 19024],
  [19056, 19479],
  [20094, 20109],
  [20162, 20193],
];

const body = [];
for (const [start, end] of ranges) {
  if (body.length) body.push('');
  body.push(`// ---- extracted from os-map-loader.js:${start}-${end} ----`);
  body.push(...lines.slice(start - 1, end));
}

const shellReplacements = [
  ['navigateToEmail(', 'shell.navigateToEmail('],
  ['navigateToChat(', 'shell.navigateToChat('],
  ['navigateToTodo(', 'shell.navigateToTodo('],
  ['navigateToClient(', 'shell.navigateToClient('],
  ['setActiveMap(', 'shell.setActiveMap('],
  ['askAgentWithPrompt(', 'shell.askAgentWithPrompt('],
  ['createPortalShareBtn(', 'shell.createPortalShareBtn('],
  ['renderLinkTrackStatus(', 'shell.renderLinkTrackStatus('],
  ['formatChatDate(', 'shell.formatChatDate('],
  ['sharePortalLink(', 'shell.sharePortalLink('],
  ['loadHomeDashboard(', 'shell.loadHomeDashboard('],
  ['clearEditorFooterSave(', 'shell.clearEditorFooterSave('],
  ['mountCreateDrawerChrome(', 'shell.mountCreateDrawerChrome('],
  ['appendEmptyDetailPane(', 'shell.appendEmptyDetailPane('],
  ['captureSidebarListScroll(', 'shell.captureSidebarListScroll('],
  ['finishSidebarListScroll(', 'shell.finishSidebarListScroll('],
  ['captureFilterTabsScroll(', 'shell.captureFilterTabsScroll('],
  ['beginCreateDrawer(', 'shell.beginCreateDrawer('],
  ['finishCreateDrawer(', 'shell.finishCreateDrawer('],
  ['flagCreateDrawerTitleMissing(', 'shell.flagCreateDrawerTitleMissing('],
  ['getCreateDrawerPane(', 'shell.getCreateDrawerPane('],
  ['armTitleFocus(', 'shell.armTitleFocus('],
  ['flushTitleFocus(', 'shell.flushTitleFocus('],
  ['mapPaneTitle(', 'shell.mapPaneTitle('],
  ['osAlert(', 'shell.osAlert('],
  ['normalizeTodoItemDates(', 'shell.normalizeTodoItemDates('],
  ['todoSubline(', 'shell.todoSubline('],
  ['attachAutosuggestKeyboardNav(', 'shell.attachAutosuggestKeyboardNav('],
  ['reviewsPendingCount', 'shell.reviewsPendingCount'],
  ['todoState', 'shell.todoState'],
];

let code = body.join('\n');
for (const [from, to] of shellReplacements) {
  code = code.split(from).join(to);
}

const header = `/**
 * Work / projects panel — extracted from os-map-loader.js for maintainability
 * and so the in-app agent can read/edit this file within tool size limits.
 */
import {
  IOS_ICONS,
  createIosIconBtn,
  createCenteredListEmpty,
  listSearchSubheader,
  createSlidingPillSelect,
  createPanelBackBtn,
  createPaneSubheader,
  armTitleFocus,
  requestTitleFocus,
  flushTitleFocus,
  cancelTitleFocus,
  matchesListSearch,
  createSwipeRow,
  closeOpenSwipeRow,
  bindSwipeListScroll,
  swipeAgentAction,
  swipeArchiveAction,
  swipeDeleteAction,
  paneDeleteIcon,
  paneShareIcon,
  setDeBtnLabel,
  getDeBtnLabel,
  updateDeBtnLabel,
} from './admin-ui.js?v=20260728a';
import { escHtml, readAdminJson, readApiJson } from './shared.js?v=20260728a';

/** Injected by os-map-loader via initWorkPanel(). */
let shell = {};

export function initWorkPanel(deps) {
  shell = deps;
}

export { workState };

`;

const exports = `
export {
  loadWorkTab,
  renderWorkEditor,
  openWork,
  navigateToWork,
  navigateToNewWorkFromTodo,
  beginNewProjectDrawer,
  startNewProject,
  flushWorkAutosave,
  createWorkListItem,
  createWorkSwipeRow,
  createClientWorkCard,
  mountClientWorkSection,
  renderClientWorkSection,
  askAgentAboutWork,
  renderWorkLinkTrackStatus,
  refreshWorkLinkTrackStatus,
  getWorkEditor,
  workStatusLabel,
  workStatusClass,
  isWorkArchivedStatus,
};
`;

// Remove duplicate imports from extracted block comments at top of work section
code = code.replace(/^\/\/ ---- work tab ----\n/m, '');

fs.writeFileSync(OUT, header + code + exports);
console.log('Wrote', OUT, 'bytes:', fs.statSync(OUT).size);
