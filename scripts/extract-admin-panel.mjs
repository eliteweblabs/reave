#!/usr/bin/env node
/**
 * Extract admin tab panels from os-map-loader.js into separate modules.
 * Usage: node scripts/extract-admin-panel.mjs [--strip]
 */
import fs from 'node:fs';

const SRC = '/workspace/public/admin/os-map-loader.js';
const VERSION = '20260728i';

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
];

const COMMON_SHELL_VARS = [
  'pendingEmailDeepLinkId',
  'MAP',
  'activeKey',
  'SIDEBAR_LIST_GRIP',
  'KNOWLEDGE_API',
];

const COMMON_IMPORTS = `import {
  IOS_ICONS,
  createIosIconBtn,
  createCenteredListEmpty,
  listSearchSubheader,
  listSearchAddNew,
  createSlidingPillSelect,
  createPanelBackBtn,
  createPaneSubheader,
  wrapEditableHeaderTitle,
  armTitleFocus,
  requestTitleFocus,
  flushTitleFocus,
  cancelTitleFocus,
  matchesListSearch,
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
  paneDeleteIcon,
  paneShareIcon,
  setDeBtnLabel,
  getDeBtnLabel,
  updateDeBtnLabel,
  deBtnIconSvg,
  attachIosPullToRefresh,
  pullRefreshContentRoot,
} from './admin-ui.js?v=${VERSION}';
import { escHtml, adminFetch, readAdminJson, readApiJson, linkifyPlainText } from './shared.js?v=${VERSION}';`;

const PANELS = [
  {
    file: 'todo-panel.js',
    init: 'initTodoPanel',
    ranges: [[8692, 9838]],
    workImports: ['navigateToWork', 'navigateToNewWorkFromTodo'],
    localVars: ['pendingTodoDeepLinkId'],
    navBlock: `
let pendingTodoDeepLinkId = null;

function navigateToTodo(id, opts = {}) {
  if (id == null || id === '') return;
  if (opts.fromWorkSlug) todoState.returnToWorkSlug = opts.fromWorkSlug;
  pendingTodoDeepLinkId = id;
  shell.setActiveMap('todo', { force: true, todoId: id });
}

function navigateToNewTodoForProject(jobSlug) {
  if (!jobSlug) return;
  armTitleFocus('todo');
  beginNewTodoDrawer();
  todoState.returnToWorkSlug = jobSlug;
  todoState.activeId = '__new__';
  todoState.dirty = false;
  todoState.linkedJob = null;
  todoState.draft = {
    title: '',
    priority: 'normal',
    status: 'open',
    due_date: '',
    job_slug: jobSlug,
    assignee: '',
    section: '',
  };
  pendingTodoDeepLinkId = '__new__';
  shell.setActiveMap('todo', { force: true, todoId: '__new__' });
}
`,
    exports: [
      'todoState',
      'loadTodoTab',
      'navigateToTodo',
      'navigateToNewTodoForProject',
      'beginNewTodoDrawer',
      'startNewTodo',
      'normalizeTodoItemDates',
      'todoSubline',
      'flushTodoAutosave',
      'saveActiveTodoDraft',
      'formatTodoDueDate',
    ],
  },
  {
    file: 'documents-panel.js',
    init: 'initDocumentsPanel',
    ranges: [[9840, 10537], [17287, 17322]],
    workImports: [],
    exports: [
      'docState',
      'loadDocumentsTab',
      'createDocumentListItem',
      'createDocumentSwipeRow',
      'askAgentAboutDocument',
    ],
    localClamp: true,
  },
  {
    file: 'knowledge-panel.js',
    init: 'initKnowledgePanel',
    ranges: [[10558, 11068], [17239, 17252], [17324, 17352]],
    workImports: [],
    exports: [
      'knowledgeState',
      'loadKnowledgeTab',
      'createKnowledgeListItem',
      'createKnowledgeSwipeRow',
      'askAgentAboutKnowledge',
    ],
  },
  {
    file: 'schedule-panel.js',
    init: 'initSchedulePanel',
    ranges: [[11070, 13088]],
    workImports: ['navigateToWork'],
    exports: ['scheduleState', 'loadScheduleTab'],
  },
  {
    file: 'clients-panel.js',
    init: 'initClientsPanel',
    ranges: [[13090, 14743], [17355, 17381]],
    workImports: ['navigateToWork', 'mountClientWorkSection'],
    extraImports: ["import { createClientMap } from '/admin/client-map.js';"],
    localVars: ['pendingClientDeepLinkUid'],
    navBlock: `
let pendingClientDeepLinkUid = null;

function parseClientDeepLinkFromUrl() {
  try {
    return new URLSearchParams(window.location.search).get('client')?.trim() || null;
  } catch {
    return null;
  }
}

function navigateToClient(uid) {
  if (!uid) return;
  pendingClientDeepLinkUid = uid;
  shell.setActiveMap('clients', { force: true, clientUid: uid });
}
`,
    exports: [
      'clientState',
      'loadClientsTab',
      'navigateToClient',
      'createClientListItem',
      'createClientSwipeRow',
      'parseClientDeepLinkFromUrl',
    ],
  },
  {
    file: 'chat-panel.js',
    init: 'initChatPanel',
    ranges: [[14745, 16533]],
    workImports: ['navigateToWork', 'refreshWorkLinkTrackStatus'],
    localVars: ['pendingChatDeepLinkId'],
    navBlock: `
let pendingChatDeepLinkId = null;

function parseChatDeepLinkFromUrl() {
  try {
    return new URLSearchParams(window.location.search).get('chat')?.trim() || null;
  } catch {
    return null;
  }
}

function navigateToChat(id) {
  if (!id) return;
  pendingChatDeepLinkId = id;
  shell.setActiveMap('chats', { force: true, chatId: id, keepChatSession: true });
}

/** Called from os-map-loader activateMapPanel when switching tabs with a chat id. */
function queueChatDeepLink(id) {
  pendingChatDeepLinkId = id;
}
`,
    exports: [
      'chatState',
      'loadChatsTab',
      'navigateToChat',
      'renderChatPanel',
      'parseChatDeepLinkFromUrl',
      'syncChatRunningPoll',
      'stopChatRunningPoll',
      'showChatToast',
      'copyChatText',
      'formatChatDate',
      'finalizeChatTitleIfNeeded',
      'abandonDisposableChat',
      'fetchChatThreads',
      'createHeaderChatTitle',
      'deleteChat',
      'createPortalShareBtn',
      'renderLinkTrackStatus',
      'sharePortalLink',
      'queueChatDeepLink',
    ],
  },
];

