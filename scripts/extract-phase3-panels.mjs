#!/usr/bin/env node
/**
 * Phase 3: extract remaining admin panels from os-map-loader.js.
 * Usage: node scripts/extract-phase3-panels.mjs [--strip]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'public/admin/os-map-loader.js');
const VERSION = '20260728q';

const COMMON_SHELL_FUNCS = [
  'setActiveMap',
  'osAlert',
  'syncFooterNav',
  'beginCreateDrawer',
  'finishCreateDrawer',
  'flagCreateDrawerTitleMissing',
  'isCreateDrawerOpen',
  'getCreateDrawerPane',
  'mountCreateDrawerChrome',
  'setCreateDrawerSubmit',
  'captureSidebarListScroll',
  'finishSidebarListScroll',
  'captureFilterTabsScroll',
  'mountFilterTabsScroll',
  'appendEmptyDetailPane',
  'mapPaneTitle',
  'askAgentWithPrompt',
  'clearEditorFooterSave',
  'setEditorFooterSave',
  'isMobileTabs',
  'companyBrand',
  'titleFromKnowledgeMarkdown',
  'attachAutosuggestKeyboardNav',
  'setFormFieldState',
  'flashFormFieldSaved',
  'handleNotificationOpen',
  'syncAdminDeepLinkUrl',
  'syncReviewBadge',
  'createProjectLinkChip',
  'mountEmailScheduleActions',
  'queueWorkDeepLink',
  'syncFooterChatNav',
  'syncFooterTodoNav',
  'syncFooterInboxNav',
  'syncFooterScheduleNav',
  'syncFooterClientsNav',
  'syncFooterWorkNav',
  'setChatComposeFocused',
  'syncChatComposeViewport',
  'syncChatComposeFormNav',
  'syncAdminSplitView',
  'scanPanelSidebars',
  'syncTopbarPanelContext',
  'buildAgentContentPrompt',
  'navigateToEmail',
  'navigateToClient',
  'navigateToWork',
  'openScheduleTab',
  'openScheduleCreateDialog',
  'scheduleDateKey',
  'confirmScheduledMeeting',
  'runReviewScheduleAction',
  'rescheduleScheduledMeeting',
  'openReviewNotificationTarget',
  'removeEmailRelatedAlertBanners',
  'renderEmailPanel',
  'loadHomeDashboard',
  'initFleetLocationReporter',
  'settingsPanelRoot',
  'prependSettingsBackHeader',
  'showProfileAlert',
  'flushSettingsAutosave',
  'bindSettingsAutosave',
  'profileTimezoneOptions',
  'navIcon',
  'placeholderHtml',
  'scrollSidebarListItemIntoView',
  'syncSearchFieldAdornment',
  'closeSearchOverlay',
  'renderSearchResults',
  'syncSearchOverlayClearBtn',
  'buildSearchResultItem',
  'openSearchOverlay',
  'closeTabDropdowns',
  'syncFooterNavCountTooltips',
  'setAppIconBadge',
  'syncDashboardFooterBadges',
  'buildDashStat',
  'renderHomeDashboard',
  'loadHomeDashboard',
  'syncReviewBadge',
  'reviewsPendingCount',
];

const COMMON_SHELL_VARS = [
  'pendingEmailDeepLinkId',
  'MAP',
  'activeKey',
  'SIDEBAR_LIST_GRIP',
  'KNOWLEDGE_API',
  'reviewsPendingCount',
  'socialRangeDays',
  'fleetMapInstance',
  'fleetPollTimer',
  'AUTOSAVE_DEBOUNCE_MS',
  'FORM_FIELD_SAVED',
  'FORM_FIELD_INVALID',
  'userId',
  'isDeploymentOwnerClient',
];

const COMMON_IMPORTS = `import {
  IOS_ICONS,
  createIosIconBtn,
  createCenteredListEmpty,
  listSearchSubheader,
  listSearchAddNew,
  syncSearchFieldAdornment,
  createSlidingPillSelect,
  createPanelBackBtn,
  createEditableHeaderTitleInput,
  createPaneSubheader,
  wrapEditableHeaderTitle,
  armTitleFocus,
  requestTitleFocus,
  flushTitleFocus,
  cancelTitleFocus,
  matchesListSearch,
  initSidebarLayout,
  syncAdminSplitView,
  scanPanelSidebars,
  attachIosPullToRefresh,
  pullRefreshContentRoot,
  createSwipeRow,
  closeOpenSwipeRow,
  bindSwipeListScroll,
  showContextMenu,
  swipeAgentAction,
  swipeArchiveAction,
  swipeDeleteAction,
  swipeJunkAction,
  swipeReceiptAction,
  swipeClearAction,
  setDeBtnLabel,
  getDeBtnLabel,
  updateDeBtnLabel,
  deBtnIconSvg,
  paneDeleteIcon,
  paneShareIcon,
} from './admin-ui.js?v=${VERSION}';
import { escHtml, adminFetch, readAdminJson, readApiJson, linkifyPlainText } from './shared.js?v=${VERSION}';
import { osAlert, openOsDialogBackdrop, closeOsDialogBackdrop } from './os-dialog.js?v=${VERSION}';`;

const PANELS = [
  {
    file: 'insights-panels.js',
    init: 'initInsightsPanels',
    ranges: [[4066, 4833]],
    extraImports: [
      "import { createFleetMap } from '/admin/fleet-map.js';",
    ],
    exports: [
      'socialRangeDays',
      'loadSocialTab',
      'loadAnalyticsTab',
      'loadFleetTab',
      'loadFleetTabQuiet',
      'initFleetLocationReporter',
    ],
  },
  {
    file: 'create-drawer.js',
    init: 'initCreateDrawer',
    ranges: [[6428, 6759]],
    extraImports: ["import { confirmDiscardChanges } from './clients-panel.js?v=${VERSION}';"],
    exports: [
      'beginCreateDrawer',
      'finishCreateDrawer',
      'flagCreateDrawerTitleMissing',
      'isCreateDrawerOpen',
      'getCreateDrawerPane',
      'mountCreateDrawerChrome',
      'setCreateDrawerSubmit',
    ],
  },
  {
    file: 'newsletter-panel.js',
    init: 'initNewsletterPanel',
    ranges: [[7962, 8258]],
    exports: ['newsletterState', 'loadNewsletterTab', 'getNewsletterEditor'],
  },
  {
    file: 'rules-panel.js',
    init: 'initRulesPanel',
    ranges: [[8260, 8914]],
    extraImports: ["import { confirmDiscardChanges } from './clients-panel.js?v=${VERSION}';"],
    exports: [
      'ruleState',
      'loadRulesTab',
      'getRuleEditor',
      'isRuleExpired',
      'formatRuleExpiresLabel',
      'toRuleDatetimeLocalValue',
      'ruleSubline',
      'startNewRule',
    ],
  },
];

function replaceFnCalls(code, name) {
  return code.replace(new RegExp(`(?<!(?:async )?function )\\b${name}\\(`, 'g'), `shell.${name}(`);
}

function replaceVarRefs(code, name) {
  return code.replace(
    new RegExp(`(?<!(?:let|const|var|function|async function|export ) )\\b${name}\\b`, 'g'),
    `shell.${name}`,
  );
}

function applyShellReplacements(code, panel) {
  for (const fn of COMMON_SHELL_FUNCS) {
    code = replaceFnCalls(code, fn);
  }
  for (const v of COMMON_SHELL_VARS) {
    code = replaceVarRefs(code, v);
  }
  for (const v of panel.localVars || []) {
    code = code.replace(new RegExp(`shell\\.${v}\\b`, 'g'), v);
  }
  return code;
}

function buildPanelFile(panel, lines) {
  const body = [];
  for (const [start, end] of panel.ranges) {
    if (body.length) body.push('');
    body.push(`// ---- extracted from os-map-loader.js:${start}-${end} ----`);
    body.push(...lines.slice(start - 1, end));
  }
  let code = applyShellReplacements(body.join('\n'), panel);

  const extraImports = (panel.extraImports || [])
    .map((line) => line.replace('${VERSION}', VERSION))
    .join('\n');
  const extra = extraImports ? `${extraImports}\n` : '';

  const header = `/**
 * ${panel.file.replace('.js', '').replace(/-/g, ' ')} — extracted from os-map-loader.js
 */
${COMMON_IMPORTS}
${extra}
/** Injected by os-map-loader via ${panel.init}(). */
let shell = {};

export function ${panel.init}(deps) {
  shell = deps;
}

`;

  const exports = `\nexport {\n  ${panel.exports.join(',\n  ')},\n};\n`;
  return header + code + exports;
}

function stripRanges(lines, allRanges) {
  const sorted = [...allRanges].sort((a, b) => b[0] - a[0]);
  let out = [...lines];
  for (const [start, end] of sorted) {
    out.splice(start - 1, end - start + 1);
  }
  return out;
}

const lines = fs.readFileSync(SRC, 'utf8').split('\n');
const allRanges = PANELS.flatMap((p) => p.ranges);

for (const panel of PANELS) {
  const outPath = path.join(ROOT, 'public/admin', panel.file);
  fs.writeFileSync(outPath, buildPanelFile(panel, lines));
  console.log('Wrote', outPath, fs.statSync(outPath).size, 'bytes');
}

if (process.argv.includes('--strip')) {
  const out = stripRanges(lines, allRanges);
  fs.writeFileSync(SRC, out.join('\n'));
  console.log('Stripped loader:', lines.length, '->', out.length, 'lines');
}