function replaceFnCalls(code, name) {
  return code.replace(new RegExp(`(?<!(?:async )?function )\\b${name}\\(`, 'g'), `shell.${name}(`);
}

function replaceVarRefs(code, name) {
  return code.replace(
    new RegExp(`(?<!(?:let|const|var|function|async function) )\\b${name}\\b`, 'g'),
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
  if (panel.localClamp) {
    code = `const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));\n\n${code}`;
  }
  if (panel.navBlock) {
    code += panel.navBlock;
  }

  const workImportLine = panel.workImports?.length
    ? `import { ${panel.workImports.join(', ')} } from './work-panel.js?v=${VERSION}';\n`
    : '';
  const extraImports = (panel.extraImports || []).join('\n');
  const extra = extraImports ? `${extraImports}\n` : '';

  const header = `/**
 * ${panel.file.replace('.js', '').replace(/-/g, ' ')} — extracted from os-map-loader.js
 */
${COMMON_IMPORTS}
${workImportLine}${extra}
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
  const outPath = `/workspace/public/admin/${panel.file}`;
  fs.writeFileSync(outPath, buildPanelFile(panel, lines));
  console.log('Wrote', outPath, fs.statSync(outPath).size, 'bytes');
}

if (process.argv.includes('--strip')) {
  const linkifyRange = [10538, 10556];
  const out = stripRanges(lines, [...allRanges, linkifyRange]);
  fs.writeFileSync(SRC, out.join('\n'));
  console.log('Stripped loader:', lines.length, '->', out.length, 'lines');
}
