import { MAPS, SYSTEM_MAP_KEYS, SYSTEM_TAB_SLOT, CHAT_MAP_KEYS, CHAT_TAB_SLOT, isSpecialAdminPage } from '/admin/os-map-data.js';
import { createClientMap } from '/admin/client-map.js?v=20260804b';
import { mountCompanyBrandFontPickers } from '/admin/brand-font-picker.js';
import { postTitle, postLower, postNew, postSave, postTitleLabel, postAlias, postCountLabel } from '/admin/post-alias.js?v=20260805a';

function companyBrand() {
  return (
    window.__companyBrand || {
      name: 'Business OS',
      domain: window.location.hostname,
      siteUrl: `${window.location.origin}/`,
      inboundEmailExample: 'inbox@mail.example.com',
      projectLabel: 'Business OS App',
    }
  );
}

function applyCompanyBrandingToMaps() {
  const brand = companyBrand();
  const domain = brand.domain || window.location.hostname;
  const projectLabel = brand.projectLabel || `${brand.name} App`;
  const domainPlaceholder = /(?:reave|example)\.app/g;
  for (const map of Object.values(MAPS)) {
    for (const node of map.nodes || []) {
      if (typeof node.sub === 'string') {
        node.sub = node.sub
          .replace(domainPlaceholder, domain)
          .replace(/ap\.(?:reave|example)\.app/g, domain ? `ap.${domain}` : 'ap.example.com')
          .replace(/cal\.(?:reave|example)\.app/g, domain ? `cal.${domain}` : 'cal.example.com');
        const githubRepo = window.__githubRepo?.trim();
        if (githubRepo) {
          node.sub = node.sub.replace(/[\w.-]+\/[\w.-]+(?= · REST)/, githubRepo);
        }
      }
      if (typeof node.title === 'string') {
        node.title = node.title
          .replace(/Reave App/g, projectLabel)
          .replace(/^Production app$/, projectLabel);
      }
    }
    for (const group of map.groups || []) {
      if (typeof group.title === 'string') {
        group.title = group.title
          .replace(/Reave App/g, projectLabel)
          .replace(/^Railway — App$/, `Railway — ${projectLabel}`);
      }
    }
  }
  if (MAPS.work) {
    MAPS.work.title = postTitle(2);
  }
  if (MAPS.finance) {
    const crater = window.__craterFinanceUrl?.trim().replace(/\/$/, '');
    if (crater) MAPS.finance.link = crater;
    else if (domain) MAPS.finance.link = `https://ap.${domain}`;
  }
}

applyCompanyBrandingToMaps();
import {
  IOS_ICONS,
  agentIconSvg,
  createIosIconBtn,
  createBrandBtn,
  createCenteredListEmpty,
  listSearchSubheader,
  listSearchAddNew,
  syncSearchFieldAdornment,
  attachSlashSearchHint,
  focusVisibleListSearch,
  createSlidingPillSelect,
  createPanelBackBtn,
  syncAppHeaderBack,
  createEditableHeaderTitleInput,
  wrapEditableHeaderTitle,
  armTitleFocus,
  requestTitleFocus,
  flushTitleFocus,
  cancelTitleFocus,
  matchesListSearch,
  initSidebarLayout,
  syncAdminSplitView,
  scanPanelSidebars,
  isAdminPaneMobile,
  ADMIN_PANE_MQ,
  attachIosPullToRefresh,
  pullRefreshContentRoot,
  createSwipeRow,
  closeOpenSwipeRow,
  bindSwipeListScroll,
  bindListMultiSelect,
  isListInSelectionMode,
  resyncListMultiSelect,
  showContextMenu,
  swipeAgentAction,
  swipeArchiveAction,
  swipeDeleteAction,
  swipeJunkAction,
  swipeReceiptAction,
  swipeClearAction,
  swipeCopyAction,
  setDeBtnLabel,
  getDeBtnLabel,
  updateDeBtnLabel,
  deBtnIconSvg,
  paneDeleteIcon,
  paneShareIcon,
  showCopyButtonFeedback,
  createCopyIconBtn,
  createToggleSwitch,
  setToggleSwitch,
  bindConfirmDeleteButton,
  iosIcon,
} from './admin-ui.js?v=20260825h';
import { createPaneHeader } from './pane-header.js?v=20260821c';
import { installPwaNavGuard } from './push-client.js?v=20260811a';
import {
  buildAdminNotice,
  appendAdminNoticeAction,
  NOTICE_ACTION_ICONS,
} from './admin-notice.js?v=20260825c';
import { escHtml, adminFetch, readAdminJson, readApiJson, linkifyPlainText, parseTodoDueInstant, isUtcDateOnlyInstant, formatTodoDueTime, TODO_PRIORITY_LABELS, mountPanelSkeleton, resolveReviewAlertIconUrl, companyStaffAvatarUrl, bindClerkSsrSessionSync, emailListAuthorIconHtml, ensureContactAuthorIconsReady, formatPhoneInput, phoneToStorage, isValidPhone, bindFormattedPhoneInputs } from './shared.js?v=20260810a';
import {
  captureFilterTabsScroll,
  mountFilterTabsScroll,
  mountListFilterTabsWrap,
  applyEmailFilterTabsScroll,
  shouldCenterEmailFilterTab,
} from './filter-tabs.js?v=20260826a';
import { osAlert, osConfirm, openOsDialogBackdrop, closeOsDialogBackdrop, bindOsDialogDismiss, bindOsDialogKeyboardLayout, releaseOsDialogKeyboardLayout, scheduleOsDialogFieldFocus } from './os-dialog.js?v=20260826a';
import {
  initWorkPanel,
  workState,
  loadWorkTab,
  navigateToWork,
  navigateToNewWorkFromTodo,
  startNewProject,
  refreshWorkLinkTrackStatus,
  mountClientWorkSection,
  queueWorkDeepLink,
  workStatusLabel,
  workClientSubline,
  syncWorkAuditingPoll,
  stopWorkAuditingPoll,
} from './work-panel.js?v=20260826c';
import {
  initTodoPanel,
  todoState,
  loadTodoTab,
  navigateToTodo,
  navigateToNewTodoForProject,
  normalizeTodoItemDates,
  todoSubline,
  flushTodoAutosave,
  saveActiveTodoDraft,
  formatTodoDueDate,
  startNewTodo,
} from './todo-panel.js?v=20260824a';
import {
  initDocumentsPanel,
  docState,
  loadDocumentsTab,
} from './documents-panel.js?v=20260824a';
import {
  initKnowledgePanel,
  knowledgeState,
  loadKnowledgeTab,
} from './knowledge-panel.js?v=20260824a';
import {
  initSchedulePanel,
  scheduleState,
  loadScheduleTab,
  formatScheduleWhen,
  openScheduleTab,
  scheduleTodayKey,
  scheduleEnsureFocusDate,
  scheduleOpenCreateDialog,
  readScheduleLastAddress,
  rememberScheduleAddress,
  mountScheduleAddressAutocomplete,
  isScheduleAddressError,
  isAddressPickerSheetOpen,
  ensureScheduleAddress,
  scheduleDateKey,
  openScheduleCreateDialog,
  mountAddressAutocomplete,
} from './schedule-panel.js?v=20260824a';
import { loadLeadScannerTab } from './lead-scanner-panel.js?v=20260802h';
import {
  initClientsPanel,
  clientState,
  loadClientsTab,
  navigateToClient,
  navigateToNewClient,
  resumeClientDetailFromUrl,
  parseClientDeepLinkFromUrl,
  geocodeClientAddressPreview,
  startNewClient,
  confirmDiscardChanges,
} from './clients-panel.js?v=20260824a';
import {
  ensureShakePermission,
  flushShakeUndoCommit,
  isShakeUndoPendingKey,
  pendingShakeUndoKey,
  queueShakeUndo,
  queueUndoableDelete,
  filterHiddenUntilCommit,
} from './shake-undo.js?v=20260824a';
import {
  initChatPanel,
  chatState,
  loadChatsTab,
  navigateToChat,
  renderChatPanel,
  syncChatRunningPoll,
  stopChatRunningPoll,
  showChatToast,
  copyChatText,
  formatChatDate,
  finalizeChatTitleIfNeeded,
  abandonDisposableChat,
  fetchChatThreads,
  createHeaderChatTitle,
  deleteChat,
  createPortalShareBtn,
  renderLinkTrackStatus,
  renderShareSendLog,
  sharePortalLink,
  queueChatDeepLink,
  parseChatDeepLinkFromUrl,
  startNewChat,
  getChatPanel,
  clearChatLastActiveId,
  chatMsgPlainText,
  shareChatText,
  archiveChat,
  openChat,
  isDefaultSessionTitle,
  displaySessionTitle,
  DEFAULT_SESSION_TITLE,
} from './chat-panel.js?v=20260824a';
import {
  initCreateDrawer,
  beginCreateDrawer,
  finishCreateDrawer,
  flagCreateDrawerTitleMissing,
  isCreateDrawerOpen,
  getCreateDrawerPane,
  mountCreateDrawerChrome,
  setCreateDrawerSubmit,
} from './create-drawer.js?v=20260824a';
import {
  initInsightsPanels,
  loadSocialTab,
  loadAnalyticsTab,
  loadFleetTab,
  initFleetLocationReporter,
  teardownFleetMap,
} from './insights-panels.js?v=20260825a';
import {
  initRulesPanel,
  ruleState,
  loadRulesTab,
  openRulesLabWithEmail,
  openRulesLabWithRule,
  startNewRule,
  showKeywordCollisionAlert,
} from './rules-panel.js?v=20260826a';
import {
  initNewsletterPanel,
  loadNewsletterTab,
} from './newsletter-panel.js?v=20260728q';
import {
  initOnlineReviewsPanel,
  loadOnlineReviewsTab,
} from './online-reviews-panel.js?v=20260813a';
import {
  initMediaPanel,
  loadMediaTab,
} from './media-panel.js?v=20260826a';
import {
  initModulesPanel,
  loadModulesTab,
  teardownModulesPanel,
  parseModuleDeepLinkFromUrl,
} from './modules-panel.js?v=20260824g';
import {
  initAddonsPanel,
  loadAddonsTab,
} from './addons-panel.js?v=20260824f';
import {
  initCatalogPanel,
} from './catalog-panel.js?v=20260823b';
import {
  openMediaPicker,
  brandingMediaFilter,
  brandingRasterMediaFilter,
  applyMediaToTarget,
} from './media-picker.js?v=20260813b';
import { bindProfileSignatureEditor } from './profile-signature-editor.js?v=20260820a';

const GRID = 12;
const STORE = 'os-map-pos-v2';
const MAP_STORE = 'os-map-active-v1';
const TAB_ORDER_STORE = 'os-map-tab-order-v1';
const SYSTEM_MAP_SET = new Set(SYSTEM_MAP_KEYS);
const CHAT_MAP_SET = new Set(CHAT_MAP_KEYS);
const MOBILE_TABS_MQ = window.matchMedia('(max-width: 639px)');
const COMPACT_TABS_MQ = window.matchMedia('(max-width: 1280px)');
export const userId = document.body?.dataset?.userId?.trim() || '';
const isDeploymentOwnerClient = document.body?.dataset?.isOwner === '1';
const KNOWLEDGE_API = '/api/admin/knowledge';
// Drag-to-reorder grip — disabled; restore when re-enabling attachSidebarListReorder.
// const SIDEBAR_LIST_GRIP =
//   '<span class="td-list-grip" aria-hidden="true" title="Drag to reorder">⋮⋮</span>';
const SIDEBAR_LIST_GRIP = '';
const SVGNS = 'http://www.w3.org/2000/svg';

function titleFromKnowledgeMarkdown(content, slug) {
  const first = content.split('\n').find((l) => l.trim().length > 0) ?? '';
  const fromHeading = first.replace(/^#\s*/, '').trim();
  if (fromHeading) return fromHeading.slice(0, 200);
  return slug.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
const PINCH_ZOOM = true;

// Real brand logos via Simple Icons (https://simpleicons.org), pinned to a
// major version. We render the SVG as a CSS mask so each glyph can be tinted to
// its node's hue, keeping the full-spectrum look on the dark canvas.
// Some brands were removed in later releases (trademark takedowns) — pin the
// last release that still shipped each one so icons don't 404 on the CDN.
const SIMPLE_ICONS_PINNED = {
  linkedin: '13.19.0',
};
const ICON_CDN = (slug) => {
  const version = SIMPLE_ICONS_PINNED[slug] || 'v16';
  return `https://cdn.jsdelivr.net/npm/simple-icons@${version}/icons/${slug}.svg`;
};

const MAP_ICON_KEYS = {
  dashboard: 'layout-dashboard',
  system: 'monitor',
  tooling: 'wrench',
  'email-triage': 'git-branch',
  todo: 'check-square',
  documents: 'file-text',
  knowledge: 'book-open',
  chats: 'agent',
  email: 'mail',
  rules: 'flask',
  newsletter: 'send',
  work: 'briefcase',
  schedule: 'calendar',
  clients: 'users',
  social: 'share',
  reviews: 'star',
  media: 'image',
  analytics: 'bar-chart-2',
  fleet: 'truck',
  modules: 'puzzle',
  finance: 'wallet',
  profile: 'user',
  company: 'building-2',
  settings: 'settings',
  socials: 'link-2',
  industries: 'target',
  vapi: 'mic',
  'lead-scanner': 'radar',
  deploy: 'sparkles',
  'sales-sheet': 'receipt',
};

/** Admin settings pages — one map tab per section. */
const SETTINGS_MAP_TYPES = new Set([
  'profile',
  'company',
  'settings',
  'socials',
  'addons',
  'industries',
  'vapi',
  'lead-scanner',
]);

function installFooterNav() {
  const nav = window.__installConfig?.footerNav;
  return Array.isArray(nav) && nav.length ? nav : null;
}

function normalizeFooterNavKeys(keys) {
  const result = [];
  for (const raw of keys) {
    if (typeof raw !== 'string') continue;
    if (raw === SYSTEM_TAB_SLOT || SYSTEM_MAP_SET.has(raw)) {
      if (!result.includes(SYSTEM_TAB_SLOT)) result.push(SYSTEM_TAB_SLOT);
      continue;
    }
    if (raw === CHAT_TAB_SLOT) {
      if (!result.includes(CHAT_TAB_SLOT)) result.push(CHAT_TAB_SLOT);
      continue;
    }
    const mapKey = resolveMapKey(raw);
    if (MAPS[mapKey] && !result.includes(mapKey)) result.push(mapKey);
  }
  return result.length ? result : [SYSTEM_TAB_SLOT, 'dashboard'];
}

function isSettingsMapType(type) {
  return SETTINGS_MAP_TYPES.has(type);
}

function settingsPanelRoot() {
  return document.getElementById('settings-panel');
}

function settingsPanelHasFocusedInput() {
  const root = settingsPanelRoot();
  if (!root) return false;
  const active = document.activeElement;
  return (
    active instanceof HTMLElement &&
    root.contains(active) &&
    (active.matches('input:not([type=hidden]), textarea, select') || active.isContentEditable)
  );
}

/** Dashboard tiles that live in the footer nav — omit from the grid. */
const DASHBOARD_FOOTER_KEYS = new Set(['chats', 'email', 'work', 'schedule', 'clients']);

const LEGACY_EMOJI_ICON = {
  '🔔': 'bell',
  '📊': 'database',
  '💬': 'agent',
  '📋': 'file-text',
  '⚡': 'zap',
  '🧪': 'flask',
  '📚': 'book-open',
  '🔧': 'wrench',
  '👥': 'users',
  '✈️': 'send',
  '🖥️': 'monitor',
  '📄': 'file-text',
  '📬': 'mail',
  '💼': 'briefcase',
  '✅': 'check-square',
  '🔀': 'git-branch',
  '🔑': 'key',
  '📅': 'calendar',
  '❓': 'help-circle',
  '📎': 'paperclip',
  '⭐': 'star',
  '🖼️': 'image',
  '📈': 'bar-chart-2',
};

const NAV_ICON_PATHS = {
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  'layout-dashboard': '<rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>',
  'message-circle': '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
  mail: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  monitor: '<rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/>',
  wrench: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
  send: '<path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"/><path d="m21.854 2.147-10.94 10.939"/>',
  'check-square': '<path d="M21 10.5V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h12.5"/><path d="m9 11 3 3L22 4"/>',
  square: '<rect width="18" height="18" x="3" y="3" rx="2"/>',
  'file-text': '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
  'book-open': '<path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/>',
  zap: '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>',
  flask: '<path d="M10 2v7.527a2 2 0 0 1-.211.896L4.72 20.55a1 1 0 0 0 .9 1.45h12.76a1 1 0 0 0 .9-1.45l-5.069-10.127A2 2 0 0 1 14 9.527V2"/><path d="M8.5 2h7"/><path d="M7 16h10"/>',
  briefcase: '<path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/><rect width="20" height="14" x="2" y="6" rx="2"/>',
  /* IOS_ICONS.calendar — keep in sync with public/admin/admin-ui.js */
  calendar: '<rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/>',
  'calendar-check':
    '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/><path d="m9 16 2 2 4-4"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  'trending-up': '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>',
  'trending-down': '<polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/><polyline points="16 17 22 17 22 11"/>',
  wallet: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
  database: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/>',
  'help-circle': '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
  'external-link': '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  'alert-triangle': '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  key: '<path d="m15.5 7.5 2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4"/><path d="m21 2-9.6 9.6"/><circle cx="7.5" cy="15.5" r="5.5"/><path d="M10.5 13.5 7 17"/>',
  eye: '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>',
  phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>',
  user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  archive: '<rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/>',
  receipt:
    '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 17.5v-11"/>',
  'chevron-right': '<path d="m9 18 6-6-6-6"/>',
  puzzle:
    '<path d="M15.39 4.39a1 1 0 0 0 1.68-.474 2.5 2.5 0 1 1 3.014 3.015 1 1 0 0 0-.474 1.68l1.683 1.682a2.414 2.414 0 0 1 0 3.414L19.61 15.39a1 1 0 0 1-1.68-.474 2.5 2.5 0 1 0-3.014 3.015 1 1 0 0 1 .474 1.68l-1.683 1.682a2.414 2.414 0 0 1-3.414 0L8.61 19.61a1 1 0 0 0-1.68.474 2.5 2.5 0 1 1-3.014-3.015 1 1 0 0 0 .474-1.68l-1.683-1.682a2.414 2.414 0 0 1 0-3.414L4.39 8.61a1 1 0 0 1 1.68.474 2.5 2.5 0 1 0 3.014-3.015 1 1 0 0 1-.474-1.68l1.683-1.682a2.414 2.414 0 0 1 3.414 0z"/>',
  settings:
    '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  'git-branch':
    '<line x1="6" x2="6" y1="3" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>',
  paperclip:
    '<path d="m16 6-8.414 8.586a2 2 0 0 0 2.829 2.829l8.414-8.586a4 4 0 1 0-5.657-5.657l-8.379 8.551a6 6 0 1 0 8.485 8.485l8.586-8.414"/>',
  /* IOS_ICONS.sparkles — keep in sync with public/admin/admin-ui.js */
  sparkles:
    '<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/><path d="M4 17v2"/><path d="M5 18H3"/>',
  /* IOS_ICONS.image — keep in sync with public/admin/admin-ui.js */
  image:
    '<rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
  /* IOS_ICONS.star — keep in sync with public/admin/admin-ui.js */
  star: '<path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"/>',
  /* IOS_ICONS.bar-chart-2 — keep in sync with public/admin/admin-ui.js */
  'bar-chart-2':
    '<path d="M6 20v-6"/><path d="M12 20V4"/><path d="M18 20V10"/>',
  /* IOS_ICONS.share — keep in sync with public/admin/admin-ui.js */
  share:
    '<path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/>',
  /* IOS_ICONS.truck — keep in sync with public/admin/admin-ui.js */
  truck:
    '<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/>',
};

export function navIcon(name, size = 20) {
  if (name === 'agent') return agentIconSvg(size);
  const paths = NAV_ICON_PATHS[name];
  if (!paths) return '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
}

function mapIconName(key) {
  return MAP_ICON_KEYS[key] || 'monitor';
}

function chipIconName(n) {
  if (n._checked !== undefined) return n._checked ? 'check-square' : 'square';
  return LEGACY_EMOJI_ICON[n.icon] || null;
}

function chipHtml(n) {
  if (n.brand) {
    return `<span class="chip brand"><i class="bi" style="--icon:url('${ICON_CDN(n.brand)}')"></i></span>`;
  }
  const iconKey = chipIconName(n);
  if (iconKey) {
    return `<span class="chip chip-svg">${navIcon(iconKey, 14)}</span>`;
  }
  return `<span class="chip">${n.icon ?? '•'}</span>`;
}

export function placeholderHtml(iconName, bodyHtml) {
  return `<div class="de-placeholder-icon">${navIcon(iconName, 40)}</div>${bodyHtml}`;
}

/** Detail-pane empty state — icon, message, optional Create New action (matches to-do). */
function createDetailEmptyPlaceholder({ iconName, bodyHtml, btnLabel = 'Create New', onCreate, extra }) {
  const placeholder = document.createElement('div');
  placeholder.className = 'de-placeholder';
  placeholder.innerHTML = placeholderHtml(iconName, bodyHtml);
  if (onCreate) {
    placeholder.appendChild(
      createBrandBtn({
        variant: 'filled',
        label: btnLabel,
        className: 'de-placeholder-create-btn',
        onClick: () => onCreate(),
      }),
    );
  }
  if (extra) placeholder.appendChild(extra);
  return placeholder;
}

function mapPaneTitle(mapKey) {
  return MAPS[mapKey]?.title || mapKey || '';
}

/** Empty detail pane: subheader title + centered placeholder with create action. */
function appendEmptyDetailPane(pane, { mapKey, iconName, bodyHtml, btnLabel = 'Create New', onCreate, extra }) {
  pane.appendChild(createPaneHeader({ title: mapPaneTitle(mapKey) }).root);
  const body = document.createElement('div');
  body.className = 'de-pane-empty-body';
  body.appendChild(createDetailEmptyPlaceholder({ iconName, bodyHtml, btnLabel, onCreate, extra }));
  pane.appendChild(body);
}

export function scrollSidebarListItemIntoView(list, itemEl) {
  const row = itemEl.closest('.swipe-row') || itemEl;
  const listRect = list.getBoundingClientRect();
  const rowRect = row.getBoundingClientRect();
  const padding = 8;
  if (rowRect.top >= listRect.top + padding && rowRect.bottom <= listRect.bottom - padding) return;
  if (rowRect.top < listRect.top) {
    list.scrollTop += rowRect.top - listRect.top - padding;
  } else if (rowRect.bottom > listRect.bottom) {
    list.scrollTop += rowRect.bottom - listRect.bottom + padding;
  }
}

function captureSidebarListScroll(root) {
  return root?.querySelector('.ch-sidebar .ch-list')?.scrollTop ?? 0;
}

function finishSidebarListScroll(root, savedScrollTop = 0) {
  const list = root?.querySelector('.ch-sidebar .ch-list');
  if (!list) return;
  if (savedScrollTop > 0) list.scrollTop = savedScrollTop;
  requestAnimationFrame(() => {
    if (isListInSelectionMode(list)) return;
    const activeEl = list.querySelector('.ch-list-item.active, .em-list-item.active');
    if (activeEl) scrollSidebarListItemIntoView(list, activeEl);
  });
}

// Shared arrow-key navigation for autosuggest dropdowns.
function attachAutosuggestKeyboardNav(input, dropdown, options = {}) {
  if (!input || !dropdown) return () => {};
  const optionSelector = options.optionSelector || 'button';
  const onClose = typeof options.onClose === 'function' ? options.onClose : null;

  function isOpen() {
    // Fixed-position dropdowns have offsetParent === null; display is the source of truth.
    return dropdown.style.display !== 'none';
  }
  function getOptions() {
    return [...dropdown.querySelectorAll(optionSelector)].filter((el) => !el.disabled);
  }
  function setActive(opts, idx) {
    opts.forEach((el, i) => el.classList.toggle('active', i === idx));
    if (idx >= 0) opts[idx]?.scrollIntoView({ block: 'nearest' });
  }
  const onKeyDown = (ev) => {
    if (!isOpen()) return;
    const opts = getOptions();
    if (!opts.length) return;
    const currentIdx = opts.findIndex((el) => el.classList.contains('active'));
    if (ev.key === 'ArrowDown') {
      ev.preventDefault();
      setActive(opts, currentIdx < 0 ? 0 : (currentIdx + 1) % opts.length);
    } else if (ev.key === 'ArrowUp') {
      ev.preventDefault();
      setActive(opts, currentIdx <= 0 ? opts.length - 1 : currentIdx - 1);
    } else if (ev.key === 'Enter') {
      if (currentIdx >= 0) {
        ev.preventDefault();
        opts[currentIdx].click();
      }
    } else if (ev.key === 'Escape') {
      if (onClose) {
        ev.preventDefault();
        onClose();
      }
    }
  };
  input.addEventListener('keydown', onKeyDown);
  return () => input.removeEventListener('keydown', onKeyDown);
}

function todoChipHtml(checked) {
  return navIcon(checked ? 'check-square' : 'square', 14);
}

const wrap = document.getElementById('wrap');
const world = document.getElementById('world');
const edgesSvg = document.getElementById('edges');

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const snap = (v) => Math.round(v / GRID) * GRID;

let z = 1;
let panX = 0;
let panY = 0;

// ---- live health (System tab only) ----
const HEALTH_URL = '/api/health';
const HEALTH_INTERVAL_MS = 20000;
const STATUS_LABELS = {
  up: 'Online',
  down: 'Down',
  degraded: 'Degraded',
  configured: 'Configured',
  unconfigured: 'Not set',
  unknown: 'Unknown',
};
let healthTimer = null;
let healthAbort = null;
let lastChecked = null;

// ---- active map state (rebuilt on tab switch) ----
let activeKey = loadActiveKey();
let MAP = MAPS[activeKey];
let cachedTabOrder = null;
let searchOverlayOpen = false;
let searchDebounceTimer = null;
let footerNavCollapsed = false;
let footerIndicatorDragging = false;
let footerIndicatorSuppressClick = false;
let byId = new Map();
let nodeEls = new Map();
let edgeEls = [];
let labelEls = [];
let groupEls = new Map();

function storeKey() {
  return `${STORE}:${activeKey}`;
}

// ---- build the active map into the world ----
function buildMap() {
  byId = new Map();
  nodeEls = new Map();
  edgeEls = [];
  labelEls = [];
  groupEls = new Map();

  // Clear everything except the persistent <svg id="edges">.
  for (const child of Array.from(world.children)) {
    if (child !== edgesSvg) world.removeChild(child);
  }
  while (edgesSvg.firstChild) edgesSvg.removeChild(edgesSvg.firstChild);

  MAP.nodes.forEach((n) => byId.set(n.id, { ...n }));
  loadPositions();

  // groups
  for (const g of MAP.groups) {
    const el = document.createElement('div');
    el.className = 'group';
    el.style.setProperty('--h', g.hue);
    const label = document.createElement('div');
    label.className = 'g-label';
    label.textContent = g.title;
    el.appendChild(label);
    world.appendChild(el);
    groupEls.set(g.id, el);
    attachGroupDrag(g, label);
  }

  // edges (paths + labels)
  for (const e of MAP.edges) {
    const path = document.createElementNS(SVGNS, 'path');
    path.setAttribute('class', `edge${e.dashed ? '' : ' solid'}`);
    const hue = (byId.get(e.from) || {}).hue ?? 210;
    path.setAttribute('stroke', `hsl(${hue} 80% 62% / ${e.ghost ? 0.4 : 0.9})`);
    edgesSvg.appendChild(path);
    edgeEls.push({ e, path });

    if (e.label) {
      const lab = document.createElement('div');
      lab.className = 'elabel';
      lab.textContent = e.label;
      world.appendChild(lab);
      labelEls.push({ e, lab });
    }
  }

  // nodes
  for (const n of byId.values()) {
    const el = document.createElement('div');
    el.className = `node${n.ghost ? ' ghost' : ''}${n.cls ? ` ${n.cls}` : ''}`;
    el.style.setProperty('--h', n.hue);
    if (n.wide) el.style.width = `${n.wide}px`;
    el.style.left = `${n.x}px`;
    el.style.top = `${n.y}px`;
    el.innerHTML = `
      ${n.badge ? `<div class="rule-badge">${n.badge}</div>` : ''}
      <div class="row">
        ${chipHtml(n)}
        <span class="ttl">${n.title}</span>
      </div>
      ${n.sub ? `<div class="sub${n.subMultiline ? ' sub-multi' : ''}">${n.sub}</div>` : ''}
      ${n.status ? `<div class="status st-checking" data-st="${n.id}">Checking…</div>` : ''}
    `;
    world.appendChild(el);
    nodeEls.set(n.id, el);
    attachDrag(n, el);
  }

  buildLegend();
  syncModelNodeLabels();
}

function showIndustries() {
  return window.__installConfig?.showIndustries === true;
}

function setActiveMap(key, opts = {}) {
  if (key === 'industries' && !showIndustries()) {
    key = 'dashboard';
    opts = { ...opts, force: true };
  }
  if (key === 'catalog') {
    key = 'modules';
    opts = { ...opts, force: true };
  }
  let force = opts.force === true;
  if (force && key === activeKey && isSettingsMapType(MAPS[key]?.type)) {
    force = false;
  }
  if (!MAPS[key]) return;
  if (key === activeKey && !force) {
    updateTabs();
    return;
  }
  const prevType = MAP?.type;
  expandFooterNav();
  activeKey = key;
  MAP = MAPS[key];
  saveActiveKey();
  closeTabDropdowns();
  updateTabs();
  syncCanvasVisibility();
  syncModelSelectorVisibility();
  if (key !== 'search') closeSearchOverlay();
  if (prevType === 'email' && MAP.type !== 'email') clearInboxSessionDots();
  if (prevType === 'fleet' && MAP.type !== 'fleet') {
    teardownFleetMap();
  }
  if (prevType === 'modules' && MAP.type !== 'modules') {
    teardownModulesPanel();
  }
  activateMapPanel(opts);
  syncHealthLifecycle();
  syncEmailPoll();
  syncChatRunningPoll();
  syncWorkAuditingPoll();
  syncFooterNav();
  syncProfileMenuActive();
  syncTopbarPanelContext();
  syncSpecialPageChrome();
  syncAppHeaderBack();
  syncAdminSplitView(MAP?.type);
  if (prevType === 'email' && MAP.type !== 'email' && emailState.composing) {
    void leaveEmailCompose();
  } else if (MAP.type !== 'email') {
    emailState.composing = false;
  }
  if (key !== 'chats') {
    setChatComposeFocused(false);
    if (prevType === 'chats' && !chatState.sending) {
      void finalizeChatTitleIfNeeded(chatState.activeId).then(() =>
        abandonDisposableChat(chatState.activeId),
      );
    }
  }
  syncAdminTabUrl(key, opts);
  if (key === 'dashboard' && prevType !== 'dashboard') void refreshInboxBadgeQuiet();
}

function dashboardPanelHasContent() {
  const root = document.getElementById('dashboard-panel');
  return Boolean(
    root?.querySelector(
      '.home-dashboard-scroll .dash-today, .home-dashboard-scroll .home-dashboard-grid',
    ),
  );
}

function isPanelMapKey(key) {
  const t = MAPS[key]?.type;
  return (
    isSettingsMapType(t) ||
    t === 'dashboard' ||
    t === 'documents' ||
    t === 'knowledge' ||
    t === 'work' ||
    t === 'clients' ||
    t === 'social' ||
    t === 'reviews' ||
    t === 'media' ||
    t === 'analytics' ||
    t === 'fleet' ||
    t === 'modules' ||
    t === 'chats' ||
    t === 'email' ||
    t === 'todo' ||
    t === 'rules' ||
    t === 'newsletter'
  );
}

function activateMapPanel(opts = {}) {
  if (MAP.type === 'dashboard') {
    if (dashboardPanelHasContent() && !opts.refreshDashboard) {
      void refreshInboxBadgeQuiet(true);
    } else {
      loadAdminDashboard({ quiet: dashboardPanelHasContent() });
    }
  } else if (MAP.type === 'profile') {
    loadProfileTab();
  } else if (MAP.type === 'company') {
    loadCompanyTab();
  } else if (MAP.type === 'settings') {
    loadAppSettingsTab();
  } else if (MAP.type === 'socials') {
    loadSocialsTab();
  } else if (MAP.type === 'industries') {
    loadIndustriesTab();
  } else if (MAP.type === 'vapi') {
    loadVapiTab();
  } else if (MAP.type === 'lead-scanner') {
    loadLeadScannerTab({
      settingsPanelRoot,
      prependSettingsBackHeader,
      escHtml,
    });
  } else if (MAP.type === 'addons') {
    loadAddonsTab();
  } else if (MAP.type === 'documents') {
    loadDocumentsTab();
  } else if (MAP.type === 'knowledge') {
    loadKnowledgeTab();
  } else if (MAP.type === 'work') {
    loadWorkTab({ workSlug: opts.workSlug });
  } else if (MAP.type === 'schedule') {
    if (opts.scheduleUid) scheduleState.activeUid = opts.scheduleUid;
    else {
      const fromUrl = parseScheduleDeepLinkFromUrl();
      if (fromUrl) scheduleState.activeUid = fromUrl;
    }
    loadScheduleTab();
  } else if (MAP.type === 'clients') {
    loadClientsTab({ clientUid: opts.clientUid, newClient: opts.newClient });
  } else if (MAP.type === 'social') {
    loadSocialTab();
  } else if (MAP.type === 'reviews') {
    loadOnlineReviewsTab();
  } else if (MAP.type === 'media') {
    loadMediaTab();
  } else if (MAP.type === 'analytics') {
    loadAnalyticsTab();
  } else if (MAP.type === 'fleet') {
    loadFleetTab();
  } else if (MAP.type === 'modules') {
    loadModulesTab({ feature: opts.moduleFeature });
  } else if (MAP.type === 'chats') {
    if (opts.chatId) queueChatDeepLink(opts.chatId);
    loadChatsTab({ keepSession: opts.keepChatSession === true });
  } else if (MAP.type === 'email') {
    if (opts.emailId) pendingEmailDeepLinkId = opts.emailId;
    else if (!pendingEmailDeepLinkId) {
      const fromUrl = parseEmailDeepLinkFromUrl();
      if (fromUrl) pendingEmailDeepLinkId = fromUrl;
    }
    loadEmailTab(emailPanelHasList());
  } else if (MAP.type === 'rules') {
    loadRulesTab();
  } else if (MAP.type === 'newsletter') {
    loadNewsletterTab();
  } else if (MAP.type === 'todo') {
    loadTodoTab({ todoId: opts.todoId });
  } else {
    buildMap();
    finishMapLayout();
  }
}

function isPanelTab() {
  return (
    isSettingsMapType(MAP.type) ||
    MAP.type === 'dashboard' ||
    MAP.type === 'documents' ||
    MAP.type === 'knowledge' ||
    MAP.type === 'work' ||
    MAP.type === 'schedule' ||
    MAP.type === 'clients' ||
    MAP.type === 'social' ||
    MAP.type === 'reviews' ||
    MAP.type === 'media' ||
    MAP.type === 'analytics' ||
    MAP.type === 'fleet' ||
    MAP.type === 'modules' ||
    MAP.type === 'chats' ||
    MAP.type === 'email' ||
    MAP.type === 'rules' ||
    MAP.type === 'newsletter' ||
    MAP.type === 'todo'
  );
}

function setPanelDisplay(id, display) {
  const el = document.getElementById(id);
  if (el) el.style.display = display;
}

function syncCanvasVisibility() {
  const isPanel = isPanelTab();
  if (wrap) wrap.style.display = isPanel ? 'none' : '';
  setPanelDisplay('tools', isPanel ? 'none' : '');
  setPanelDisplay('legend', isPanel ? 'none' : '');
  setPanelDisplay('dashboard-panel', MAP.type === 'dashboard' ? 'flex' : 'none');
  setPanelDisplay('settings-panel', isSettingsMapType(MAP.type) ? 'flex' : 'none');
  setPanelDisplay('doc-editor', MAP.type === 'documents' ? 'flex' : 'none');
  setPanelDisplay('knowledge-editor', MAP.type === 'knowledge' ? 'flex' : 'none');
  setPanelDisplay('work-editor', MAP.type === 'work' ? 'flex' : 'none');
  setPanelDisplay('schedule-panel', MAP.type === 'schedule' ? 'flex' : 'none');
  setPanelDisplay('clients-editor', MAP.type === 'clients' ? 'flex' : 'none');
  setPanelDisplay('social-panel', MAP.type === 'social' ? 'flex' : 'none');
  setPanelDisplay('online-reviews-panel', MAP.type === 'reviews' ? 'flex' : 'none');
  setPanelDisplay('media-panel', MAP.type === 'media' ? 'flex' : 'none');
  setPanelDisplay('analytics-panel', MAP.type === 'analytics' ? 'flex' : 'none');
  setPanelDisplay('fleet-panel', MAP.type === 'fleet' ? 'flex' : 'none');
  setPanelDisplay('modules-panel', MAP.type === 'modules' ? 'flex' : 'none');
  setPanelDisplay('chat-panel', MAP.type === 'chats' ? 'flex' : 'none');
  setPanelDisplay('email-panel', MAP.type === 'email' ? 'flex' : 'none');
  setPanelDisplay('rule-editor', MAP.type === 'rules' ? 'flex' : 'none');
  setPanelDisplay('newsletter-editor', MAP.type === 'newsletter' ? 'flex' : 'none');
  setPanelDisplay('todo-editor', MAP.type === 'todo' ? 'flex' : 'none');
  // Dashboard content scrolls under the transparent topbar — enable the same
  // progressive blur scrim used on public pages (Header.astro app-header-scrim).
  document.getElementById('topbar')?.classList.toggle(
    'app-header--scrim',
    MAP.type === 'dashboard',
  );
}

// ---- health polling ----
function syncHealthLifecycle() {
  startHealth();
  updateChecked();
}

function startHealth() {
  if (!userId || activeKey !== 'system') {
    stopHealth();
    return;
  }
  stopHealth();
  pollHealth();
  healthTimer = setInterval(pollHealth, HEALTH_INTERVAL_MS);
}

function stopHealth() {
  if (healthTimer) {
    clearInterval(healthTimer);
    healthTimer = null;
  }
  if (healthAbort) {
    healthAbort.abort();
    healthAbort = null;
  }
}

async function pollHealth() {
  try {
    healthAbort = new AbortController();
    const res = await fetch(HEALTH_URL, { cache: 'no-store', signal: healthAbort.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    lastChecked = data.checkedAt ? new Date(data.checkedAt) : new Date();
    applyHealth(data.services || {});
  } catch {
    // Network/abort errors are non-fatal; leave the last known state in place.
  } finally {
    healthAbort = null;
  }
}

function applyHealth(services) {
  for (const [id, probe] of Object.entries(services)) {
    const el = world.querySelector(`[data-st="${id}"]`);
    if (!el) continue;
    const status = probe && probe.status ? probe.status : 'unknown';
    el.className = `status st-${status}`;
    el.textContent = STATUS_LABELS[status] || status;
    const bits = [];
    if (probe && probe.mode) bits.push(probe.mode);
    if (probe && probe.detail) bits.push(probe.detail);
    if (probe && typeof probe.ms === 'number') bits.push(`${probe.ms}ms`);
    el.title = bits.join(' · ');
  }
  drawGroups();
  drawEdges();
  updateChecked();
}

function updateChecked() {
  const el = document.getElementById('health-checked');
  if (!el) return;
  if (!lastChecked) {
    el.style.opacity = '0.35';
    el.dataset.tooltip = '';
    return;
  }
  el.style.opacity = '1';
  el.dataset.tooltip = `Health checked at ${lastChecked.toLocaleTimeString()}`;
}

// ---- agent model picker (System tab legacy select; chats use pane subheader) ----
const MODEL_NODE_IDS = ['anthropic', 'tc_claude', 'tc_svc_anthropic'];

export let agentModelState = {
  model: 'claude-sonnet-4-6',
  source: 'default',
  options: [],
  loading: true,
  saving: false,
  anthropicBalance: null,
  anthropicKeySource: 'none',
};

function formatBalanceUsd(n) {
  if (n == null || !Number.isFinite(n)) return null;
  return `$${n.toFixed(2)}`;
}

function anthropicBalanceLabel() {
  const b = agentModelState.anthropicBalance;
  if (!b) return null;
  const usd = formatBalanceUsd(b.balanceUsd);
  if (usd) return usd;
  if (b.source === 'error' && b.detail) return '—';
  return null;
}

function anthropicBalanceTitle() {
  const b = agentModelState.anthropicBalance;
  if (!b) return '';
  const usd = formatBalanceUsd(b.balanceUsd);
  if (usd) {
    const src = b.source === 'live' ? 'Anthropic prepaid credits' : 'manual balance';
    return `${usd} available (${src})`;
  }
  if (b.detail) return b.detail;
  return 'Anthropic balance not configured';
}

function modelSelectEl() {
  return document.getElementById('model-select');
}

function syncModelSelectorVisibility() {
  const el = modelSelectEl();
  if (!el) return;
  // Chats use the model switcher in the pane subheader, not the legacy topbar select.
  el.style.display = activeKey === 'system' ? '' : 'none';
}

function modelBaseLabel(opt) {
  return opt.label || opt.id;
}

// ---- custom (non-native) model dropdown widget ----
// Replaces the standard HTML <select> so the picker matches the app's design
// language and works consistently across platforms. No external deps.
const modelDropdowns = new Set();
let openModelDropdown = null;
let modelDropdownGlobalBound = false;

const MODEL_DD_CHEVRON = iosIcon('chevron-down', 12);
const MODEL_DD_CHECK = iosIcon('check', 14);

function currentModelOption() {
  return (
    agentModelState.options.find((o) => o.id === agentModelState.model) ||
    (agentModelState.model ? { id: agentModelState.model } : null)
  );
}

function modelDropdownLabelText() {
  const current = currentModelOption();
  if (!current) return agentModelState.loading ? 'Loading…' : 'Model';
  return modelBaseLabel(current);
}

function modelDropdownOptions() {
  if (agentModelState.options.length) return agentModelState.options;
  const current = currentModelOption();
  return current ? [current] : [];
}

function modelDropdownContains(entry, target) {
  return !!entry && (entry.root.contains(target) || entry.menu.contains(target));
}

function focusModelDropdownEl(el) {
  // preventScroll: opening inside overflow:hidden pane headers must not
  // fire the capture-phase scroll listener that immediately closes the menu.
  el?.focus?.({ preventScroll: true });
}

function closeModelDropdown() {
  if (!openModelDropdown) return;
  const entry = openModelDropdown;
  openModelDropdown = null;
  entry.root.classList.remove('open');
  entry.menu.hidden = true;
  entry.trigger.setAttribute('aria-expanded', 'false');
  // Return portaled menu to its trigger root for cleanup / isConnected checks.
  if (entry.menu.parentElement !== entry.root) {
    entry.root.appendChild(entry.menu);
  }
}

function positionModelDropdownMenu(entry) {
  const menu = entry.menu;
  const rect = entry.trigger.getBoundingClientRect();
  menu.style.visibility = 'hidden';
  menu.hidden = false;
  const mw = menu.offsetWidth;
  const mh = menu.offsetHeight;
  const gap = 6;
  let top = rect.bottom + gap;
  if (top + mh > window.innerHeight - 8 && rect.top - gap - mh > 8) {
    top = rect.top - gap - mh;
  }
  // Compact switchers sit near the right edge → align menu's right edge to trigger.
  let left = entry.compact ? rect.right - mw : rect.left;
  left = Math.max(8, Math.min(left, window.innerWidth - mw - 8));
  menu.style.top = `${Math.round(top)}px`;
  menu.style.left = `${Math.round(left)}px`;
  menu.style.minWidth = `${Math.round(rect.width)}px`;
  menu.style.visibility = '';
}

function openModelDropdownFor(entry) {
  if (agentModelState.loading || agentModelState.saving) return;
  if (openModelDropdown && openModelDropdown !== entry) closeModelDropdown();
  openModelDropdown = entry;
  entry.root.classList.add('open');
  // Portal to body so overflow:hidden on .de-header / .ch-pane cannot clip it
  // (especially on iOS Safari where fixed descendants still get clipped).
  if (entry.menu.parentElement !== document.body) {
    document.body.appendChild(entry.menu);
  }
  entry.menu.hidden = false;
  entry.trigger.setAttribute('aria-expanded', 'true');
  positionModelDropdownMenu(entry);
  const selected =
    entry.menu.querySelector('.model-dd-option[aria-selected="true"]') ||
    entry.menu.querySelector('.model-dd-option');
  focusModelDropdownEl(selected);
}

function toggleModelDropdown(entry) {
  if (openModelDropdown === entry) closeModelDropdown();
  else openModelDropdownFor(entry);
}

function chooseModel(entry, id) {
  closeModelDropdown();
  focusModelDropdownEl(entry.trigger);
  if (id && id !== agentModelState.model) saveAgentModel(id);
}

function onModelDropdownKeydown(entry, e) {
  if (e.key === 'Escape') {
    if (openModelDropdown !== entry) return;
    e.preventDefault();
    closeModelDropdown();
    focusModelDropdownEl(entry.trigger);
    return;
  }
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Home' || e.key === 'End') {
    e.preventDefault();
    if (openModelDropdown !== entry) {
      openModelDropdownFor(entry);
      return;
    }
    const items = Array.from(entry.menu.querySelectorAll('.model-dd-option'));
    if (!items.length) return;
    const idx = items.indexOf(document.activeElement);
    let next = idx;
    if (e.key === 'ArrowDown') next = idx < 0 ? 0 : Math.min(items.length - 1, idx + 1);
    else if (e.key === 'ArrowUp') next = idx < 0 ? items.length - 1 : Math.max(0, idx - 1);
    else if (e.key === 'Home') next = 0;
    else next = items.length - 1;
    focusModelDropdownEl(items[next]);
    return;
  }
  const active = document.activeElement;
  if ((e.key === 'Enter' || e.key === ' ') && active?.classList.contains('model-dd-option')) {
    e.preventDefault();
    chooseModel(entry, active.dataset.value);
  }
}

function renderModelDropdown(entry) {
  entry.label.textContent = modelDropdownLabelText();
  const disabled = agentModelState.loading || agentModelState.saving;
  entry.trigger.disabled = disabled;
  if (disabled && openModelDropdown === entry) closeModelDropdown();
  const balTitle = anthropicBalanceTitle();
  const labelText = modelDropdownLabelText();
  entry.trigger.title = agentModelState.loading
    ? 'Loading model…'
    : balTitle
      ? `${balTitle} — ${labelText}`
      : `Agent model: ${labelText} (${agentModelState.source})`;

  entry.menu.innerHTML = '';
  const bal = anthropicBalanceLabel();
  for (const opt of modelDropdownOptions()) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'model-dd-option';
    item.setAttribute('role', 'option');
    item.dataset.value = opt.id;
    const selected = opt.id === agentModelState.model;
    item.setAttribute('aria-selected', selected ? 'true' : 'false');

    const check = document.createElement('span');
    check.className = 'model-dd-check';
    check.innerHTML = selected ? MODEL_DD_CHECK : '';

    const text = document.createElement('span');
    text.className = 'model-dd-option-label';
    text.textContent = modelBaseLabel(opt);

    item.append(check, text);
    if (bal) {
      const b = document.createElement('span');
      b.className = 'model-dd-option-bal';
      b.textContent = bal;
      item.appendChild(b);
    }
    item.addEventListener('click', () => chooseModel(entry, opt.id));
    entry.menu.appendChild(item);
  }
  if (openModelDropdown === entry) positionModelDropdownMenu(entry);
}

// Kept the historical name so existing call sites (load/save) keep working.
function renderModelSelectOptions() {
  for (const entry of Array.from(modelDropdowns)) {
    if (!entry.root.isConnected) {
      if (openModelDropdown === entry) closeModelDropdown();
      // Drop orphaned portaled menus when the chat header is rebuilt.
      entry.menu.remove();
      modelDropdowns.delete(entry);
      continue;
    }
    renderModelDropdown(entry);
  }
}

function bindModelDropdownGlobals() {
  if (modelDropdownGlobalBound) return;
  modelDropdownGlobalBound = true;
  document.addEventListener('click', (e) => {
    if (openModelDropdown && !modelDropdownContains(openModelDropdown, e.target)) {
      closeModelDropdown();
    }
  });
  window.addEventListener('resize', closeModelDropdown);
  window.addEventListener('scroll', closeModelDropdown, true);
}

function createModelDropdown(opts = {}) {
  bindModelDropdownGlobals();
  const root = document.createElement('div');
  root.className = 'model-dd' + (opts.compact ? ' model-dd--compact' : '');

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'model-dd-trigger';
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-label', 'Agent model');

  const label = document.createElement('span');
  label.className = 'model-dd-label';

  const caret = document.createElement('span');
  caret.className = 'model-dd-caret';
  caret.innerHTML = MODEL_DD_CHEVRON;

  trigger.append(label, caret);

  const menu = document.createElement('div');
  menu.className = 'model-dd-menu';
  menu.setAttribute('role', 'listbox');
  menu.hidden = true;

  root.append(trigger, menu);

  const entry = { root, trigger, label, menu, compact: !!opts.compact };
  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleModelDropdown(entry);
  });
  trigger.addEventListener('keydown', (e) => onModelDropdownKeydown(entry, e));
  menu.addEventListener('keydown', (e) => onModelDropdownKeydown(entry, e));

  modelDropdowns.add(entry);
  renderModelDropdown(entry);
  return { root, entry };
}

function isReaveSharedAnthropicKey() {
  return agentModelState.anthropicKeySource === 'reave';
}

function createChatReaveKeyFlag(variant = 'chip') {
  const el = document.createElement(variant === 'banner' ? 'div' : 'span');
  el.className = variant === 'banner' ? 'ch-reave-key-flag ch-reave-key-flag--banner' : 'ch-reave-key-flag';
  el.hidden = !isReaveSharedAnthropicKey();
  el.title = 'This install uses the shared reΛVe.app Claude API key. Add the client’s ANTHROPIC_API_KEY to use their own.';
  el.innerHTML = `${iosIcon('key', variant === 'banner' ? 14 : 12)}<span>reΛVe.app key</span>`;
  return el;
}

function syncReaveKeyFlags() {
  const on = isReaveSharedAnthropicKey();
  document.querySelectorAll('.ch-reave-key-flag').forEach((el) => {
    el.hidden = !on;
  });
}

function createChatModelSwitcher() {
  const cluster = document.createElement('div');
  cluster.className = 'ch-model-cluster';
  cluster.appendChild(createChatReaveKeyFlag('chip'));

  const wrap = document.createElement('div');
  wrap.className = 'ch-model-switcher';

  const icon = document.createElement('span');
  icon.className = 'ch-model-switcher-icon';
  icon.innerHTML = IOS_ICONS.agent || '';
  icon.setAttribute('aria-hidden', 'true');
  wrap.appendChild(icon);

  const { root } = createModelDropdown({ compact: true });
  wrap.appendChild(root);
  cluster.appendChild(wrap);
  return cluster;
}

function syncModelNodeLabels() {
  if (!agentModelState.model) return;
  const label = modelBaseLabel(
    agentModelState.options.find((o) => o.id === agentModelState.model) || { id: agentModelState.model },
  );
  const bits = [`${label}`, agentModelState.source];
  const bal = anthropicBalanceLabel();
  if (bal) bits.push(bal);
  const sub = bits.join(' · ');
  for (const id of MODEL_NODE_IDS) {
    const node = byId.get(id);
    if (node) node.sub = sub;
    const el = nodeEls.get(id);
    const subEl = el?.querySelector('.sub');
    if (subEl) subEl.textContent = sub;
  }
}

async function loadAgentModel() {
  if (!userId) {
    // Don't leave the chat Agent button permanently disabled (loading starts true).
    agentModelState.loading = false;
    renderModelSelectOptions();
    return;
  }
  agentModelState.loading = true;
  renderModelSelectOptions();
  try {
    const res = await fetch('/api/agent/model', { cache: 'no-store' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    agentModelState.model = data.model || agentModelState.model;
    agentModelState.source = data.source || 'default';
    agentModelState.options = data.options || [];
    agentModelState.anthropicBalance = data.anthropicBalance || null;
    agentModelState.anthropicKeySource = data.anthropicKeySource || 'none';
  } catch (e) {
    console.warn('[model] load failed:', e);
  } finally {
    agentModelState.loading = false;
    renderModelSelectOptions();
    syncModelNodeLabels();
    syncReaveKeyFlags();
  }
}

async function saveAgentModel(model) {
  if (!model || agentModelState.saving) return;
  const previous = agentModelState.model;
  agentModelState.model = model;
  agentModelState.saving = true;
  renderModelSelectOptions();
  try {
    const res = await fetch('/api/agent/model', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    agentModelState.model = data.model;
    agentModelState.source = data.source || 'stored';
    agentModelState.options = data.options || agentModelState.options;
    agentModelState.anthropicBalance = data.anthropicBalance || agentModelState.anthropicBalance;
    if (data.anthropicKeySource) agentModelState.anthropicKeySource = data.anthropicKeySource;
    syncModelNodeLabels();
    if (activeKey === 'system') pollHealth();
  } catch (e) {
    agentModelState.model = previous;
    alert(`Could not save model: ${e.message}`);
    renderModelSelectOptions();
  } finally {
    agentModelState.saving = false;
    renderModelSelectOptions();
    syncReaveKeyFlags();
  }
}

function initModelSelector() {
  const el = modelSelectEl();
  if (el && !el.dataset.bound) {
    el.dataset.bound = '1';
    const { root } = createModelDropdown();
    el.appendChild(root);
  }
  // Always load so the chat-header Agent select enables even if #model-select is absent.
  void loadAgentModel();
  syncModelSelectorVisibility();
}

// ---- rendering ----
const NODE_W = 210;
const NODE_H = 96;
const NODE_H_COMPACT = 72;
const NODE_GAP = GRID * 2;

function defaultNodeSize(n) {
  return {
    w: n.wide || NODE_W,
    h: n.status ? NODE_H : NODE_H_COMPACT,
  };
}

function rect(n) {
  const el = nodeEls.get(n.id);
  const fallback = defaultNodeSize(n);
  return {
    x: n.x,
    y: n.y,
    w: el?.offsetWidth || fallback.w,
    h: el?.offsetHeight || fallback.h,
  };
}

function nodeBounds(n) {
  const r = rect(n);
  return { x: r.x, y: r.y, w: r.w, h: r.h, right: r.x + r.w, bottom: r.y + r.h };
}

function boxesOverlap(a, b, gap = NODE_GAP) {
  return a.x < b.right + gap && a.right + gap > b.x && a.y < b.bottom + gap && a.bottom + gap > b.y;
}

function separateNodes(a, b, gap = NODE_GAP) {
  const ra = nodeBounds(a);
  const rb = nodeBounds(b);
  if (!boxesOverlap(ra, rb, gap)) return false;

  const overlapX = Math.min(ra.right + gap - rb.x, rb.right + gap - ra.x);
  const overlapY = Math.min(ra.bottom + gap - rb.y, rb.bottom + gap - ra.y);

  if (overlapX < overlapY) {
    if (ra.x + ra.w / 2 <= rb.x + rb.w / 2) b.x = snap(ra.right + gap);
    else a.x = snap(rb.right + gap);
  } else if (ra.y + ra.h / 2 <= rb.y + rb.h / 2) b.y = snap(ra.bottom + gap);
  else a.y = snap(rb.bottom + gap);

  return true;
}

function applyNodePositions() {
  for (const n of byId.values()) {
    const el = nodeEls.get(n.id);
    if (!el) continue;
    el.style.left = `${n.x}px`;
    el.style.top = `${n.y}px`;
  }
}

/** Push overlapping nodes apart after layout; returns true if anything moved. */
function resolveOverlaps() {
  const nodes = [...byId.values()];
  if (nodes.length < 2) return false;

  let changed = false;
  const maxPass = Math.max(24, nodes.length * 4);

  for (let pass = 0; pass < maxPass; pass++) {
    let moved = false;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        if (separateNodes(nodes[i], nodes[j])) moved = true;
      }
    }
    if (!moved) break;
    changed = true;
    applyNodePositions();
  }
  return changed;
}

function finishMapLayout({ persist = true } = {}) {
  requestAnimationFrame(() => {
    const fixed = resolveOverlaps();
    redraw();
    fit();
    if (fixed && persist) savePositions();
  });
}

function anchors(a, b) {
  const acx = a.x + a.w / 2;
  const acy = a.y + a.h / 2;
  const bcx = b.x + b.w / 2;
  const bcy = b.y + b.h / 2;
  const dx = bcx - acx;
  const dy = bcy - acy;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0
      ? [{ x: a.x + a.w, y: acy, h: true }, { x: b.x, y: bcy, h: true }]
      : [{ x: a.x, y: acy, h: true }, { x: b.x + b.w, y: bcy, h: true }];
  }
  return dy >= 0
    ? [{ x: acx, y: a.y + a.h, h: false }, { x: bcx, y: b.y, h: false }]
    : [{ x: acx, y: a.y, h: false }, { x: bcx, y: b.y + b.h, h: false }];
}

function roundedPath(pts, r) {
  if (pts.length < 2) return '';
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i - 1];
    const [cx, cy] = pts[i];
    const [nx, ny] = pts[i + 1];
    const l1 = Math.hypot(cx - px, cy - py) || 1;
    const l2 = Math.hypot(nx - cx, ny - cy) || 1;
    const rr = Math.min(r, l1 / 2, l2 / 2);
    const p1x = cx - ((cx - px) / l1) * rr;
    const p1y = cy - ((cy - py) / l1) * rr;
    const p2x = cx + ((nx - cx) / l2) * rr;
    const p2y = cy + ((ny - cy) / l2) * rr;
    d += ` L ${p1x} ${p1y} Q ${cx} ${cy} ${p2x} ${p2y}`;
  }
  const last = pts[pts.length - 1];
  d += ` L ${last[0]} ${last[1]}`;
  return d;
}

function drawEdges() {
  for (const { e, path } of edgeEls) {
    const a = byId.get(e.from);
    const b = byId.get(e.to);
    if (!a || !b) continue;
    const [s, t] = anchors(rect(a), rect(b));
    let pts;
    if (s.h) {
      const mx = (s.x + t.x) / 2;
      pts = [[s.x, s.y], [mx, s.y], [mx, t.y], [t.x, t.y]];
    } else {
      const my = (s.y + t.y) / 2;
      pts = [[s.x, s.y], [s.x, my], [t.x, my], [t.x, t.y]];
    }
    path.setAttribute('d', roundedPath(pts, 10));
  }
  for (const { e, lab } of labelEls) {
    const a = byId.get(e.from);
    const b = byId.get(e.to);
    if (!a || !b) continue;
    const [s, t] = anchors(rect(a), rect(b));
    lab.style.left = `${(s.x + t.x) / 2}px`;
    lab.style.top = `${(s.y + t.y) / 2}px`;
  }
}

function drawGroups() {
  for (const g of MAP.groups) {
    const ms = g.members.map((id) => byId.get(id)).filter(Boolean);
    if (!ms.length) continue;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const n of ms) {
      const r = rect(n);
      minX = Math.min(minX, r.x);
      minY = Math.min(minY, r.y);
      maxX = Math.max(maxX, r.x + r.w);
      maxY = Math.max(maxY, r.y + r.h);
    }
    const pad = 22;
    const el = groupEls.get(g.id);
    el.style.left = `${minX - pad}px`;
    el.style.top = `${minY - pad}px`;
    el.style.width = `${maxX - minX + pad * 2}px`;
    el.style.height = `${maxY - minY + pad * 2}px`;
  }
}

function applyWorld() {
  world.style.transform = `translate(${panX}px, ${panY}px) scale(${z})`;
  wrap.style.backgroundSize = `${GRID * 2 * z}px ${GRID * 2 * z}px`;
  wrap.style.backgroundPosition = `${panX}px ${panY}px`;
}

function redraw() {
  drawGroups();
  drawEdges();
  applyWorld();
}

// ---- node dragging ----
function attachDrag(n, el) {
  el.addEventListener('pointerdown', (ev) => {
    ev.stopPropagation();
    try { el.setPointerCapture(ev.pointerId); } catch {}
    el.classList.add('dragging');
    const start = toWorld(ev.clientX, ev.clientY);
    const offX = start.x - n.x;
    const offY = start.y - n.y;

    const move = (e) => {
      const p = toWorld(e.clientX, e.clientY);
      n.x = snap(p.x - offX);
      n.y = snap(p.y - offY);
      el.style.left = `${n.x}px`;
      el.style.top = `${n.y}px`;
      drawGroups();
      drawEdges();
    };
    const up = () => {
      el.classList.remove('dragging');
      try { el.releasePointerCapture(ev.pointerId); } catch {}
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      savePositions();
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  });
}

// ---- group dragging (move every member node together, Railway-style) ----
function attachGroupDrag(g, handle) {
  handle.addEventListener('pointerdown', (ev) => {
    const members = g.members.map((id) => byId.get(id)).filter(Boolean);
    if (!members.length) return;
    ev.stopPropagation();
    try { handle.setPointerCapture(ev.pointerId); } catch {}
    handle.classList.add('dragging');
    const start = toWorld(ev.clientX, ev.clientY);
    const origins = members.map((n) => ({ n, x: n.x, y: n.y }));

    const move = (e) => {
      const p = toWorld(e.clientX, e.clientY);
      const dx = snap(p.x - start.x);
      const dy = snap(p.y - start.y);
      for (const o of origins) {
        o.n.x = o.x + dx;
        o.n.y = o.y + dy;
        const el = nodeEls.get(o.n.id);
        el.style.left = `${o.n.x}px`;
        el.style.top = `${o.n.y}px`;
      }
      drawGroups();
      drawEdges();
    };
    const up = () => {
      handle.classList.remove('dragging');
      try { handle.releasePointerCapture(ev.pointerId); } catch {}
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      savePositions();
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
  });
}

// ---- pan + pinch-zoom ----
// _canvasPtrs tracks all active pointers on the canvas background so the
// single-pointer pan handler can yield to a two-finger pinch when PINCH_ZOOM
// is true. Flip the constant to false to disable pinch gestures entirely.
const _canvasPtrs = new Map(); // pointerId → current { x, y }
let _pinchDist = null;         // baseline finger distance when a pinch begins

wrap.addEventListener('pointerdown', (ev) => {
  if (ev.target.closest('.node')) return;
  _canvasPtrs.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });

  if (_canvasPtrs.size === 1) {
    wrap.classList.add('panning');
    const sx = ev.clientX - panX;
    const sy = ev.clientY - panY;
    const move = (e) => {
      if (_canvasPtrs.size >= 2) return; // yield to pinch
      panX = e.clientX - sx;
      panY = e.clientY - sy;
      applyWorld();
    };
    const up = () => {
      wrap.classList.remove('panning');
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  } else if (PINCH_ZOOM && _canvasPtrs.size === 2) {
    wrap.classList.remove('panning');
    const pts = [..._canvasPtrs.values()];
    _pinchDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
  }
});

wrap.addEventListener('pointermove', (ev) => {
  if (!PINCH_ZOOM || !_canvasPtrs.has(ev.pointerId) || _canvasPtrs.size < 2) return;
  _canvasPtrs.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
  if (!_pinchDist) return;
  const pts = [..._canvasPtrs.values()];
  const newDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
  const factor = clamp(newDist / _pinchDist, 0.85, 1.15);
  const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
  zoomAt(factor, mid.x, mid.y);
  _pinchDist = newDist;
});

wrap.addEventListener('pointerup', (ev) => {
  _canvasPtrs.delete(ev.pointerId);
  if (_canvasPtrs.size < 2) _pinchDist = null;
});

wrap.addEventListener('pointercancel', (ev) => {
  _canvasPtrs.delete(ev.pointerId);
  if (_canvasPtrs.size < 2) _pinchDist = null;
});

// ---- zoom ----
function toWorld(clientX, clientY) {
  const r = wrap.getBoundingClientRect();
  return { x: (clientX - r.left - panX) / z, y: (clientY - r.top - panY) / z };
}
function zoomAt(factor, clientX, clientY) {
  const r = wrap.getBoundingClientRect();
  const x = clientX - r.left;
  const y = clientY - r.top;
  const nz = clamp(z * factor, 0.2, 2.5);
  panX = x - (x - panX) * (nz / z);
  panY = y - (y - panY) * (nz / z);
  z = nz;
  applyWorld();
}
wrap.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    // Proportional, gentle zoom: smooth for trackpads, slower for mouse wheels.
    // Clamp per-event so a single big wheel tick can't jump too far.
    const factor = clamp(Math.exp(-e.deltaY * 0.0004), 0.95, 1.05);
    zoomAt(factor, e.clientX, e.clientY);
  },
  { passive: false }
);

function fit() {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of byId.values()) {
    const r = rect(n);
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.w);
    maxY = Math.max(maxY, r.y + r.h);
  }
  const pad = 60;
  const cw = maxX - minX + pad * 2;
  const ch = maxY - minY + pad * 2;
  const vw = wrap.clientWidth;
  const vh = wrap.clientHeight;
  z = clamp(Math.min(vw / cw, vh / ch), 0.2, 2.5);
  panX = (vw - cw * z) / 2 - (minX - pad) * z;
  panY = (vh - ch * z) / 2 - (minY - pad) * z;
  applyWorld();
}

// ---- toolbar ----
document.querySelectorAll('#tools button').forEach((btn) => {
  btn.addEventListener('click', () => {
    const act = btn.dataset.act;
    const cx = wrap.clientWidth / 2;
    const cy = wrap.clientHeight / 2;
    if (act === 'in') zoomAt(1.2, cx + wrap.getBoundingClientRect().left, cy + wrap.getBoundingClientRect().top);
    else if (act === 'out') zoomAt(1 / 1.2, cx + wrap.getBoundingClientRect().left, cy + wrap.getBoundingClientRect().top);
    else if (act === 'fit') fit();
  });
});
document.getElementById('reset')?.addEventListener('click', () => {
  localStorage.removeItem(storeKey());
  for (const n of byId.values()) {
    const orig = MAP.nodes.find((d) => d.id === n.id);
    if (!orig) continue;
    n.x = orig.x;
    n.y = orig.y;
    const el = nodeEls.get(n.id);
    el.style.left = `${n.x}px`;
    el.style.top = `${n.y}px`;
  }
  finishMapLayout();
});

// ---- tabs ----
let tabDragMoved = false;
let tabOrderSaveTimer = null;

function tabOrderStoreKey() {
  return userId ? `${TAB_ORDER_STORE}:${userId}` : TAB_ORDER_STORE;
}

function isMobileTabs() {
  return MOBILE_TABS_MQ.matches;
}

function isCompactTabs() {
  return COMPACT_TABS_MQ.matches;
}

/** Expand mobile-only dropdown slots back to persisted tab keys. */
function storedTabOrderKeys(keys) {
  const out = [];
  for (const raw of keys) {
    if (raw === CHAT_TAB_SLOT) {
      out.push('chats', 'knowledge');
    } else {
      out.push(raw);
    }
  }
  return normalizeTabOrderKeys(out);
}

/** Collapse Chats+Knowledge into one slot on phone only; hide Finance on mobile. */
function effectiveTabOrder(order) {
  const normalized = normalizeTabOrderKeys(order);
  if (!isMobileTabs()) return normalized;

  const out = [];
  let chatSlot = false;
  for (const key of normalized) {
    if (key === 'knowledge' || key === 'chats') {
      if (!chatSlot) {
        out.push(CHAT_TAB_SLOT);
        chatSlot = true;
      }
      continue;
    }
    if (key === 'finance') continue;
    out.push(key);
  }
  return out;
}

function defaultTabKeys() {
  const configured = installFooterNav();
  if (configured) return normalizeFooterNavKeys(configured);
  const keys = Object.keys(MAPS).filter((k) => !SYSTEM_MAP_SET.has(k));
  return [SYSTEM_TAB_SLOT, ...keys];
}

function normalizeTabOrderKeys(saved) {
  const baseline = defaultTabKeys();
  const allowed = new Set(baseline);

  if (!Array.isArray(saved)) return baseline;

  const result = [];
  let systemSlot = false;

  for (const raw of saved) {
    if (typeof raw !== 'string') continue;
    if (SYSTEM_MAP_SET.has(raw) || raw === SYSTEM_TAB_SLOT) {
      if (!systemSlot && allowed.has(SYSTEM_TAB_SLOT)) {
        result.push(SYSTEM_TAB_SLOT);
        systemSlot = true;
      }
      continue;
    }
    if (raw === CHAT_TAB_SLOT) {
      if (allowed.has(CHAT_TAB_SLOT) && !result.includes(CHAT_TAB_SLOT)) {
        result.push(CHAT_TAB_SLOT);
      }
      continue;
    }
    const mapKey = resolveMapKey(raw);
    if (MAPS[mapKey] && allowed.has(mapKey) && !result.includes(mapKey)) result.push(mapKey);
  }

  if (!systemSlot && allowed.has(SYSTEM_TAB_SLOT)) result.unshift(SYSTEM_TAB_SLOT);

  for (const k of baseline) {
    if (!result.includes(k)) result.push(k);
  }
  return result.length ? result : baseline;
}

function loadTabOrderFromLocal() {
  try {
    const saved = JSON.parse(localStorage.getItem(tabOrderStoreKey()) || 'null');
    return normalizeTabOrderKeys(saved);
  } catch {
    return defaultTabKeys();
  }
}

async function fetchTabOrderFromServer() {
  if (!userId) return null;
  try {
    const res = await fetch('/api/os-map/tab-order', { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data.tabOrder) ? normalizeTabOrderKeys(data.tabOrder) : null;
  } catch {
    return null;
  }
}

async function resolveTabOrder() {
  const server = await fetchTabOrderFromServer();
  if (server) {
    try {
      localStorage.setItem(tabOrderStoreKey(), JSON.stringify(server));
    } catch {}
    return server;
  }
  return loadTabOrderFromLocal();
}

function saveTabOrder(keys) {
  const normalized = storedTabOrderKeys(keys);
  try {
    localStorage.setItem(tabOrderStoreKey(), JSON.stringify(normalized));
  } catch {}
  if (!userId) return;
  clearTimeout(tabOrderSaveTimer);
  tabOrderSaveTimer = setTimeout(() => {
    fetch('/api/os-map/tab-order', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tabOrder: normalized }),
    }).catch(() => {});
  }, 500);
}

function currentTabOrderFromDom() {
  const tabs = document.getElementById('tabs');
  if (!tabs) return defaultTabKeys();
  const raw = [...tabs.querySelectorAll(':scope > [data-tab-key]')]
    .map((el) => el.dataset.tabKey)
    .filter(Boolean);
  return storedTabOrderKeys(raw);
}

function clearTabDropHints() {
  document.querySelectorAll('#tabs .tab-drop-before, #tabs .tab-drop-after').forEach((el) => {
    el.classList.remove('tab-drop-before', 'tab-drop-after');
  });
}

function tabSiblings(tabs, el) {
  return [...tabs.querySelectorAll(':scope > [data-tab-key]')].filter((node) => node !== el);
}

function repositionTabByPointer(el, pointerX) {
  const tabs = document.getElementById('tabs');
  if (!tabs) return;

  clearTabDropHints();
  const siblings = tabSiblings(tabs, el);
  if (!siblings.length) return;

  for (const sib of siblings) {
    const rect = sib.getBoundingClientRect();
    const mid = rect.left + rect.width / 2;
    if (pointerX < mid) {
      tabs.insertBefore(el, sib);
      sib.classList.add('tab-drop-before');
      return;
    }
  }

  tabs.appendChild(el);
  siblings[siblings.length - 1]?.classList.add('tab-drop-after');
}

function attachTabPointerReorder(el) {
  const grip = el.querySelector('.tab-grip');
  if (!grip) return;

  grip.addEventListener('mousedown', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    tabDragMoved = false;
    el.classList.add('tab-dragging');

    function onMove(moveEv) {
      tabDragMoved = true;
      repositionTabByPointer(el, moveEv.clientX);
    }

    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      el.classList.remove('tab-dragging');
      clearTabDropHints();
      if (tabDragMoved) saveTabOrder(currentTabOrderFromDom());
      setTimeout(() => { tabDragMoved = false; }, 0);
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

function tabInnerHtml(key, m) {
  const label = `<span class="tab-icon">${navIcon(mapIconName(key), 16)}</span><span class="tab-label">${m.title}</span>`;
  return `<span class="tab-grip" aria-hidden="true" title="Drag to reorder">⋮⋮</span>${label}`;
}

function resetMobileTabDropdown(wrap) {
  const menu = wrap?.querySelector('.tab-dropdown-menu');
  if (!menu) return;
  menu.style.position = '';
  menu.style.top = '';
  menu.style.left = '';
  menu.style.right = '';
  menu.style.zIndex = '';
}

function positionTabDropdownMenu(wrap) {
  const menu = wrap.querySelector('.tab-dropdown-menu');
  const trigger = wrap.querySelector('.tab-dropdown-trigger');
  if (!menu || !trigger) return;
  requestAnimationFrame(() => {
    const rect = trigger.getBoundingClientRect();
    menu.style.position = 'fixed';
    menu.style.top = `${rect.bottom + 4}px`;
    menu.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - menu.offsetWidth - 8))}px`;
    menu.style.right = 'auto';
    menu.style.zIndex = '10000';
  });
}

function closeTabDropdowns(except) {
  document.querySelectorAll('.tab-dropdown.open').forEach((dd) => {
    if (dd !== except) {
      dd.classList.remove('open');
      resetMobileTabDropdown(dd);
    }
  });
}

/** Dropdown tab: go to default sub-tab, reload if already there, else open sub-menu. */
function attachDropdownTriggerClick(wrap, mapSet, defaultKey) {
  const trigger = wrap.querySelector('.tab-dropdown-trigger');
  if (!trigger) return;

  trigger.addEventListener('click', (ev) => {
    ev.stopPropagation();
    if (tabDragMoved) return;

    if (!mapSet.has(activeKey)) {
      setActiveMap(defaultKey);
      return;
    }
    if (activeKey === defaultKey) {
      setActiveMap(defaultKey, { force: true });
      closeTabDropdowns();
      return;
    }

    const willOpen = !wrap.classList.contains('open');
    closeTabDropdowns(willOpen ? wrap : null);
    wrap.classList.toggle('open', willOpen);
    if (willOpen) positionTabDropdownMenu(wrap);
    else resetMobileTabDropdown(wrap);
  });
}

function buildSystemDropdownTab() {
  const wrap = document.createElement('div');
  wrap.className = 'tab-item tab-dropdown';
  wrap.dataset.tabKey = SYSTEM_TAB_SLOT;

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'tab-dropdown-trigger';
  trigger.innerHTML = `${tabInnerHtml('system', MAPS.system)}<span class="tab-caret" aria-hidden="true">▾</span>`;
  trigger.title = 'System — runtime and MCP & CLI';

  const menu = document.createElement('div');
  menu.className = 'tab-dropdown-menu';
  menu.setAttribute('role', 'menu');

  for (const key of SYSTEM_MAP_KEYS) {
    const m = MAPS[key];
    if (!m) continue;
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'tab-dropdown-item';
    item.dataset.map = key;
    item.setAttribute('role', 'menuitem');
    item.innerHTML = `<span class="tab-icon">${navIcon(mapIconName(key), 16)}</span><span class="tab-label">${m.title}</span>`;
    item.addEventListener('click', (ev) => {
      ev.stopPropagation();
      setActiveMap(key);
      closeTabDropdowns();
    });
    menu.appendChild(item);
  }

  wrap.appendChild(trigger);
  wrap.appendChild(menu);
  attachDropdownTriggerClick(wrap, SYSTEM_MAP_SET, 'system');
  attachTabPointerReorder(wrap);
  return wrap;
}

function buildChatDropdownTab() {
  const wrap = document.createElement('div');
  wrap.className = 'tab-item tab-dropdown tab-dropdown--chat';
  wrap.dataset.tabKey = CHAT_TAB_SLOT;

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'tab-dropdown-trigger';
  trigger.innerHTML = `${tabInnerHtml('chats', MAPS.chats)}<span class="tab-caret" aria-hidden="true">▾</span>`;
  trigger.title = 'Sessions — tap to open; hold for Sessions & Knowledge menu';

  const menu = document.createElement('div');
  menu.className = 'tab-dropdown-menu';
  menu.setAttribute('role', 'menu');

  for (const key of CHAT_MAP_KEYS) {
    const m = MAPS[key];
    if (!m) continue;
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'tab-dropdown-item';
    item.dataset.map = key;
    item.setAttribute('role', 'menuitem');
    item.innerHTML = `<span class="tab-icon">${navIcon(mapIconName(key), 16)}</span><span class="tab-label">${m.title}</span>`;
    item.addEventListener('click', (ev) => {
      ev.stopPropagation();
      setActiveMap(key);
      closeTabDropdowns();
    });
    menu.appendChild(item);
  }

  wrap.appendChild(trigger);
  wrap.appendChild(menu);
  attachChatDropdownTriggerClick(wrap);
  attachTabPointerReorder(wrap);
  return wrap;
}

/** Phone-only merged tab: tap always opens Chats; long-press opens Chats/Knowledge menu. */
function attachChatDropdownTriggerClick(wrap) {
  const trigger = wrap.querySelector('.tab-dropdown-trigger');
  if (!trigger) return;

  let longPressTimer = null;
  let longPressFired = false;

  function openSubmenu() {
    const willOpen = !wrap.classList.contains('open');
    closeTabDropdowns(willOpen ? wrap : null);
    wrap.classList.toggle('open', willOpen);
    if (willOpen) positionTabDropdownMenu(wrap);
    else resetMobileTabDropdown(wrap);
  }

  trigger.addEventListener('click', (ev) => {
    ev.stopPropagation();
    if (tabDragMoved || longPressFired) {
      longPressFired = false;
      return;
    }
    setActiveMap('chats', { force: activeKey === 'chats' });
    closeTabDropdowns();
  });

  trigger.addEventListener('pointerdown', (ev) => {
    if (ev.pointerType === 'mouse' && ev.button !== 0) return;
    longPressFired = false;
    clearTimeout(longPressTimer);
    longPressTimer = setTimeout(() => {
      longPressFired = true;
      openSubmenu();
    }, 500);
  });

  function cancelLongPress() {
    clearTimeout(longPressTimer);
  }
  trigger.addEventListener('pointerup', cancelLongPress);
  trigger.addEventListener('pointerleave', cancelLongPress);
  trigger.addEventListener('pointercancel', cancelLongPress);
}

function buildMapTab(key, m) {
  const item = document.createElement('div');
  item.className = 'tab-item';
  item.dataset.tabKey = key;
  item.dataset.map = key;
  item.innerHTML = tabInnerHtml(key, m);
  item.title = `${m.title} — drag ⋮⋮ to reorder`;
  item.addEventListener('click', (ev) => {
    if (tabDragMoved || ev.target.closest('.tab-grip')) return;
    setActiveMap(key, { force: key === activeKey && isPanelMapKey(key) });
  });
  attachTabPointerReorder(item);
  return item;
}

function buildLinkTab(key, m) {
  const item = document.createElement('div');
  item.className = 'tab-item tab-link';
  item.dataset.tabKey = key;

  const a = document.createElement('a');
  a.href = m.link;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.innerHTML = tabInnerHtml(key, m);
  a.title = `${m.title} — drag ⋮⋮ to reorder`;
  a.addEventListener('click', (ev) => {
    if (tabDragMoved) ev.preventDefault();
  });

  item.appendChild(a);
  attachTabPointerReorder(item);
  return item;
}

function buildTabs(order) {
  const tabs = document.getElementById('tabs');
  if (!tabs) return;
  tabs.innerHTML = '';
  tabs.title = isCompactTabs()
    ? 'Tabs — scroll sideways if needed'
    : 'Drag ⋮⋮ on a tab to reorder';

  for (const key of effectiveTabOrder(order)) {
    if (key === SYSTEM_TAB_SLOT) {
      tabs.appendChild(buildSystemDropdownTab());
      continue;
    }
    if (key === CHAT_TAB_SLOT) {
      tabs.appendChild(buildChatDropdownTab());
      continue;
    }
    const m = MAPS[key];
    if (!m) continue;
    tabs.appendChild(m.link ? buildLinkTab(key, m) : buildMapTab(key, m));
  }
  updateTabs();
}

function updateTabs() {
  document.querySelectorAll('#tabs .tab-item[data-map]').forEach((el) => {
    el.classList.toggle('active', el.dataset.map === activeKey);
  });

  document.querySelectorAll('#tabs .tab-dropdown').forEach((dropdown) => {
    const slot = dropdown.dataset.tabKey;
    dropdown.querySelectorAll('.tab-dropdown-item').forEach((item) => {
      item.classList.toggle('active', item.dataset.map === activeKey);
    });

    const trigger = dropdown.querySelector('.tab-dropdown-trigger');
    if (!trigger) return;

    if (slot === SYSTEM_TAB_SLOT) {
      dropdown.classList.toggle('active', SYSTEM_MAP_SET.has(activeKey));
      trigger.innerHTML = `${tabInnerHtml('system', MAPS.system)}<span class="tab-caret" aria-hidden="true">▾</span>`;
      return;
    }

    if (slot === CHAT_TAB_SLOT) {
      dropdown.classList.toggle('active', CHAT_MAP_SET.has(activeKey));
      const headKey = CHAT_MAP_SET.has(activeKey) ? activeKey : 'chats';
      const head = MAPS[headKey];
      trigger.innerHTML = `${tabInnerHtml(headKey, head)}<span class="tab-caret" aria-hidden="true">▾</span>`;
    }
  });

}

/** Flat tab keys for the dashboard grid (all sections, no collapsed slots). */
function dashboardTabKeys(order) {
  const out = [];
  for (const key of normalizeTabOrderKeys(order)) {
    if (key === SYSTEM_TAB_SLOT) {
      for (const k of SYSTEM_MAP_KEYS) {
        if (!out.includes(k)) out.push(k);
      }
      continue;
    }
    if (MAPS[key] && !out.includes(key)) out.push(key);
  }
  return out;
}

function compareDashboardTitle(a, b) {
  return (MAPS[a]?.title || a).localeCompare(MAPS[b]?.title || b, undefined, { sensitivity: 'base' });
}

/** Dashboard tiles that are email tools — second route from the inbox empty pane. */
const EMAIL_DASHBOARD_LINK_KEYS = new Set(['rules', 'newsletter']);

function emailDashboardLinkKeys() {
  return dashboardGridKeys().filter((key) => EMAIL_DASHBOARD_LINK_KEYS.has(key));
}

function buildEmailDashboardLinkGrid() {
  const keys = emailDashboardLinkKeys();
  if (!keys.length) return null;
  const row = document.createElement('div');
  row.className = 'em-empty-dash-links';
  for (const key of keys) {
    const m = MAPS[key];
    if (!m) continue;
    const iconKey = mapIconName(key);
    if (m.link) {
      row.appendChild(createBrandBtn({ variant: 'glass', href: m.link, label: m.title, iconKey }));
    } else {
      row.appendChild(
        createBrandBtn({
          variant: 'glass',
          label: m.title,
          iconKey,
          onClick: () => setActiveMap(key, { force: true }),
        }),
      );
    }
  }
  return row;
}

function dashboardCardsFromConfig() {
  const cards = window.__installConfig?.dashboardCards;
  return Array.isArray(cards) ? cards : [];
}

/** Dashboard launcher tiles from enabled modules + core OS cards. */
function dashboardGridCards() {
  const configured = dashboardCardsFromConfig();
  if (configured.length) {
    return configured.filter((card) => {
      const key = card?.mapKey;
      if (!key || !MAPS[key] || !canOpenMapKey(key)) return false;
      return true;
    });
  }
  return dashboardGridKeys().map((key) => ({
    id: key,
    title: MAPS[key]?.title || key,
    icon: mapIconName(key),
    mapKey: key,
  }));
}

/** Dashboard launcher tiles from install footerNav, A–Z. Saved tab order does not hide new keys. */
function dashboardGridKeys() {
  const fromCards = dashboardCardsFromConfig();
  if (fromCards.length) {
    return fromCards.map((card) => card.mapKey).filter((key) => MAPS[key] && canOpenMapKey(key));
  }
  const keys = [];
  for (const key of dashboardTabKeys(defaultTabKeys())) {
    const m = MAPS[key];
    if (!m) continue;
    if (m.link) {
      keys.push(key);
    } else if (
      key !== 'dashboard' &&
      !SETTINGS_MAP_TYPES.has(key) &&
      !DASHBOARD_FOOTER_KEYS.has(key)
    ) {
      keys.push(key);
    }
  }
  keys.sort(compareDashboardTitle);
  return keys;
}

function closeMarketingOverlay() {
  const marketing = document.querySelector('[data-marketing-menu]');
  if (typeof window.__setOverlayMenuOpen === 'function') {
    window.__setOverlayMenuOpen(marketing, false);
    return;
  }
  const toggle = document.querySelector('[data-marketing-menu-toggle]');
  if (marketing) marketing.hidden = true;
  toggle?.classList.remove('is-open');
  toggle?.setAttribute('aria-expanded', 'false');
  toggle?.setAttribute('aria-label', 'Open menu');
  document.documentElement.classList.remove('marketing-menu-open');
}

function setAccountMenuOpen(open) {
  const menu = document.getElementById('topbar-profile-menu');
  const toggle = document.getElementById('topbar-profile-toggle');
  if (!menu || !toggle) return;
  if (typeof window.__setOverlayMenuOpen === 'function') {
    window.__setOverlayMenuOpen(menu, open);
    return;
  }
  if (open) closeMarketingOverlay();
  menu.hidden = !open;
  toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  document.documentElement.classList.toggle('account-menu-open', open);
  document.documentElement.classList.toggle(
    'overlay-menu-open',
    open || Boolean(document.querySelector('.overlay-menu:not([hidden])')),
  );
  window.__syncOverlayMenuScrollLock?.();
}

function closeTopbarMenus() {
  setAccountMenuOpen(false);
  syncFooterNav();
}

function toggleTopbarMenu() {
  const menu = document.getElementById('topbar-profile-menu');
  if (!menu) return;
  const willOpen = menu.hidden;
  if (willOpen) setAccountMenuOpen(true);
  else closeTopbarMenus();
  syncFooterNav();
}

function dashboardSectionItems(order) {
  const items = [];
  for (const key of dashboardTabKeys(order || defaultTabKeys())) {
    const m = MAPS[key];
    if (!m) continue;
    items.push({
      kind: m.link ? 'link' : 'map',
      key,
      label: m.title,
      icon: mapIconName(key),
      href: m.link || null,
    });
  }
  items.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
  return items;
}

function buildHomeMapTile(key, m, iconName) {
  const tile = document.createElement('button');
  tile.type = 'button';
  tile.className = 'home-dashboard-tile';
  tile.innerHTML =
    `<span class="home-dashboard-tile-icon">${navIcon(iconName || mapIconName(key))}</span>` +
    `<span class="home-dashboard-tile-label">${escHtml(m.title)}</span>`;
  tile.addEventListener('click', () => {
    setActiveMap(key, { force: key === activeKey && isPanelMapKey(key) });
  });
  return tile;
}

function buildHomeLinkTile(item) {
  const tile = document.createElement('a');
  tile.className = 'home-dashboard-tile';
  tile.href = item.href;
  if (item.href.startsWith('http')) {
    tile.target = '_blank';
    tile.rel = 'noopener noreferrer';
  }
  tile.innerHTML =
    `<span class="home-dashboard-tile-icon">${navIcon(item.icon)}</span>` +
    `<span class="home-dashboard-tile-label">${escHtml(item.label)}</span>`;
  return tile;
}

function buildDashStat(opts) {
  const { value, label, hint, onClick, tone, muted, external } = opts;
  const el = document.createElement(muted ? 'div' : 'button');
  if (!muted) el.type = 'button';
  el.className = `dash-stat${tone ? ` dash-stat--${tone}` : ''}${muted ? ' dash-stat--muted' : ''}${external ? ' dash-stat--external' : ''}`;
  el.innerHTML =
    (external ? `<span class="dash-stat-external" aria-hidden="true">${navIcon('external-link', 14)}</span>` : '') +
    `<span class="dash-stat-value">${escHtml(String(value))}</span>` +
    `<span class="dash-stat-label">${escHtml(label)}</span>` +
    (hint ? `<span class="dash-stat-hint">${escHtml(hint)}</span>` : '');
  if (external && !muted) el.setAttribute('aria-label', `${label} (opens in new tab)`);
  if (!muted && onClick) el.addEventListener('click', onClick);
  return el;
}

function deployStatLabel(state) {
  if (state === 'live') return 'Live';
  if (state === 'stale') return 'Stale';
  if (state === 'deploying') return 'Deploying';
  if (state === 'failed') return 'Failed';
  return 'Unknown';
}

function deployStatTone(state) {
  if (state === 'live') return 'live';
  if (state === 'failed') return 'failed';
  if (state === 'stale' || state === 'deploying') return 'stale';
  return null;
}

function formatDashMoney(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n);
}

function openFinanceCrater() {
  const href = MAPS.finance?.link;
  if (href) window.open(href, '_blank', 'noopener,noreferrer');
}

function formatEventTime(iso) {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  } catch {
    return '';
  }
}

/** Compact countdown for Next 24h: "in 4h35m", "in 12m", or "now". */
function formatDashRelativeUntil(iso, nowMs = Date.now()) {
  const target = new Date(iso).getTime();
  if (!Number.isFinite(target)) return '';
  const diffMs = target - nowMs;
  if (diffMs < 60_000) return 'now';
  const totalMin = Math.floor(diffMs / 60_000);
  const hours = Math.floor(totalMin / 60);
  const minutes = totalMin % 60;
  if (hours <= 0) return `in ${minutes}m`;
  return `in ${hours}h${minutes}m`;
}

function formatDashEventWhen(iso, view) {
  if (view === 'next24') return formatDashRelativeUntil(iso);
  return formatEventTime(iso);
}

let dashRelativeTimer = null;
let dashRelativeVisibilityBound = false;

function tickDashRelativeTimes() {
  document.querySelectorAll('[data-dash-until]').forEach((el) => {
    const iso = el.getAttribute('data-dash-until');
    if (!iso) return;
    el.textContent = formatDashRelativeUntil(iso);
  });
}

function syncDashRelativeTimers() {
  tickDashRelativeTimes();
  if (!dashRelativeVisibilityBound) {
    dashRelativeVisibilityBound = true;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') tickDashRelativeTimes();
    });
  }
  if (dashRelativeTimer) return;
  dashRelativeTimer = setInterval(tickDashRelativeTimes, 1000);
}

function formatDashTodoWhen(raw) {
  const d = parseTodoDueInstant(raw);
  if (!d) return '';
  const now = new Date();
  const dueDay = isUtcDateOnlyInstant(raw, d)
    ? new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toDateString()
    : d.toDateString();
  if (d.getTime() < now.getTime() && dueDay !== now.toDateString()) return 'Overdue';
  if (dueDay === now.toDateString()) {
    const time = formatTodoDueTime(d);
    return time || 'Today';
  }
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (dueDay === tomorrow.toDateString()) return 'Tomorrow';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function dashTodoSubline(todo) {
  const bits = ['To-do'];
  if (todo.section) bits.push(todo.section);
  if (todo.assignee) bits.push(todo.assignee);
  if (todo.priority && todo.priority !== 'normal') {
    bits.push(TODO_PRIORITY_LABELS[todo.priority] || todo.priority);
  }
  return bits.join(' · ');
}

function buildDashTodayGroups(events, todos) {
  const todoItems = [];
  for (const todo of todos) {
    if (!todo?.due_date) continue;
    todoItems.push(todo);
  }
  todoItems.sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());

  const eventItems = [];
  for (const ev of events) {
    if (!ev?.time) continue;
    eventItems.push(ev);
  }
  eventItems.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

  return { todos: todoItems, events: eventItems };
}

const DASH_TIME_VIEW_KEY = 'home-dash-time-view';
const DASH_TIME_VIEWS = [
  { value: 'today', label: 'Today' },
  { value: 'next24', label: 'Next 24h' },
];

function readDashTimeView() {
  try {
    const stored = localStorage.getItem(DASH_TIME_VIEW_KEY);
    if (stored === 'today' || stored === 'next24') return stored;
  } catch {
    /* ignore */
  }
  return 'today';
}

function writeDashTimeView(view) {
  try {
    localStorage.setItem(DASH_TIME_VIEW_KEY, view);
  } catch {
    /* ignore */
  }
}

function isDashTodoDueToday(raw) {
  const d = parseTodoDueInstant(raw);
  if (!d) return false;
  const now = new Date();
  const dueDay = isUtcDateOnlyInstant(raw, d)
    ? new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toDateString()
    : d.toDateString();
  return dueDay === now.toDateString();
}

function isDashTodoOverdue(raw) {
  const d = parseTodoDueInstant(raw);
  if (!d) return false;
  const now = new Date();
  const dueDay = isUtcDateOnlyInstant(raw, d)
    ? new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toDateString()
    : d.toDateString();
  return d.getTime() < now.getTime() && dueDay !== now.toDateString();
}

function filterDashTodosForView(todos, view) {
  const now = Date.now();
  const cutoff = now + 24 * 60 * 60 * 1000;
  return todos.filter((todo) => {
    if (!todo?.due_date) return false;
    const d = parseTodoDueInstant(todo.due_date);
    if (!d) return false;
    if (view === 'today') {
      return isDashTodoOverdue(todo.due_date) || isDashTodoDueToday(todo.due_date);
    }
    if (isDashTodoOverdue(todo.due_date)) return true;
    return d.getTime() <= cutoff;
  });
}

function filterDashEventsForView(eventsToday, eventsNext24h, view) {
  return view === 'next24' ? eventsNext24h : eventsToday;
}

function dashTimeViewEmptyCopy(view, scheduleLive) {
  if (view === 'next24') {
    return scheduleLive
      ? 'Nothing in the next 24 hours.'
      : 'No due to-dos in the next 24 hours.';
  }
  return scheduleLive
    ? 'Nothing scheduled today.'
    : 'No meetings or due to-dos right now.';
}

async function markDashTodoDone(id) {
  try {
    const res = await fetch(`/api/todos/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'done' }),
    });
    await readApiJson(res);
    closeOpenSwipeRow();
    await loadAdminDashboard();
  } catch (e) {
    osAlert({ title: 'Could not complete', bodyHtml: escHtml(e.message) });
  }
}

function createDashTodoContent(todo) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'dash-event dash-event-btn';
  btn.dataset.id = String(todo.id);
  const when = formatDashTodoWhen(todo.due_date);
  const whenClass =
    when === 'Overdue'
      ? 'dash-event-time dash-event-time--overdue'
      : 'dash-event-time dash-event-time--todo';
  btn.innerHTML =
    `<span class="${whenClass}">${escHtml(when)}</span>` +
    `<div class="dash-event-body">` +
      `<div class="dash-event-title">${escHtml(todo.title || 'To-do')}</div>` +
      `<div class="dash-event-type">${escHtml(dashTodoSubline(todo))}</div>` +
    `</div>`;
  btn.addEventListener('click', () => navigateToTodo(todo.id));
  return btn;
}

function createDashTodoSwipeRow(todo) {
  return createSwipeRow(createDashTodoContent(todo), [
    swipeArchiveAction({
      label: 'Done',
      onClick: () => markDashTodoDone(todo.id),
    }),
  ]);
}

function renderDashTodayLists(container, data, view) {
  closeOpenSwipeRow();
  container.replaceChildren();
  const scheduleLive = data?.schedulingConfigured === true;
  const eventsToday = Array.isArray(data?.eventsToday) ? data.eventsToday : [];
  const eventsNext24h = Array.isArray(data?.eventsNext24h) ? data.eventsNext24h : [];
  const upcomingTodos = Array.isArray(data?.upcomingTodos) ? data.upcomingTodos : [];
  const filteredTodos = filterDashTodosForView(upcomingTodos, view);
  const filteredEvents = filterDashEventsForView(eventsToday, eventsNext24h, view);
  const todayGroups = buildDashTodayGroups(filteredEvents, filteredTodos);
  const hasTodos = todayGroups.todos.length > 0;
  const hasEvents = todayGroups.events.length > 0;

  if (!hasTodos && !hasEvents) {
    const empty = document.createElement('p');
    empty.className = 'dash-empty';
    empty.textContent = dashTimeViewEmptyCopy(view, scheduleLive);
    container.appendChild(empty);
    return;
  }

  if (hasTodos) {
    const todoList = document.createElement('div');
    todoList.className = 'dash-events';
    bindSwipeListScroll(todoList);
    for (const todo of todayGroups.todos) {
      todoList.appendChild(createDashTodoSwipeRow(todo));
    }
    container.appendChild(todoList);
  }

  if (hasEvents) {
    const eventsList = document.createElement('ul');
    eventsList.className = 'dash-events';
    for (const ev of todayGroups.events) {
      const li = document.createElement('li');
      const uid = ev.uid || ev.id;
      const canOpen = scheduleLive && uid;
      const when = formatDashEventWhen(ev.time, view);
      const untilAttr =
        view === 'next24' && ev.time
          ? ` data-dash-until="${escHtml(String(ev.time))}"`
          : '';
      if (canOpen) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'dash-event dash-event-btn';
        btn.innerHTML =
          `<span class="dash-event-time"${untilAttr}>${escHtml(when)}</span>` +
          `<div class="dash-event-body">` +
            `<div class="dash-event-title">${escHtml(ev.title || 'Event')}</div>` +
            (ev.type ? `<div class="dash-event-type">${escHtml(ev.type)}</div>` : '') +
            (ev.attendee ? `<div class="dash-event-type">${escHtml(ev.attendee)}</div>` : '') +
          `</div>`;
        btn.addEventListener('click', () => openScheduleTab({ uid }));
        li.appendChild(btn);
      } else {
        li.className = 'dash-event';
        li.innerHTML =
          `<span class="dash-event-time"${untilAttr}>${escHtml(when)}</span>` +
          `<div class="dash-event-body">` +
            `<div class="dash-event-title">${escHtml(ev.title || 'Event')}</div>` +
            (ev.type ? `<div class="dash-event-type">${escHtml(ev.type)}</div>` : '') +
          `</div>`;
      }
      eventsList.appendChild(li);
    }
    container.appendChild(eventsList);
  }

  if (view === 'next24') syncDashRelativeTimers();
}

function formatEmailWhen(iso) {
  try {
    const d = new Date(iso);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    return sameDay
      ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
      : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

function formatReviewAlertWhen(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const diffMs = Date.now() - d.getTime();
    const dayMs = 24 * 60 * 60 * 1000;
    if (diffMs >= 0 && diffMs < dayMs) {
      const minutes = Math.floor(diffMs / 60000);
      const hours = Math.floor(minutes / 60);
      if (minutes < 1) return 'just now';
      if (minutes < 60) return minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`;
      return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
    }
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

function parseSenderDisplayName(from) {
  const raw = String(from || '').trim();
  const named = raw.match(/^(.+?)\s*<[^>]+>$/);
  if (named?.[1]) return named[1].replace(/^["']|["']$/g, '').trim();
  if (/^[^\s@]+@[^\s@]+$/.test(raw)) return '';
  return raw.includes('@') ? '' : raw;
}

function senderLabelForReviewAlert(from, contactName) {
  const email = parseSenderEmail(from);
  const name = String(contactName || parseSenderDisplayName(from) || '').trim();
  if (name && email && !name.includes('@')) return `${name} · ${email}`;
  if (email) return email;
  if (name) return name;
  return String(from || '').trim();
}

function isOtpReviewAlert(item) {
  if (!item) return false;
  if (item.alertKind === 'otp') return true;
  if (String(item.tag || '').toLowerCase().startsWith('otp-')) return true;
  if (item.verificationCode) return true;
  if (item.deleteAfterAt && /verification code/i.test(String(item.title || ''))) return true;
  if (/verification code ready/i.test(String(item.title || ''))) return true;
  if (/code ready/i.test(String(item.title || ''))) return true;
  return false;
}

function isAuthLinkReviewAlert(item) {
  if (!item) return false;
  if (isOtpReviewAlert(item)) return false;
  if (isTriageExplainAlert(item)) return false;
  if (item.alertKind === 'auth_link') return true;
  if (String(item.tag || '').toLowerCase().startsWith('auth-')) return true;
  if (item.actionUrl) return true;
  if (/ready to activate/i.test(String(item.title || ''))) return true;
  if (/activation link/i.test(String(item.title || ''))) return true;
  return false;
}

function isTriageExplainAlert(item) {
  if (!item) return false;
  if (item.alertKind === 'triage') return true;
  if (String(item.tag || '').toLowerCase().startsWith('triage-')) return true;
  if (/uncertain email/i.test(String(item.title || ''))) return true;
  if (/ask agent/i.test(String(item.title || '')) && item.emailId) return true;
  return false;
}

let otpCountdownTimer = null;
let otpExpiryPurgeInFlight = false;

function formatOtpCountdown(remainingMs) {
  if (remainingMs <= 0) return '0:00';
  const sec = Math.ceil(remainingMs / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function isExpiredOtpTimestamp(iso, now = Date.now()) {
  if (!iso) return false;
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) && ms <= now;
}

function collectExpiredOtpEmailIds(now = Date.now()) {
  const ids = new Set();
  for (const ev of emailState.allEvents || []) {
    if (!ev?.id || !ev.deleteAfterAt) continue;
    if (isExpiredOtpTimestamp(ev.deleteAfterAt, now)) ids.add(String(ev.id));
  }
  document.querySelectorAll('[data-otp-expires]').forEach((el) => {
    const iso = el.getAttribute('data-otp-expires');
    if (!isExpiredOtpTimestamp(iso, now)) return;
    const banner = el.closest(
      '[data-review-email-id], [data-review-alert-tag], .em-otp-card, .admin-setup-alert--otp',
    );
    const fromTag = String(banner?.getAttribute('data-review-alert-tag') || '');
    const emailId =
      banner?.getAttribute('data-review-email-id') ||
      (fromTag.toLowerCase().startsWith('otp-')
        ? fromTag.slice(4)
        : fromTag.toLowerCase().startsWith('auth-')
          ? fromTag.slice(5)
          : '');
    if (emailId) ids.add(String(emailId));
  });
  return [...ids];
}

async function closeOtpPushNotifications(emailIds) {
  if (!('serviceWorker' in navigator) || !emailIds.length) return;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    for (const reg of regs) {
      if (typeof reg.getNotifications !== 'function') continue;
      for (const id of emailIds) {
        const notes = await reg.getNotifications({ tag: `otp-${id}` });
        for (const n of notes) n.close();
        const authNotes = await reg.getNotifications({ tag: `auth-${id}` });
        for (const n of authNotes) n.close();
      }
    }
  } catch {
    /* best-effort */
  }
}

/** Silently delete expired verification codes — no dialogs, no toast. */
async function purgeExpiredOtpsQuietly() {
  if (otpExpiryPurgeInFlight) return 0;
  const ids = collectExpiredOtpEmailIds();
  if (!ids.length) {
    tickOtpCountdowns({ purge: false });
    return 0;
  }
  otpExpiryPurgeInFlight = true;
  let deleted = 0;
  try {
    await closeOtpPushNotifications(ids);
    for (const id of ids) {
      try {
        const res = await fetch(`/api/email/inbox/${encodeURIComponent(id)}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        });
        if (!res.ok) continue;
        emailState.allEvents = (emailState.allEvents || []).filter((e) => e.id !== id);
        if (emailState.activeId === id) emailState.activeId = null;
        removeEmailRelatedAlertBanners(id);
        deleted += 1;
      } catch {
        /* keep going */
      }
    }
    if (deleted > 0) {
      document.querySelectorAll('[data-otp-expires]').forEach((el) => {
        const iso = el.getAttribute('data-otp-expires');
        if (!isExpiredOtpTimestamp(iso)) return;
        el.closest('.admin-setup-alert--otp, .em-otp-card, [data-review-email-id]')?.remove();
      });
      if (MAP?.type === 'email') renderEmailPanel();
      syncInboxAppBadge(emailState.allEvents);
      if (MAP?.type === 'dashboard') void refreshDashboardReviewBannersQuiet();
    }
    return deleted;
  } finally {
    otpExpiryPurgeInFlight = false;
  }
}

function tickOtpCountdowns(opts = {}) {
  const now = Date.now();
  let anyExpired = false;
  document.querySelectorAll('[data-otp-expires]').forEach((el) => {
    const iso = el.getAttribute('data-otp-expires');
    if (!iso) return;
    const ms = new Date(iso).getTime();
    if (!Number.isFinite(ms)) return;
    const remaining = ms - now;
    el.textContent = formatOtpCountdown(remaining);
    if (remaining <= 0) {
      anyExpired = true;
      el.closest('.admin-setup-alert--otp')?.remove();
    }
  });
  if (anyExpired && opts.purge !== false) void purgeExpiredOtpsQuietly();
}

function syncOtpCountdownTimers() {
  tickOtpCountdowns();
  if (otpCountdownTimer) return;
  otpCountdownTimer = setInterval(tickOtpCountdowns, 1000);
}

function otpCodeFromNotificationText(title, detail) {
  const raw = `${detail || ''}\n${title || ''}`;
  const google = raw.match(/\b(G-\d{6})\b/i);
  if (google?.[1]) return google[1].toUpperCase();
  const labeled = raw.match(/\bCode[:\s]+([A-Z0-9][A-Z0-9 -]{2,16}[A-Z0-9])\b/i);
  if (labeled?.[1]) return labeled[1].replace(/\s+/g, '');
  return '';
}

function otpCodeFromHash(hash) {
  const raw = String(hash || '').replace(/^#/, '');
  if (!raw) return '';
  try {
    const params = new URLSearchParams(raw.includes('=') ? raw : `c=${raw}`);
    return String(params.get('c') || '').trim();
  } catch {
    return raw.replace(/^c=/i, '').trim();
  }
}

/** Capture before boot rewrites ?tab= / hash via syncAdminTabUrl. */
const launchOtpCopy = (() => {
  try {
    const url = new URL(window.location.href);
    const code = otpCodeFromHash(url.hash);
    const wanted = url.searchParams.get('copy') === '1' || Boolean(code);
    if (wanted) {
      url.searchParams.delete('copy');
      history.replaceState(null, '', url.pathname + url.search);
    }
    return { wanted, code };
  } catch {
    return { wanted: false, code: '' };
  }
})();

async function copyOtpFromReviewAlert(item, btn) {
  let code = String(item?.verificationCode || '').trim();
  if (!code && item?.emailId) {
    const ev = emailState.allEvents.find((e) => e.id === item.emailId);
    code = String(ev?.verificationCode || '').trim();
  }
  if (!code) code = otpCodeFromNotificationText(item?.title, item?.detail);
  if (!code) {
    showChatToast('No code to copy', btn);
    return;
  }
  await copyEmailVerificationCode(code, btn);
}

async function deleteOtpFromReviewAlert(item, btn) {
  const emailId = String(item?.emailId || '').trim();
  if (!emailId) {
    await dismissReviewNotification(item, btn);
    return;
  }
  let ev = emailState.allEvents.find((e) => e.id === emailId);
  if (!ev) ev = { id: emailId, verificationCode: item.verificationCode };
  if (btn) btn.disabled = true;
  try {
    await deleteEmail(ev);
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function activateAuthLinkFromReviewAlert(item, btn) {
  let url = String(item?.actionUrl || '').trim();
  if (!url && item?.emailId) {
    const ev = emailState.allEvents.find((e) => e.id === item.emailId);
    url = String(ev?.actionUrl || '').trim();
  }
  if (url) {
    try {
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      /* fall through to delete anyway */
    }
  } else if (item?.emailId) {
    setActiveMap('email', { force: true, emailId: item.emailId });
    return;
  }
  await deleteOtpFromReviewAlert(item, btn);
}

async function explainUncertainEmailFromAlert(item, btn) {
  const emailId = String(item?.emailId || '').trim();
  if (!emailId) {
    await dismissReviewNotification(item, btn);
    return;
  }
  if (btn) btn.disabled = true;
  try {
    let ev = emailState.allEvents.find((e) => e.id === emailId);
    if (!ev) ev = { id: emailId, from: item.from, subject: item.subject, summary: item.detail };
    const full = await fetchFullEmailRecord(ev);
    const lines = [
      buildEmailAgentPrompt(full),
      '',
      'This email was low-confidence on automatic classification. Rules were applied as a fallback.',
      'Please explain what this email is, what category it should be, and whether any automation should change.',
    ];
    if (full?.routeNote) lines.push('', `Current route note: ${full.routeNote}`);
    if (full?.action) lines.push(`Current action: ${full.action}`);
    if (full?.category) lines.push(`Current category: ${full.category}`);
    await askAgentWithPrompt(lines.join('\n'), {
      sourceEmailId: full.id || emailId,
      sourceJobSlug: full.jobSlug || null,
    });
    await dismissReviewNotification(item, null);
  } finally {
    if (btn) btn.disabled = false;
  }
}

/** Open Email Lab with this notification’s email prefilled in Try-an-email. */
async function openRulesLabFromNotification(item, btn) {
  const emailId = String(item?.emailId || '').trim();
  if (!emailId) return;
  if (btn) btn.disabled = true;
  try {
    let ev = emailState.allEvents.find((e) => e.id === emailId);
    if (!ev) {
      ev = {
        id: emailId,
        from: item.from,
        subject: item.subject,
        summary: item.detail,
        bodySnippet: item.detail,
      };
    }
    const full = await fetchFullEmailRecord(ev);
    setActiveMap('rules', { force: true });
    await openRulesLabWithEmail(full, { run: true });
  } catch (e) {
    console.warn('[rules] open from notification failed', e);
    await osAlert({
      title: 'Could not open Email Lab',
      bodyHtml: escHtml(e?.message || String(e)),
    });
  } finally {
    if (btn) btn.disabled = false;
  }
}

function authLinkPurposeLabel(item) {
  const title = String(item?.title || '').trim();
  const stripped = title.replace(/\s*[—–-]\s*ready to activate\s*$/i, '').trim();
  if (stripped) return stripped;
  const detail = String(item?.detail || item?.summary || '').trim();
  const fromDetail = detail.match(/^([^—–-]+)/);
  if (fromDetail?.[1]) return fromDetail[1].trim();
  return 'Activation link';
}

function reviewAlertCopyIsDuplicated(title, detail) {
  const t = String(title || '')
    .trim()
    .replace(/…+$/u, '')
    .trim();
  const d = String(detail || '').trim();
  if (!t || !d) return false;
  if (t.toLowerCase() === d.toLowerCase()) return true;
  const tLo = t.toLowerCase().replace(/^alert:\s*/i, '');
  const dLo = d.toLowerCase();
  if (dLo.startsWith(tLo)) return true;
  if (dLo.startsWith(t.toLowerCase())) return true;
  return false;
}

function reviewAlertDisplayCopy(item) {
  const title = String(item?.title || '').trim();
  const detail = String(item?.detail || '').trim();
  const from = String(item?.from || '').trim();
  const subject = String(item?.subject || '').trim();
  const sender = from ? senderLabelForReviewAlert(from, item?.contactName) : '';
  const duplicated = reviewAlertCopyIsDuplicated(title, detail);

  if (duplicated) {
    return {
      headline: sender || subject || title.replace(/^alert:\s*/i, '').trim(),
      body: detail,
    };
  }

  return { headline: title, body: detail };
}

function otpPurposeLabel(item) {
  const title = String(item?.title || '').trim();
  if (title) {
    const stripped = title.replace(/\s*[—-]\s*code ready\s*$/i, '').trim();
    if (stripped) return stripped;
  }
  const summary = String(item?.summary || item?.detail || '').trim();
  const fromSummary = summary.match(/^([^:]+):\s*\d/);
  if (fromSummary?.[1]) return fromSummary[1].trim();
  return 'Verification code';
}

function projectMatchDisplayName(item) {
  const direct = String(item?.jobTitle || item?.jobSlug || '').trim();
  if (direct) return direct;
  const title = String(item?.title || '').trim();
  const prefixed = title.match(/^possible(?:\s+\w+)?\s+match:\s*(.+)$/i);
  if (prefixed?.[1]) return prefixed[1].trim();
  const fromDetail = String(item?.detail || '').match(
    /^(?:project|deal|lead|job):\s*(.+?)(?:\.|$)/i,
  );
  if (fromDetail?.[1]) return fromDetail[1].trim();
  return postTitle(1);
}

function projectMatchAttachmentBit(item) {
  const count = Number(item?.attachmentCount);
  if (Number.isFinite(count) && count > 0) {
    return `${count} attachment${count === 1 ? '' : 's'}`;
  }
  const fromDetail = String(item?.detail || '');
  const n = fromDetail.match(/(\d+)\s+attachments?/i);
  if (n) return `${n[1]} attachment${n[1] === '1' ? '' : 's'}`;
  return 'no attachments';
}

function reviewAlertCopyHtml(item) {
  if (item?.type === 'project_match') {
    const when = formatReviewAlertWhen(item.receivedAt);
    const projectName = projectMatchDisplayName(item);
    const headline = when
      ? `${escHtml(when)} · Possible ${escHtml(postLower(1))} match`
      : `Possible ${escHtml(postLower(1))} match`;
    const projectNameHtml = item.jobSlug
      ? `<button type="button" class="project-link-chip admin-setup-alert-project-link">${escHtml(projectName)}</button>`
      : `<span class="admin-setup-alert-project-name">${escHtml(projectName)}</span>`;
    return (
      `<strong>${headline}</strong>` +
      `<p class="admin-setup-alert-project">` +
        `<span class="admin-setup-alert-kicker">${escHtml(postTitle(1))}</span>` +
        projectNameHtml +
      `</p>` +
      `<p>Add this email's content and ${escHtml(projectMatchAttachmentBit(item))} to this ${escHtml(postLower(1))}?</p>`
    );
  }
  if (isOtpReviewAlert(item)) {
    const when = formatReviewAlertWhen(item.receivedAt);
    const purpose = otpPurposeLabel(item);
    const code = String(item.verificationCode || '').trim();
    const sender = item.from ? senderLabelForReviewAlert(item.from, item.contactName) : '';
    const headline = when ? `${escHtml(when)} · ${escHtml(purpose)}` : escHtml(purpose);
    const codeHtml = code
      ? `<p class="admin-otp-code-display">${escHtml(code)}</p>`
      : `<p>${escHtml(item.detail || 'Tap Copy code')}</p>`;
    const countdownHtml = item.deleteAfterAt
      ? `<p class="admin-otp-expiry"><span class="admin-otp-countdown" data-otp-expires="${escHtml(item.deleteAfterAt)}">—</span> until auto-delete</p>`
      : '';
    const senderHtml = sender ? `<p class="admin-otp-sender">${escHtml(sender)}</p>` : '';
    return `<strong>${headline}</strong>${codeHtml}${senderHtml}${countdownHtml}`;
  }
  if (isAuthLinkReviewAlert(item)) {
    const when = formatReviewAlertWhen(item.receivedAt);
    const purpose = authLinkPurposeLabel(item);
    const sender = item.from ? senderLabelForReviewAlert(item.from, item.contactName) : '';
    const headline = when ? `${escHtml(when)} · ${escHtml(purpose)}` : escHtml(purpose);
    const body = String(item.detail || item.summary || '').trim();
    const bodyHtml =
      body && body.toLowerCase() !== purpose.toLowerCase()
        ? `<p>${escHtml(body)}</p>`
        : `<p>Tap Activate to open the sign-in link</p>`;
    const countdownHtml = item.deleteAfterAt
      ? `<p class="admin-otp-expiry"><span class="admin-otp-countdown" data-otp-expires="${escHtml(item.deleteAfterAt)}">—</span> until auto-delete</p>`
      : '';
    const senderHtml = sender ? `<p class="admin-otp-sender">${escHtml(sender)}</p>` : '';
    return `<strong>${headline}</strong>${bodyHtml}${senderHtml}${countdownHtml}`;
  }
  if (isTriageExplainAlert(item)) {
    const when = formatReviewAlertWhen(item.receivedAt);
    const sender = item.from ? senderLabelForReviewAlert(item.from, item.contactName) : '';
    const headline = when
      ? `${escHtml(when)} · Uncertain classification`
      : 'Uncertain classification';
    const body = String(item.detail || item.summary || item.subject || '').trim();
    const bodyHtml = body ? `<p>${escHtml(body)}</p>` : `<p>Tap Explain to ask the agent</p>`;
    const senderHtml = sender ? `<p class="admin-otp-sender">${escHtml(sender)}</p>` : '';
    return `<strong>${headline}</strong>${bodyHtml}${senderHtml}`;
  }
  const when = formatReviewAlertWhen(item.receivedAt);
  const { headline, body } = reviewAlertDisplayCopy(item);
  const headlineLine = when
    ? headline
      ? `${escHtml(when)} · ${escHtml(headline)}`
      : escHtml(when)
    : escHtml(headline);
  const bodyHtml =
    body && body.toLowerCase() !== headline.toLowerCase() ? `<p>${escHtml(body)}</p>` : '';
  const auditHtml = isReceiptExpenseNotification(item) ? classificationAuditTrailHtml(item) : '';
  return `<strong>${headlineLine}</strong>${bodyHtml}${auditHtml}`;
}

/** Expandable decision path for receipt / classification notifications. */
function classificationAuditRuleLinkHtml(step, { asTitle = false } = {}) {
  const ruleId = String(step?.ruleId || '').trim();
  const openLab = Boolean(step?.openLab) && !ruleId;
  if (!ruleId && !openLab) return '';
  const label = asTitle
    ? String(step?.ruleTitle || step?.detail || 'Edit rule').trim() || 'Edit rule'
    : openLab
      ? 'Open Email Lab'
      : 'Edit rule';
  const attrs = ruleId
    ? `data-em-open-rule="${escHtml(ruleId)}"`
    : 'data-em-open-lab';
  return `<a class="admin-classification-audit-rule" href="/admin/?tab=rules" ${attrs}>${escHtml(label)}</a>`;
}

function classificationAuditTrailHtml(item) {
  const steps = Array.isArray(item?.auditTrail) ? item.auditTrail : [];
  if (!steps.length) return '';
  const lis = steps
    .map((step) => {
      const decision = String(step?.decision || '').trim();
      if (!decision) return '';
      const detail = String(step?.detail || '').trim();
      const isRuleRow = decision.toLowerCase() === 'rule';
      const link = classificationAuditRuleLinkHtml(step, { asTitle: isRuleRow });
      let detailHtml = '';
      if (isRuleRow && link) {
        detailHtml = `<span class="admin-classification-audit-detail">${link}</span>`;
      } else if (detail) {
        detailHtml = `<span class="admin-classification-audit-detail">${escHtml(detail)}${
          link ? ` ${link}` : ''
        }</span>`;
      } else if (link) {
        detailHtml = `<span class="admin-classification-audit-detail">${link}</span>`;
      }
      return `<li><span class="admin-classification-audit-decision">${escHtml(decision)}</span>${detailHtml}</li>`;
    })
    .filter(Boolean)
    .join('');
  if (!lis) return '';
  return `<details class="admin-classification-audit"><summary>Why this classification</summary><ol>${lis}</ol></details>`;
}

let uptimePlatformSyncPollTimer = null;
let uptimePlatformSyncActive = false;

const UPTIME_SYNC_SITES_BTN_SELECTOR = '.dash-uptime-sync-sites-btn';

function uptimeMonitorTileMeta(m) {
  if (m?.tile_label) return { offline: m.is_offline === true, label: m.tile_label };
  const status = Number(m?.status);
  if (status === 0) return { offline: true, label: 'offline' };
  if (status === 8 || status === 9 || m?.is_down) return { offline: true, label: 'down' };
  if (m?.uptime_ratio_7d != null) return { offline: false, label: `${Number(m.uptime_ratio_7d).toFixed(1)}%` };
  return { offline: false, label: 'up' };
}

function getUptimeSyncSitesButton() {
  return document.querySelector(UPTIME_SYNC_SITES_BTN_SELECTOR);
}

function setUptimeSyncButtonBusy(busy, status) {
  const syncBtn = getUptimeSyncSitesButton();
  if (!syncBtn) return;
  syncBtn.classList.toggle('dash-uptime-tile--syncing', busy);
  syncBtn.setAttribute('aria-busy', busy ? 'true' : 'false');
  const nameEl = syncBtn.querySelector('.dash-uptime-name');
  if (!nameEl) return;
  if (!busy) {
    nameEl.textContent = 'Sync sites';
    return;
  }
  if (status?.created > 0) {
    nameEl.textContent = `Syncing… ${status.created} added`;
  } else if (status?.phase === 'discovering') {
    nameEl.textContent = 'Finding sites…';
  } else {
    nameEl.textContent = 'Syncing sites…';
  }
}

function stopUptimePlatformSyncPolling() {
  if (uptimePlatformSyncPollTimer != null) {
    clearInterval(uptimePlatformSyncPollTimer);
    uptimePlatformSyncPollTimer = null;
  }
}

function ensureUptimePlatformSyncPolling() {
  if (uptimePlatformSyncPollTimer != null) return;

  const poll = async () => {
    try {
      const res = await fetch('/api/uptime/sync/status');
      const data = await res.json().catch(() => null);
      if (!data?.ok) return;

      if (data.running) {
        uptimePlatformSyncActive = true;
        setUptimeSyncButtonBusy(true, data);
        return;
      }

      stopUptimePlatformSyncPolling();
      uptimePlatformSyncActive = false;
      setUptimeSyncButtonBusy(false);
      const result = data.result ?? data;
      const created = data.created ?? result?.created ?? 0;
      void showUptimeSyncResultDialog(result);
      window.setTimeout(() => {
        void loadAdminDashboard();
      }, created > 0 ? 6000 : 2500);
    } catch {
      /* ignore transient poll errors while job runs */
    }
  };

  void poll();
  uptimePlatformSyncPollTimer = setInterval(poll, 3000);
}

// Mirror of uptimeQuickStartUrl() in src/lib/uptimerobotClient.ts — used as a
// fallback if the server payload predates the quickStartUrl field. (The server
// version also prefills &email= from UPTIMEROBOT_ALERT_EMAIL when configured.)
function uptimeQuickStartUrlClient(rawUrl) {
  let url = String(rawUrl || '').trim();
  if (!url) return 'https://uptimerobot.com/quick-monitor-setup/';
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  return `https://uptimerobot.com/quick-start?url=${encodeURIComponent(url)}`;
}

function normalizeUptimeUrlClient(raw) {
  let url = String(raw || '').trim();
  if (!url) return url;
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  return url;
}

/** Actionable error copy for Add site — includes quick-start when API create is blocked. */
function uptimeAddSiteErrorHtml(url, message) {
  const msg = String(message || 'Could not add site');
  const lower = msg.toLowerCase();
  if (
    /free plan|not allowed to use some settings|not allowed on your uptimerobot plan|blocks api/i.test(
      lower,
    )
  ) {
    const quickStart = uptimeQuickStartUrlClient(url);
    return (
      `<p>${escHtml(msg)}</p>` +
      '<p class="em-book-dialog-lead">UptimeRobot\u2019s free plan blocks API monitor creation. ' +
      'Use the one-click link below, confirm via the email UptimeRobot sends, then tap ' +
      '<strong>Sync status</strong> on the dashboard to import it.</p>' +
      `<p><a class="os-dialog-btn os-dialog-btn--primary" href="${escHtml(quickStart)}" ` +
      'target="_blank" rel="noopener noreferrer">Add to UptimeRobot ↗</a></p>'
    );
  }
  return escHtml(msg);
}

async function showUptimeSyncResultDialog(result) {
  const backdrop = document.getElementById('os-dialog-backdrop');
  const titleEl = document.getElementById('os-dialog-title');
  const bodyEl = document.getElementById('os-dialog-body');
  const actionsEl = document.getElementById('os-dialog-actions');
  if (!backdrop || !titleEl || !bodyEl || !actionsEl) return;

  const httpOk = result?.ok !== false || (result?.created ?? 0) > 0 || (result?.skipped ?? 0) > 0;
  const manualItems = Array.isArray(result?.manualItems) ? result.manualItems : [];
  titleEl.textContent = manualItems.length ? 'Website sync — manual setup needed' : 'Website sync complete';
  bodyEl.innerHTML = renderUptimeSyncResultHtml(result, httpOk);
  actionsEl.innerHTML = '';

  if (manualItems.length) {
    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'os-dialog-btn os-dialog-btn--ghost';
    copyBtn.textContent = 'Copy URLs';
    copyBtn.addEventListener('click', async () => {
      const text = manualItems.map((item) => item.url).join('\n');
      try {
        await navigator.clipboard.writeText(text);
        showCopyButtonFeedback(copyBtn);
      } catch {
        await osAlert({ title: 'Copy failed', bodyHtml: '<p>Could not access clipboard.</p>' });
      }
    });
    actionsEl.appendChild(copyBtn);

    const linkBtn = document.createElement('button');
    linkBtn.type = 'button';
    linkBtn.className = 'os-dialog-btn os-dialog-btn--ghost';
    linkBtn.textContent = 'Link monitor';
    linkBtn.addEventListener('click', () => {
      closeOsDialogBackdrop();
      void showLinkUptimeMonitorDialog();
    });
    actionsEl.appendChild(linkBtn);
  }

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'os-dialog-btn os-dialog-btn--primary';
  closeBtn.textContent = 'Done';
  closeBtn.addEventListener('click', () => closeOsDialogBackdrop());
  actionsEl.appendChild(closeBtn);
  openOsDialogBackdrop();
  closeBtn.focus();
}

async function refreshUptimeSyncButtonState() {
  try {
    const res = await fetch('/api/uptime/sync/status');
    const data = await res.json().catch(() => null);
    if (!data?.ok) return;
    if (data.running) {
      uptimePlatformSyncActive = true;
      setUptimeSyncButtonBusy(true, data);
      ensureUptimePlatformSyncPolling();
    } else {
      uptimePlatformSyncActive = false;
      setUptimeSyncButtonBusy(false);
    }
  } catch {
    /* ignore */
  }
}

function renderUptimeSyncResultHtml(data, httpOk) {
  if (data?.started) {
    return (
      '<p class="em-book-dialog-lead">Website sync is running in the background. ' +
      'The <strong>Sync sites</strong> button shows progress — refresh the page if it still looks idle.</p>'
    );
  }

  const created = data?.created ?? 0;
  const skipped = data?.skipped ?? 0;
  const discovered = data?.discovered ?? 0;
  const pending = data?.pending ?? 0;

  const createdLines = (data.createdItems || [])
    .slice(0, 12)
    .map((item) => `<li>${escHtml(item.friendlyName)} <span class="dash-muted-inline">(${escHtml(item.source)})</span></li>`)
    .join('');
  const warningLines = (data.warnings || [])
    .slice(0, 8)
    .map((msg) => `<li>${escHtml(msg)}</li>`)
    .join('');
  const errorLines = (data.errors || [])
    .slice(0, 8)
    .map((msg) => `<li>${escHtml(msg)}</li>`)
    .join('');

  const manualItems = Array.isArray(data.manualItems) ? data.manualItems : [];
  const manualLines = manualItems
    .slice(0, 30)
    .map((item) => {
      const quickStart = item.quickStartUrl || uptimeQuickStartUrlClient(item.url);
      return (
        '<li class="dash-uptime-manual-item">' +
        `<span class="dash-uptime-manual-name"><strong>${escHtml(item.friendlyName)}</strong>` +
        `<span class="dash-muted-inline"> ${escHtml(item.url)}</span></span>` +
        `<a class="os-dialog-btn os-dialog-btn--primary os-dialog-btn--sm" href="${escHtml(quickStart)}" ` +
        'target="_blank" rel="noopener noreferrer">Add to UptimeRobot ↗</a>' +
        '</li>'
      );
    })
    .join('');
  const manualBlock = manualItems.length
    ? '<div class="dash-uptime-manual">' +
      '<p class="em-book-dialog-lead">UptimeRobot\u2019s free plan blocks creating monitors through the API, so these can\u2019t be added automatically. ' +
      'Click <strong>Add to UptimeRobot</strong> on each site \u2014 it opens UptimeRobot\u2019s one-click quick-start ' +
      '(solves the challenge in your browser). Confirm via the email UptimeRobot sends, then click ' +
      '<strong>Sync status</strong> here to import them.</p>' +
      `<ul class="meeting-confirm-steps dash-uptime-manual-list">${manualLines}</ul>` +
      '</div>'
    : '';

  const pendingNote = pending > 0
    ? ` · <strong>${pending}</strong> pending (run again to continue)`
    : '';

  const accountLine = data.account
    ? `<p class="dash-muted-inline">UptimeRobot account: <strong>${data.account.monitorCount}/${data.account.monitorLimit}</strong> monitors used` +
      (data.localMonitorCount != null ? ` · ${data.localMonitorCount} cached locally` : '') +
      `</p>`
    : '';

  const partial = (data.created ?? 0) > 0 || (data.pending ?? 0) > 0;
  const failLead = (!httpOk || data.ok === false) && !partial
    ? '<p class="dash-empty">Sync did not complete successfully.</p>'
    : partial && data.ok === false
      ? '<p class="dash-muted-inline">Partial sync — run again in about a minute to continue.</p>'
    : '';

  return (
    failLead +
    manualBlock +
    accountLine +
    `<p><strong>${created}</strong> added · <strong>${skipped}</strong> already monitored · <strong>${discovered}</strong> found${pendingNote}</p>` +
    (createdLines ? `<ul class="meeting-confirm-steps">${createdLines}</ul>` : '') +
    (warningLines ? `<p class="dash-empty">Warnings</p><ul class="meeting-confirm-steps">${warningLines}</ul>` : '') +
    (errorLines ? `<p class="dash-empty">Errors</p><ul class="meeting-confirm-steps">${errorLines}</ul>` : '')
  );
}

async function runReviewScheduleAction(item, action, btn) {
  const ev = emailState.allEvents.find((e) => e.id === item.emailId) || {
    id: item.emailId,
    from: item.from,
    contactName: item.attendeeName,
  };
  await runEmailScheduleAction(ev, action, btn);
  updateInboxBadgesFromState();
  if (MAP.type === 'dashboard') await loadAdminDashboard();
}

async function logReceiptExpenseFromAlert(item, btn) {
  const emailId = String(item?.emailId || '').trim();
  if (!emailId) return;
  const prevLabel = btn?.textContent;
  if (btn) {
    btn.disabled = true;
    if (prevLabel) btn.textContent = 'Logging…';
  }
  try {
    const res = await fetch(`/api/email/inbox/${encodeURIComponent(emailId)}/expense`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const data = await readApiJson(res);
    if (!res.ok || !data.ok) {
      const err = String(data.error || `HTTP ${res.status}`);
      if (res.status === 409 && /already logged/i.test(err)) {
        if (btn) btn.textContent = 'Done';
        await new Promise((resolve) => setTimeout(resolve, 600));
        removeReviewAlertBanner(emailId);
        syncReviewBadge(Math.max(0, reviewsPendingCount - 1));
        if (emailState.activeId === emailId) renderEmailPanel();
        if (MAP.type === 'dashboard') await loadAdminDashboard();
        return;
      }
      throw new Error(err);
    }

    if (data.event) {
      const idx = emailState.allEvents.findIndex((e) => e.id === emailId);
      if (idx !== -1) emailState.allEvents[idx] = data.event;
    }

    if (btn) btn.textContent = 'Done';
    await new Promise((resolve) => setTimeout(resolve, 1000));

    removeReviewAlertBanner(emailId);
    syncReviewBadge(Math.max(0, reviewsPendingCount - 1));
    if (emailState.activeId === emailId) renderEmailPanel();
    if (MAP.type === 'dashboard') await loadAdminDashboard();
  } catch (e) {
    await osAlert({ title: 'Could not log expense', bodyHtml: escHtml(e.message || String(e)) });
    if (btn) {
      btn.disabled = false;
      if (prevLabel) btn.textContent = prevLabel;
    }
  }
}

async function archiveReceiptFromAlert(item, btn) {
  const emailId = String(item?.emailId || '').trim();
  if (!emailId) return;
  const ev = emailState.allEvents.find((e) => e.id === emailId);
  const prevLabel = btn?.textContent;
  if (btn) {
    btn.disabled = true;
    if (prevLabel) btn.textContent = 'Archiving…';
  }
  try {
    const res = await fetch(`/api/email/inbox/${encodeURIComponent(emailId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'filed', status: 'FILED', markAutomationAck: true }),
    });
    const data = await readApiJson(res);
    if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);

    if (data.event) {
      const idx = emailState.allEvents.findIndex((e) => e.id === emailId);
      if (idx !== -1) emailState.allEvents[idx] = data.event;
    } else if (ev) {
      applyEmailPatchResult(emailId, {
        ...ev,
        action: 'filed',
        status: 'FILED',
        automationAckAt: new Date().toISOString(),
      });
    }
    removeReviewAlertBanner(emailId);
    syncReviewBadge(Math.max(0, reviewsPendingCount - 1));
    if (emailState.activeId === emailId) renderEmailPanel();
    if (MAP.type === 'dashboard') await loadAdminDashboard();
  } catch (e) {
    await osAlert({ title: 'Could not archive', bodyHtml: escHtml(e.message || String(e)) });
  } finally {
    if (btn) {
      btn.disabled = false;
      if (prevLabel) btn.textContent = prevLabel;
    }
  }
}

/** Keys for notifications dismissed locally but not yet committed (undo window). */
const pendingDismissKeys = new Set();

function reviewNotificationUndoKey(item) {
  if (item?.alertId) return `alert:${String(item.alertId).trim()}`;
  if (item?.engagementId) return `engagement:${String(item.engagementId).trim()}`;
  if (item?.commentId) return `comment:${String(item.commentId).trim()}`;
  if (item?.emailId) return `email:${String(item.emailId).trim()}`;
  return '';
}

function filterPendingDismissNotifications(notifications) {
  if (!Array.isArray(notifications) || !notifications.length) return [];
  if (!pendingDismissKeys.size && !pendingShakeUndoKey()) return notifications;
  return notifications.filter((n) => {
    const key = reviewNotificationUndoKey(n);
    if (!key) return true;
    if (pendingDismissKeys.has(key) || isShakeUndoPendingKey(key)) return false;
    return true;
  });
}

function removeReviewAlertBannerForItem(item) {
  if (item?.alertId) return removeReviewAlertBanner(null, null, null, item.alertId);
  if (item?.engagementId) return removeReviewAlertBanner(null, null, item.engagementId);
  if (item?.commentId) return removeReviewAlertBanner(null, item.commentId);
  if (item?.emailId) return removeReviewAlertBanner(item.emailId);
  return false;
}

function restoreReviewAlertBanner(item) {
  if (!item) return;
  const scroll = document.querySelector('#dashboard-panel .home-dashboard-scroll');
  if (!scroll) return;

  const key = reviewNotificationUndoKey(item);
  if (key?.startsWith('alert:')) {
    const id = key.slice('alert:'.length);
    if (document.querySelector(`.dash-review-alerts [data-review-alert-id="${CSS.escape(id)}"]`)) {
      return;
    }
  } else if (key?.startsWith('engagement:')) {
    const id = key.slice('engagement:'.length);
    if (
      document.querySelector(`.dash-review-alerts [data-review-engagement-id="${CSS.escape(id)}"]`)
    ) {
      return;
    }
  } else if (key?.startsWith('comment:')) {
    const id = key.slice('comment:'.length);
    if (document.querySelector(`.dash-review-alerts [data-review-comment-id="${CSS.escape(id)}"]`)) {
      return;
    }
  } else if (key?.startsWith('email:')) {
    const id = key.slice('email:'.length);
    if (document.querySelector(`.dash-review-alerts [data-review-email-id="${CSS.escape(id)}"]`)) {
      return;
    }
  }

  let wrap = scroll.querySelector('.dash-review-alerts');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.className = 'dash-review-alerts';
    scroll.insertBefore(wrap, scroll.firstChild);
  }
  wrap.insertBefore(buildReviewAlertBanner(item), wrap.firstChild);
  syncOtpCountdownTimers();
  syncReviewBadge(reviewsPendingCount + 1);
}

async function ackPushAlertOnServer(alertId, tag) {
  const id = String(alertId || '').trim();
  const tagStr = String(tag || '').trim();
  if (!id) return null;

  const qs = tagStr ? `?tag=${encodeURIComponent(tagStr)}` : '';
  const url = `/api/admin/alerts/${encodeURIComponent(id)}${qs}`;

  async function ack(method) {
    const res = await adminFetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
    });
    const data = await readApiJson(res);
    if (!res.ok) {
      if (res.status === 404) return { missing: true };
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    if (!data.ok) {
      throw new Error(data.error || `Unexpected response (HTTP ${res.status})`);
    }
    return data;
  }

  try {
    return await ack('PATCH');
  } catch (e) {
    const msg = String(e?.message || e);
    if (msg.includes('Unexpected response') || msg.includes('Empty response')) {
      return await ack('POST');
    } else if (msg.includes('Alert not found') || msg.includes('HTTP 404')) {
      /* Stale banner — treat as dismissed. */
      return { missing: true };
    } else {
      throw e;
    }
  }
}

async function commitDismissReviewNotification(item) {
  void closeOsNotificationsForReview(item);

  if (item?.alertId) {
    const data = await ackPushAlertOnServer(item.alertId, item.tag);
    applyServerBadgeCount(data);
    return;
  }
  if (item?.engagementId) {
    const res = await fetch(`/api/admin/engagement/${encodeURIComponent(item.engagementId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
    });
    const data = await readApiJson(res);
    if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
    applyServerBadgeCount(data);
    return;
  }
  if (item?.commentId) {
    const res = await fetch(`/api/work/comments/${encodeURIComponent(item.commentId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
    });
    const data = await readApiJson(res);
    if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
    applyServerBadgeCount(data);
    return;
  }
  if (!item?.emailId) return;

  const res = await fetch(`/api/email/inbox/${encodeURIComponent(item.emailId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ markAutomationAck: true }),
  });
  const text = await res.text();
  let data = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(res.ok ? 'Invalid server response' : `HTTP ${res.status}`);
    }
  }
  if (res.status === 409 && data.requiresTriage) {
    restoreReviewAlertBanner(item);
    await openNotificationTriageDialog(item);
    return;
  }
  if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);

  if (data.event) {
    const idx = emailState.allEvents.findIndex((e) => e.id === item.emailId);
    if (idx !== -1) emailState.allEvents[idx] = data.event;
  }
  if (emailState.activeId === item.emailId) renderEmailPanel();
  applyServerBadgeCount(data);
  if (data.badgeCount == null) {
    // Absolute count arrives via the debounced badge-sync push; refresh locally too.
    void refreshInboxBadgeQuiet();
  }
}

async function dismissReviewNotification(item, btn) {
  if (!item?.alertId && !item?.engagementId && !item?.commentId && !item?.emailId) return;

  const key = reviewNotificationUndoKey(item);
  if (!key) return;

  const prevLabel = btn?.textContent;
  if (btn) {
    btn.disabled = true;
    if (prevLabel) {
      btn.textContent = item.alertId ? 'Archiving…' : 'Dismissing…';
    }
  }

  pendingDismissKeys.add(key);
  try {
    removeReviewAlertBannerForItem(item);
    syncReviewBadge(Math.max(0, reviewsPendingCount - 1));
    void closeOsNotificationsForReview(item);

    // Start permission from this gesture (iOS); do not await the dialog.
    void ensureShakePermission();

    await queueShakeUndo({
      key,
      commit: async () => {
        pendingDismissKeys.delete(key);
        try {
          await commitDismissReviewNotification(item);
        } catch (e) {
          restoreReviewAlertBanner(item);
          await osAlert({
            title: item.alertId ? 'Could not archive' : 'Could not dismiss',
            bodyHtml: escHtml(e.message || String(e)),
          });
        }
      },
      undo: () => {
        pendingDismissKeys.delete(key);
        restoreReviewAlertBanner(item);
      },
    });
  } catch (e) {
    pendingDismissKeys.delete(key);
    restoreReviewAlertBanner(item);
    await osAlert({
      title: item.alertId ? 'Could not archive' : 'Could not dismiss',
      bodyHtml: escHtml(e?.message || String(e)),
    });
  } finally {
    if (btn) {
      btn.disabled = false;
      if (prevLabel) btn.textContent = prevLabel;
    }
  }
}

function sleepMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Confirm a meeting from a dashboard/email action — Confirm → Booking… → Booked, no sheet. */
async function confirmScheduledMeeting(item, btn) {
  if (!item?.emailId) return;
  const prevLabel = btn?.textContent || 'Confirm';
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Booking…';
  }
  try {
    const res = await fetch(`/api/email/inbox/${encodeURIComponent(item.emailId)}/schedule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'confirm' }),
    });
    const data = await readApiJson(res);
    if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);

    if (data.event) {
      const idx = emailState.allEvents.findIndex((e) => e.id === item.emailId);
      if (idx !== -1) emailState.allEvents[idx] = data.event;
    }
    if (btn) btn.textContent = 'Booked';
    await sleepMs(700);
    updateInboxBadgesFromState();
    removeReviewAlertBanner(item.emailId);
    syncReviewBadge(Math.max(0, reviewsPendingCount - 1));
    if (emailState.activeId === item.emailId) renderEmailPanel();
    if (MAP.type === 'dashboard') await loadAdminDashboard();
  } catch (e) {
    if (btn) {
      btn.disabled = false;
      btn.textContent = prevLabel;
    }
    await osAlert({ title: 'Could not confirm', bodyHtml: escHtml(e.message || String(e)) });
  }
}

function rescheduleScheduledMeeting(item) {
  if (item?.bookingUid) {
    openScheduleTab({ uid: item.bookingUid, view: 'week' });
    return;
  }
  if (item?.emailId) {
    setActiveMap('email', { force: true, emailId: item.emailId });
  }
}

function isAuditPushAlert(item) {
  if (item?.type !== 'push_alert') return false;
  const tag = String(item.tag || '').toLowerCase();
  if (tag.startsWith('siri-proposal-')) return true;
  return /^(?:Full )?audit (?:ready|failed)(?:\s*>|\s*:)/i.test(String(item.title || '').trim());
}

function reviewAlertTone(item) {
  if (isReceiptExpenseNotification(item)) return 'receipt';
  if (isOtpReviewAlert(item) || isAuthLinkReviewAlert(item)) return 'otp';
  if (isTriageExplainAlert(item)) return 'alert';
  if (isAuditPushAlert(item)) return 'audit';
  const type = item?.type;
  if (type === 'meeting_conflict') return 'meeting-conflict';
  if (type === 'meeting' || type === 'meeting_request' || type === 'meeting_followup') return 'meeting';
  if (
    type === 'project' ||
    type === 'project_match' ||
    type === 'project_comment' ||
    type === 'share_open' ||
    type === 'contact_form'
  ) {
    return 'project';
  }
  if (type === 'vault_entry' || type === 'deck_view' || type === 'demo_launch') return 'client';
  if (type === 'demo_request') return 'critical';
  if (type === 'push_alert' && item.alertKind === 'critical') return 'critical';
  if (type === 'push_alert' && item.alertKind === 'engagement') return 'client';
  if (type === 'push_alert' && item.alertKind === 'calendar') return 'meeting';
  return 'alert';
}

/** @deprecated use reviewAlertTone */
function reviewAlertVariant(type, item) {
  return reviewAlertTone(item ?? { type });
}

/** @deprecated use appendAdminNoticeAction — kept for any lingering callers */
function appendReviewAlertAction(actions, opts) {
  return appendAdminNoticeAction(actions, opts);
}

function workSlugFromPushAlertUrl(url) {
  if (!url) return null;
  try {
    const slug = new URL(url, window.location.origin).searchParams.get('slug')?.trim();
    return slug || null;
  } catch {
    return null;
  }
}

function workSlugFromSiriProposalTag(tag) {
  const prefix = 'siri-proposal-';
  const raw = String(tag || '');
  if (!raw.toLowerCase().startsWith(prefix)) return null;
  const slug = raw.slice(prefix.length).trim().toLowerCase();
  return /^[a-z0-9._-]+$/.test(slug) ? slug : null;
}

function auditLabelFromPushAlertTitle(title) {
  const trimmed = String(title || '').trim();
  const arrow = trimmed.match(/^(?:Full )?audit (?:ready|failed)\s*>\s*(.+)$/i);
  if (arrow?.[1]?.trim()) return arrow[1].trim();
  const match = trimmed.match(/^(?:Full )?audit (?:ready|failed):\s*(.+)$/i);
  return match?.[1]?.trim() || null;
}

function matchWorkSlugByAuditLabel(jobs, label) {
  if (!label || !Array.isArray(jobs) || !jobs.length) return null;
  const labelLower = label.toLowerCase();
  const keywords = labelLower
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, 6);

  let best = null;
  let bestScore = 0;
  for (const job of jobs) {
    const hay = `${job.title || ''} ${job.slug || ''} ${job.client || ''} ${job.contact_name || ''}`.toLowerCase();
    const score = keywords.filter((w) => hay.includes(w)).length;
    if (score > bestScore) {
      bestScore = score;
      best = job.slug;
    }
  }
  if (best && bestScore >= Math.min(2, keywords.length)) return best;
  if (keywords.length === 1) {
    for (const job of jobs) {
      const hay = `${job.title || ''} ${job.slug || ''}`.toLowerCase();
      if (hay.includes(keywords[0])) return job.slug;
    }
  }
  return null;
}

async function resolveAuditPushAlertWorkSlug(item) {
  const fromUrl = workSlugFromPushAlertUrl(item.url);
  if (fromUrl) return fromUrl;

  const fromTag = workSlugFromSiriProposalTag(item.tag);
  if (fromTag) return fromTag;

  const label = auditLabelFromPushAlertTitle(item.title);
  if (!label) return null;

  let jobs = workState.jobs || [];
  if (!jobs.length) {
    try {
      const res = await adminFetch('/api/work');
      const data = await readAdminJson(res, postTitle(2));
      if (res.ok) jobs = data.jobs || [];
    } catch {
      return null;
    }
  }

  return matchWorkSlugByAuditLabel(jobs, label);
}

async function workProjectExists(slug) {
  if (!slug) return false;
  try {
    const res = await fetch(`/api/work/${encodeURIComponent(slug)}`, {
      headers: { Accept: 'application/json' },
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function navigateToWorkIfExists(slug, opts = {}) {
  if (!(await workProjectExists(slug))) return false;
  navigateToWork(slug, opts);
  return true;
}

async function handleMissingWorkNotification(item) {
  await dismissReviewNotification(item);
  await osAlert({
    title: `${postTitle(1)} not found`,
    bodyHtml: `This ${postLower(1)} was deleted. The notification has been archived.`,
  });
  if (MAP.type === 'dashboard') await loadAdminDashboard();
}

async function openReviewNotificationTarget(item) {
  if (isReceiptExpenseNotification(item) && item.emailId) {
    setActiveMap('email', { force: true, emailId: item.emailId });
    return;
  }
  if (item.type === 'push_alert') {
    if (isAuditPushAlert(item)) {
      const slug = await resolveAuditPushAlertWorkSlug(item);
      if (slug) {
        if (!(await navigateToWorkIfExists(slug))) await handleMissingWorkNotification(item);
        return;
      }
    }
    const slug = workSlugFromPushAlertUrl(item.url);
    if (slug) {
      if (!(await navigateToWorkIfExists(slug))) await handleMissingWorkNotification(item);
      return;
    }
    if (item.url) {
      handleNotificationOpen(item.url);
      return;
    }
    return;
  }
  if (
    (item.type === 'project' ||
      item.type === 'project_match' ||
      item.type === 'project_comment' ||
      item.type === 'share_open' ||
      item.type === 'contact_form' ||
      item.type === 'demo_request') &&
    item.jobSlug
  ) {
    if (
      !(await navigateToWorkIfExists(item.jobSlug, { fromEmailId: item.emailId || null }))
    ) {
      await handleMissingWorkNotification(item);
    }
    return;
  }
  if ((item.type === 'vault_entry' || item.type === 'deck_view' || item.type === 'demo_launch') && item.contactUid) {
    navigateToClient(item.contactUid);
    return;
  }
  if (item.type === 'demo_request' && item.contactUid) {
    navigateToClient(item.contactUid);
    return;
  }
  if (item.emailId) setActiveMap('email', { force: true, emailId: item.emailId });
}

function isReceiptExpenseNotification(item) {
  return (
    item?.type === 'receipt_expense' ||
    (Boolean(item?.emailId) && /^Tax receipt/i.test(String(item?.title || '').trim()))
  );
}

function buildReviewAlertBanner(item) {
  const isProject = item.type === 'project';
  const isProjectMatch = item.type === 'project_match';
  const isProjectComment = item.type === 'project_comment';
  const isVaultEntry = item.type === 'vault_entry';
  const isShareOpen = item.type === 'share_open';
  const isDeckView = item.type === 'deck_view';
  const isDemoLaunch = item.type === 'demo_launch';
  const isDemoRequest = item.type === 'demo_request';
  const isContactForm = item.type === 'contact_form';
  const isMeetingFollowup = item.type === 'meeting_followup';
  const isMeetingRequest = item.type === 'meeting_request' || item.type === 'meeting_conflict';
  const isAutoBookedMeeting = item.type === 'meeting';
  const isReceiptExpense = isReceiptExpenseNotification(item);
  const isPushAlert = item.type === 'push_alert';
  const isOtp = isOtpReviewAlert(item);
  const isAuthLink = isAuthLinkReviewAlert(item);
  const isTriageExplain = isTriageExplainAlert(item);
  const emailAwaitingTriage = isEmailAutomationReview(item) && item.awaitingTriage;

  const actions = [];
  const customActions = Array.isArray(item?.actions)
    ? item.actions.map((a) => String(a || '').trim().toLowerCase()).filter(Boolean)
    : [];

  const notifyActionLabels = {
    copy: 'Copy code',
    activate: 'Activate',
    delete: 'Delete',
    explain: 'Explain',
    expense: 'Expense',
    archive: 'Archive',
    view: 'View',
    open: 'View',
    rules: 'Email Lab',
  };
  const pushNotifyAction = (key, extras = {}) => {
    const { label, primary, iconKey, ...rest } = extras;
    actions.push({
      label: label || notifyActionLabels[key] || key,
      iconKey: iconKey || NOTICE_ACTION_ICONS[key],
        primary: primary ?? false,
      ...rest,
    });
  };

  const pushCustomAction = (key) => {
    if (key === 'copy') {
      pushNotifyAction('copy', {
        onClick: (btn) => void copyOtpFromReviewAlert(item, btn),
      });
      return;
    }
    if (key === 'activate') {
      if (item.actionUrl) {
        pushNotifyAction('activate', {
          onClick: (btn) => void activateAuthLinkFromReviewAlert(item, btn),
        });
      }
      return;
    }
    if (key === 'delete') {
      pushNotifyAction('delete', {
        onClick: (btn) => void deleteOtpFromReviewAlert(item, btn),
      });
      return;
    }
    if (key === 'explain') {
      pushNotifyAction('explain', {
        onClick: (btn) => void explainUncertainEmailFromAlert(item, btn),
      });
      return;
    }
    if (key === 'expense') {
      pushNotifyAction('expense', {
        onClick: (btn) => void logReceiptExpenseFromAlert(item, btn),
      });
      return;
    }
    if (key === 'archive') {
      pushNotifyAction('archive', {
        onClick: (actionBtn) =>
          void (isReceiptExpense
            ? archiveReceiptFromAlert(item, actionBtn)
            : dismissReviewNotification(item, actionBtn)),
      });
      return;
    }
    if (key === 'view' || key === 'open') {
      pushNotifyAction(key, {
        onClick: () => openReviewNotificationTarget(item),
      });
      return;
    }
    if (key === 'rules') {
      pushNotifyAction('rules', {
        onClick: (btn) => void openRulesLabFromNotification(item, btn),
      });
    }
  };

  if (customActions.length && (isPushAlert || isOtp || isAuthLink || isTriageExplain || isReceiptExpense)) {
    customActions.forEach(pushCustomAction);
  } else if (isOtp) {
    pushNotifyAction('copy', {
      primary: true,
      onClick: (btn) => void copyOtpFromReviewAlert(item, btn),
    });
    pushNotifyAction('delete', {
      primary: false,
      onClick: (btn) => void deleteOtpFromReviewAlert(item, btn),
    });
  } else if (isAuthLink) {
    if (item.actionUrl) {
      pushNotifyAction('activate', {
        primary: true,
        onClick: (btn) => void activateAuthLinkFromReviewAlert(item, btn),
      });
    } else {
      pushNotifyAction('view', {
        primary: true,
        onClick: () => openReviewNotificationTarget(item),
      });
    }
    pushNotifyAction('delete', {
      primary: false,
      onClick: (btn) => void deleteOtpFromReviewAlert(item, btn),
    });
  } else if (isTriageExplain) {
    pushNotifyAction('explain', {
      primary: true,
      onClick: (btn) => void explainUncertainEmailFromAlert(item, btn),
    });
    pushNotifyAction('view', {
      primary: false,
      onClick: () => openReviewNotificationTarget(item),
    });
    pushNotifyAction('archive', {
      primary: false,
      onClick: (actionBtn) => void dismissReviewNotification(item, actionBtn),
    });
  } else if (isPushAlert) {
    pushNotifyAction('view', {
      primary: true,
      onClick: () => openReviewNotificationTarget(item),
    });
    if (!isAuditPushAlert(item)) {
      pushNotifyAction('archive', {
        primary: false,
        onClick: (actionBtn) => void dismissReviewNotification(item, actionBtn),
      });
    }
  } else if (isProjectComment || isShareOpen || isContactForm || isDemoRequest) {
    pushNotifyAction('view', {
      label: isDemoRequest && !item.jobSlug ? 'View contact' : `View ${postLower(1)}`,
      primary: true,
      onClick: () => openReviewNotificationTarget(item),
    });
  } else if (isVaultEntry) {
    pushNotifyAction('view', {
      label: 'View vault',
      primary: true,
      onClick: () => openReviewNotificationTarget(item),
    });
  } else if ((isDeckView || isDemoLaunch) && item.contactUid) {
    pushNotifyAction('view', {
      label: 'View contact',
      primary: true,
      onClick: () => openReviewNotificationTarget(item),
    });
  } else if (isProjectMatch) {
    actions.push({
      label: `Add to ${postLower(1)}`,
      primary: true,
      onClick: (btn) => void confirmSuggestedProjectMatch(item, btn),
    });
    actions.push({
      label: `Not this ${postLower(1)}`,
      onClick: (btn) => void rejectSuggestedProjectMatch(item, btn),
    });
  } else if (isProject) {
    pushNotifyAction('view', {
      label: `View ${postLower(1)}`,
      primary: true,
      onClick: () => openReviewNotificationTarget(item),
    });
  } else if (isMeetingFollowup) {
    pushNotifyAction('view', {
      label: 'View email',
      primary: true,
      onClick: () => openReviewNotificationTarget(item),
    });
  } else if (isMeetingRequest) {
    const scheduleOnly = !item.proposedMeetingStart;
    actions.push({
      label: scheduleOnly
        ? 'Send scheduling link'
        : item.type === 'meeting_conflict'
          ? 'Notify conflict'
          : 'Confirm',
      primary: true,
      onClick: (btn) =>
        void runReviewScheduleAction(
          item,
          scheduleOnly
            ? 'notify-schedule-link'
            : item.type === 'meeting_conflict'
              ? 'notify-conflict'
              : 'accept-notify',
          btn,
        ),
    });
    if (item.type === 'meeting_conflict') {
      actions.push({
        label: 'Suggest alternate',
        onClick: () => {
          if (item.emailId) {
            const inboxEv = emailState.allEvents.find((e) => e.id === item.emailId);
            if (inboxEv) openScheduleFromEmail(inboxEv);
            else setActiveMap('email', { force: true, emailId: item.emailId });
            return;
          }
          openReviewNotificationTarget(item);
        },
      });
    } else {
      pushNotifyAction('view', {
        label: 'View email',
        primary: false,
        onClick: () => openReviewNotificationTarget(item),
      });
    }
  } else if (isAutoBookedMeeting) {
    actions.push({
      label: 'Confirm',
      primary: true,
      onClick: (btn) => void confirmScheduledMeeting(item, btn),
    });
    actions.push({
      label: 'Reschedule',
      onClick: () => rescheduleScheduledMeeting(item),
    });
  } else if (isReceiptExpense) {
    pushNotifyAction('expense', {
      primary: true,
      disabled: item.amount == null,
      title: item.amount == null ? 'No dollar amount detected on this email' : undefined,
      onClick: (btn) => void logReceiptExpenseFromAlert(item, btn),
    });
    pushNotifyAction('archive', {
      primary: false,
      onClick: (btn) => void archiveReceiptFromAlert(item, btn),
    });
  }

  if (isEmailAutomationReview(item)) {
    actions.push({
      label: 'Triage',
      onClick: () => void openNotificationTriageDialog(item),
    });
  }

  // Agent → Email Lab with this email prefilled in Try-an-email.
  if (
    item.emailId &&
    (isPushAlert ||
      isOtp ||
      isAuthLink ||
      isTriageExplain ||
      isReceiptExpense ||
      isMeetingFollowup ||
      isMeetingRequest ||
      isEmailAutomationReview(item) ||
      emailAwaitingTriage)
  ) {
    const already = actions.some((a) => a.label === 'Email Lab' || a.label === 'Rules');
    if (!already) {
      pushNotifyAction('rules', {
        primary: false,
        onClick: (btn) => void openRulesLabFromNotification(item, btn),
      });
    }
  }

  const notice = buildAdminNotice({
    tone: reviewAlertTone(item),
    copyHtml: reviewAlertCopyHtml(item),
    iconUrl: resolveReviewAlertIconUrl(item),
    iconFallbackUrl: companyStaffAvatarUrl(),
    modifiers: emailAwaitingTriage ? ['triage'] : [],
    attrs: {
      'data-review-email-id': item.emailId || null,
      'data-review-comment-id': item.commentId || null,
      'data-review-engagement-id': item.engagementId || null,
      'data-review-alert-id': item.alertId || null,
      'data-review-alert-tag': item.tag || null,
    },
    actions,
    onCopyClick: () => {
      if (isOtp) void copyOtpFromReviewAlert(item, null);
      else if (isAuthLink && item.actionUrl) void activateAuthLinkFromReviewAlert(item, null);
      else openReviewNotificationTarget(item);
    },
    onDismiss: (dismissBtn) => {
      dismissBtn.disabled = true;
      void dismissReviewNotification(item).finally(() => {
        dismissBtn.disabled = false;
      });
    },
  });

  notice.copy?.querySelectorAll?.('.admin-classification-audit')?.forEach((el) => {
    el.addEventListener('click', (ev) => ev.stopPropagation());
    bindClassificationAuditLinks(el, item.emailId ? { id: item.emailId } : null);
  });
  notice.copy?.querySelector('.admin-setup-alert-project-link')?.addEventListener('click', (ev) => {
    ev.stopPropagation();
    void openReviewNotificationTarget(item);
  });

  bindReviewAlertSwipe(notice.root, item);
  return notice.root;
}

function bindReviewAlertSwipe(alert, item) {
  let startX = 0;
  let startY = 0;
  let tracking = false;

  alert.addEventListener(
    'touchstart',
    (ev) => {
      if (ev.touches.length !== 1) return;
      startX = ev.touches[0].clientX;
      startY = ev.touches[0].clientY;
      tracking = true;
      alert.style.transition = 'none';
    },
    { passive: true },
  );

  alert.addEventListener(
    'touchmove',
    (ev) => {
      if (!tracking || ev.touches.length !== 1) return;
      const dx = ev.touches[0].clientX - startX;
      const dy = ev.touches[0].clientY - startY;
      if (Math.abs(dy) > Math.abs(dx)) {
        tracking = false;
        alert.style.transform = '';
        alert.style.opacity = '';
        return;
      }
      if (dx > 0) {
        alert.style.transform = `translateX(${Math.min(dx, 120)}px)`;
        alert.style.opacity = String(Math.max(0.35, 1 - dx / 180));
      }
    },
    { passive: true },
  );

  alert.addEventListener(
    'touchend',
    (ev) => {
      if (!tracking) return;
      tracking = false;
      alert.style.transition = 'transform 0.2s ease, opacity 0.2s ease';
      const dx = (ev.changedTouches[0]?.clientX ?? startX) - startX;
      if (dx > 80) {
        alert.style.transform = 'translateX(120%)';
        alert.style.opacity = '0';
        window.setTimeout(() => {
          void dismissReviewNotification(item).catch(() => {
            alert.style.transform = '';
            alert.style.opacity = '';
          });
        }, 180);
        return;
      }
      alert.style.transform = '';
      alert.style.opacity = '';
    },
    { passive: true },
  );
}

async function dismissPushAlertById(alertId, tag) {
  const id = String(alertId || '').trim();
  if (!id) return;

  // OS notification Archive — commit immediately (no in-app shake window).
  if (isShakeUndoPendingKey(`alert:${id}`)) {
    await flushShakeUndoCommit();
  }

  const data = await ackPushAlertOnServer(id, tag);
  removeReviewAlertBanner(null, null, null, id);
  void closeOsNotificationsForReview({ alertId: id, tag });
  if (!applyServerBadgeCount(data)) {
    syncReviewBadge(Math.max(0, reviewsPendingCount - 1));
  }
  if (MAP.type === 'dashboard') await loadAdminDashboard();
}

const EMAIL_AUTOMATION_REVIEW_TYPES = new Set([
  'meeting',
  'meeting_request',
  'meeting_conflict',
  'meeting_followup',
  'project',
  'project_match',
]);

function isEmailAutomationReview(item) {
  return Boolean(item?.emailId && EMAIL_AUTOMATION_REVIEW_TYPES.has(item.type));
}

const TRIAGE_FEEDBACK_OPTIONS = [
  {
    action: 'expected',
    label: 'Expected',
    detail: 'Handle similar cases quietly next time.',
  },
  {
    action: 'important',
    label: 'Always alert me',
    detail: 'Keep surfacing similar cases for review.',
  },
  {
    action: 'ignore',
    label: 'Ignore similar',
    detail: 'Suppress future matches like this.',
  },
  {
    action: 'teach',
    label: 'Teach the agent',
    detail: 'Save a note to knowledge for how to handle these.',
    needsNote: true,
  },
];

function resolveNotificationEmailId(item) {
  const direct = String(item?.emailId || '').trim();
  if (direct) return direct;
  const url = String(item?.url || '').trim();
  if (!url) return '';
  try {
    const parsed = url.startsWith('http') ? new URL(url) : new URL(url, window.location.origin);
    return parsed.searchParams.get('email')?.trim() || '';
  } catch {
    return '';
  }
}

function notificationTriageDialogHtml(_item) {
  const options = TRIAGE_FEEDBACK_OPTIONS.map(
    (opt) =>
      `<label class="alert-triage-option">` +
        `<input type="radio" name="alert-triage-action" value="${escHtml(opt.action)}" />` +
        `<span class="alert-triage-option-copy">` +
          `<strong>${escHtml(opt.label)}</strong>` +
          `<span>${escHtml(opt.detail)}</span>` +
        `</span>` +
      `</label>`,
  ).join('');
  return (
    `<p class="alert-triage-intro">Pick how similar notifications should be handled in the future.</p>` +
    `<div class="alert-triage-options">${options}</div>` +
    `<label class="alert-triage-note-wrap" hidden>` +
      `<span class="alert-triage-note-label">What should the agent know?</span>` +
      `<textarea class="alert-triage-note" rows="3" maxlength="2000" placeholder="e.g. Meeting requests from this client always need manual review…"></textarea>` +
    `</label>`
  );
}

function dismissSimilarNotificationsAfterTriage(alsoResolved) {
  if (!Array.isArray(alsoResolved) || !alsoResolved.length) return;
  let nonEmailRemoved = 0;
  for (const r of alsoResolved) {
    if (r.emailId) {
      removeEmailRelatedAlertBanners(r.emailId);
    } else if (r.alertId) {
      if (removeReviewAlertBanner(null, null, null, r.alertId)) nonEmailRemoved += 1;
    } else if (r.engagementId) {
      if (removeReviewAlertBanner(null, null, r.engagementId)) nonEmailRemoved += 1;
    } else if (r.commentId) {
      if (removeReviewAlertBanner(null, r.commentId)) nonEmailRemoved += 1;
    }
  }
  if (nonEmailRemoved > 0) {
    syncReviewBadge(Math.max(0, reviewsPendingCount - nonEmailRemoved));
  }
}

function dismissNotificationAfterTriage(item, data) {
  const emailId = String(data?.emailId || resolveNotificationEmailId(item) || item?.emailId || '').trim();
  if (data?.event && emailId) {
    const idx = emailState.allEvents.findIndex((e) => e.id === emailId);
    if (idx !== -1) emailState.allEvents[idx] = data.event;
  }
  if (emailId) {
    removeEmailRelatedAlertBanners(emailId);
  } else if (item?.alertId) {
    removeReviewAlertBanner(null, null, null, item.alertId);
    syncReviewBadge(Math.max(0, reviewsPendingCount - 1));
  } else if (item?.engagementId) {
    removeReviewAlertBanner(null, null, item.engagementId);
    syncReviewBadge(Math.max(0, reviewsPendingCount - 1));
  } else if (item?.commentId) {
    removeReviewAlertBanner(null, item.commentId);
    syncReviewBadge(Math.max(0, reviewsPendingCount - 1));
  } else if (item?.emailId) {
    removeReviewAlertBanner(item.emailId);
    syncReviewBadge(Math.max(0, reviewsPendingCount - 1));
  }
  dismissSimilarNotificationsAfterTriage(data?.alsoResolved);
  if (emailId && emailState.activeId === emailId) renderEmailPanel();
}

async function submitNotificationTriage(item, action, note, btn) {
  const prevLabel = btn?.textContent;
  if (btn) {
    btn.disabled = true;
    if (prevLabel) btn.textContent = 'Saving…';
  }
  try {
    const res = await fetch('/api/admin/notifications/triage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action,
        note: note || undefined,
        notification: {
          type: item.type,
          emailId: resolveNotificationEmailId(item) || undefined,
          alertId: item.alertId || undefined,
          commentId: item.commentId || undefined,
          engagementId: item.engagementId || undefined,
          title: item.title,
          detail: item.detail,
          subject: item.subject,
          from: item.from || item.attendeeEmail,
          url: item.url,
        },
      }),
    });
    const data = await readApiJson(res);
    if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
    dismissNotificationAfterTriage(item, data);
    return true;
  } catch (e) {
    await osAlert({ title: 'Could not save triage', bodyHtml: escHtml(e.message || String(e)) });
    return false;
  } finally {
    if (btn) {
      btn.disabled = false;
      if (prevLabel) btn.textContent = prevLabel;
    }
  }
}

function openNotificationTriageDialog(item) {
  const backdrop = document.getElementById('os-dialog-backdrop');
  const titleEl = document.getElementById('os-dialog-title');
  const bodyEl = document.getElementById('os-dialog-body');
  const actionsEl = document.getElementById('os-dialog-actions');
  if (!backdrop || !titleEl || !bodyEl || !actionsEl) return Promise.resolve(false);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      releaseOsDialogKeyboardLayout();
      closeOsDialogBackdrop();
      resolve(value);
    };

    titleEl.textContent = 'How should similar cases be handled?';
    bodyEl.innerHTML = notificationTriageDialogHtml(item);
    actionsEl.innerHTML = '';

    const noteWrap = bodyEl.querySelector('.alert-triage-note-wrap');
    const noteEl = bodyEl.querySelector('.alert-triage-note');
    const radios = bodyEl.querySelectorAll('input[name="alert-triage-action"]');

    const syncNoteVisibility = () => {
      const selected = bodyEl.querySelector('input[name="alert-triage-action"]:checked');
      const teach = selected?.value === 'teach';
      if (noteWrap) noteWrap.hidden = !teach;
      if (teach && noteEl) scheduleOsDialogFieldFocus(noteEl);
    };

    for (const radio of radios) {
      radio.addEventListener('change', syncNoteVisibility);
    }
    if (radios[0]) {
      radios[0].checked = true;
      syncNoteVisibility();
    }

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'os-dialog-btn os-dialog-btn--ghost';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => finish(false));
    actionsEl.appendChild(cancelBtn);

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'os-dialog-btn os-dialog-btn--primary';
    saveBtn.textContent = 'Save & resolve';
    saveBtn.addEventListener('click', async () => {
      const selected = bodyEl.querySelector('input[name="alert-triage-action"]:checked');
      const action = selected?.value;
      if (!action) {
        await osAlert({ title: 'Choose an option', bodyHtml: 'Pick how similar cases should be handled.' });
        return;
      }
      const note = action === 'teach' ? String(noteEl?.value || '').trim() : '';
      if (action === 'teach' && !note) {
        await osAlert({ title: 'Add a note', bodyHtml: 'Describe what the agent should know about this case.' });
        if (noteEl) scheduleOsDialogFieldFocus(noteEl);
        return;
      }
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving…';
      const ok = await submitNotificationTriage(item, action, note, saveBtn);
      if (ok) finish(true);
      else {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save & resolve';
      }
    });
    actionsEl.appendChild(saveBtn);

    openOsDialogBackdrop();
    bindOsDialogDismiss(backdrop, finish, true);
    bindOsDialogKeyboardLayout();
    saveBtn.focus();
  });
}

function buildReviewAlertBanners(notifications) {
  const wrap = document.createElement('div');
  wrap.className = 'dash-review-alerts';
  for (const item of filterPendingDismissNotifications(notifications)) {
    wrap.appendChild(buildReviewAlertBanner(item));
  }
  syncOtpCountdownTimers();
  return wrap;
}

/** Drop a resolved review alert from the dashboard immediately (no poll / reload wait). */
function removeReviewAlertBanner(emailId, commentId, engagementId, alertId) {
  const emailKey = String(emailId || '').trim();
  const commentKey = String(commentId || '').trim();
  const engagementKey = String(engagementId || '').trim();
  const alertKey = String(alertId || '').trim();
  let banner = null;
  if (alertKey) {
    banner = document.querySelector(
      `.dash-review-alerts [data-review-alert-id="${CSS.escape(alertKey)}"]`,
    );
  } else if (engagementKey) {
    banner = document.querySelector(
      `.dash-review-alerts [data-review-engagement-id="${CSS.escape(engagementKey)}"]`,
    );
  } else if (commentKey) {
    banner = document.querySelector(
      `.dash-review-alerts [data-review-comment-id="${CSS.escape(commentKey)}"]`,
    );
  } else if (emailKey) {
    banner = document.querySelector(
      `.dash-review-alerts [data-review-email-id="${CSS.escape(emailKey)}"]`,
    );
  }
  if (!banner) return false;
  const wrap = banner.closest('.dash-review-alerts');
  banner.remove();
  if (wrap && wrap.children.length === 0) wrap.remove();
  return true;
}

/** Remove automation and push-alert banners tied to an inbox message. */
function removeEmailRelatedAlertBanners(emailId) {
  const key = String(emailId || '').trim();
  if (!key) return 0;
  let removed = 0;
  const seen = new Set();
  const selectors = [
    `.dash-review-alerts [data-review-email-id="${CSS.escape(key)}"]`,
    `.dash-review-alerts [data-review-alert-tag="${CSS.escape(key)}"]`,
    `.dash-review-alerts [data-review-alert-tag="${CSS.escape(`otp-${key}`)}"]`,
  ];
  for (const sel of selectors) {
    const banner = document.querySelector(sel);
    if (!banner || seen.has(banner)) continue;
    seen.add(banner);
    const wrap = banner.closest('.dash-review-alerts');
    banner.remove();
    if (wrap && wrap.children.length === 0) wrap.remove();
    removed += 1;
  }
  if (removed > 0) {
    syncReviewBadge(Math.max(0, reviewsPendingCount - removed));
  }
  return removed;
}

function maybeOpenPendingTriageDialog(notifications) {
  const emailId = String(pendingTriageEmailId || '').trim();
  if (!emailId) return;
  pendingTriageEmailId = '';
  const item = notifications.find(
    (n) => n.emailId === emailId && isEmailAutomationReview(n) && n.awaitingTriage,
  );
  if (!item) return;
  window.setTimeout(() => {
    void openNotificationTriageDialog(item);
  }, 120);
}

let pendingTriageEmailId = '';

function queueTriageEmailFromUrl() {
  try {
    const id = new URLSearchParams(window.location.search).get('triageEmail')?.trim();
    if (!id) return;
    pendingTriageEmailId = id;
    const url = new URL(window.location.href);
    url.searchParams.delete('triageEmail');
    window.history.replaceState({}, '', url.pathname + url.search + url.hash);
  } catch {
    /* ignore */
  }
}

function renderAdminDashboard(data) {
  const root = document.getElementById('dashboard-panel');
  if (!root) return;
  root.innerHTML = '';

  const scroll = document.createElement('div');
  scroll.className = 'home-dashboard-scroll';

  const stats = data?.stats || {};
  const scheduleLive = data?.schedulingConfigured === true;
  const dashTimeView = readDashTimeView();
  const automationNotifications = filterPendingDismissNotifications(
    Array.isArray(data?.automationNotifications) ? data.automationNotifications : [],
  );

  if (automationNotifications.length) {
    scroll.appendChild(buildReviewAlertBanners(automationNotifications));
  }
  maybeOpenPendingTriageDialog(automationNotifications);

  const todaySection = document.createElement('section');
  todaySection.className = 'dash-today';

  const todayHead = document.createElement('div');
  todayHead.className = 'dash-today-head';

  const todayHeadLeft = document.createElement('div');
  todayHeadLeft.className = 'dash-today-head-left';

  const viewPickerWrap = document.createElement('div');
  viewPickerWrap.className = 'dash-today-view-picker';
  const viewPicker = createSlidingPillSelect({
    value: dashTimeView,
    options: DASH_TIME_VIEWS,
    ariaLabel: 'Schedule window',
    onChange: (next) => {
      writeDashTimeView(next);
      renderDashTodayLists(todayLists, data, next);
    },
  });
  viewPickerWrap.appendChild(viewPicker.el);
  todayHeadLeft.appendChild(viewPickerWrap);
  todayHead.appendChild(todayHeadLeft);

  if (scheduleLive) {
    const scheduleBtn = document.createElement('button');
    scheduleBtn.type = 'button';
    scheduleBtn.className = 'dash-panel-btn';
    scheduleBtn.dataset.scheduleAll = '';
    scheduleBtn.textContent = 'View Schedule';
    scheduleBtn.addEventListener('click', () => {
      openScheduleTab({ view: 'day', date: scheduleTodayKey() });
    });
    todayHead.appendChild(scheduleBtn);
  }

  todaySection.appendChild(todayHead);

  const todayLists = document.createElement('div');
  todayLists.className = 'dash-today-lists';
  renderDashTodayLists(todayLists, data, dashTimeView);
  todaySection.appendChild(todayLists);
  scroll.appendChild(todaySection);

  const statsEl = document.createElement('div');
  statsEl.className = 'dash-stats';

  statsEl.appendChild(buildDashStat({
    value: stats.projectsPending ?? 0,
    label: `${postTitle(2)} pending`,
    hint: stats.projectsActive ? `${stats.projectsActive} active` : 'none active',
    onClick: () => setActiveMap('work', { force: activeKey === 'work' }),
  }));

  statsEl.appendChild(buildDashStat({
    value: stats.todosOpen ?? 0,
    label: 'Open tasks',
    hint: 'to-do lists',
    onClick: () => setActiveMap('todo', { force: activeKey === 'todo' }),
  }));

  statsEl.appendChild(buildDashStat({
    value: stats.clients ?? '—',
    label: 'Contacts',
    hint: stats.clients == null ? 'contact-api off' : 'in CRM',
    muted: stats.clients == null,
    onClick: stats.clients == null ? null : () => setActiveMap('clients', { force: activeKey === 'clients' }),
  }));

  const billingLive = data?.billingConfigured === true;
  if (billingLive) {
    const billingFailed = Boolean(data?.billingError);
    const totalDue = stats.billingTotalDue ?? 0;
    const outstanding = stats.billingOutstanding ?? 0;
    const overdue = stats.billingOverdue ?? 0;
    const recurring = stats.billingRecurring ?? 0;

    statsEl.appendChild(buildDashStat({
      value: billingFailed ? '—' : formatDashMoney(totalDue),
      label: 'Outstanding',
      hint: billingFailed
        ? 'Crater unreachable'
        : outstanding
          ? `${outstanding} invoice${outstanding === 1 ? '' : 's'}${recurring ? ` · ${recurring} recurring` : ''}`
          : recurring
            ? `${recurring} recurring · all clear`
            : 'all clear',
      tone: billingFailed ? 'failed' : totalDue > 0 ? (overdue > 0 ? 'failed' : 'stale') : 'live',
      muted: billingFailed,
      external: !billingFailed,
      onClick: billingFailed ? null : openFinanceCrater,
    }));

    statsEl.appendChild(buildDashStat({
      value: billingFailed ? '—' : overdue,
      label: 'Overdue',
      hint: billingFailed ? 'check CRATER_API_*' : overdue ? 'past due in Crater' : 'none overdue',
      tone: billingFailed ? 'failed' : overdue > 0 ? 'failed' : 'live',
      muted: billingFailed,
      external: !billingFailed,
      onClick: billingFailed ? null : openFinanceCrater,
    }));
  }

  statsEl.appendChild(buildDashStat({
    value: stats.chats ?? 0,
    label: 'Sessions',
    hint: 'agent threads',
    onClick: () => setActiveMap('chats', { force: activeKey === 'chats' }),
  }));

  const deployTone = deployStatTone(stats.deployState);
  statsEl.appendChild(buildDashStat({
    value: deployStatLabel(stats.deployState),
    label: 'Deploy',
    hint: data?.deploy?.deployedShort
      ? `@ ${data.deploy.deployedShort}`
      : stats.deployUpToDate === false
        ? 'behind GitHub'
        : 'status',
    tone: deployTone,
    onClick: () => setActiveMap('system', { force: activeKey === 'system' }),
  }));

  const uptimeSummary = data?.uptime?.summary;
  const uptimeConfigured = data?.uptime?.configured === true;
  if (uptimeConfigured || uptimeSummary) {
    const downCount = uptimeSummary?.down ?? stats.uptimeDown ?? 0;
    statsEl.appendChild(buildDashStat({
      value: downCount,
      label: 'Sites down',
      hint: uptimeSummary
        ? `${uptimeSummary.up}/${uptimeSummary.total} up locally · ${uptimeSummary.open_incidents ?? 0} open incidents`
        : uptimeConfigured
          ? 'sync pending'
          : 'not configured',
      tone: downCount > 0 ? 'failed' : uptimeSummary?.total ? 'live' : 'muted',
      muted: !uptimeConfigured,
    }));
  }

  scroll.appendChild(statsEl);

  if (uptimeConfigured) {
    const list = document.createElement('ul');
    list.className = 'dash-uptime-grid';
    const monitors = Array.isArray(data?.uptimeMonitors) ? data.uptimeMonitors : [];
    for (const m of monitors) {
      const li = document.createElement('li');
      const { offline, label } = uptimeMonitorTileMeta(m);
      li.className = `dash-uptime-tile${offline ? ' dash-uptime-tile--down' : ''}`;
      li.innerHTML =
        `<span class="dash-uptime-dot" aria-hidden="true"></span>` +
        `<div class="dash-uptime-name">${escHtml(m.friendly_name || m.url || `Monitor ${m.id}`)}</div>` +
        `<div class="dash-uptime-meta">${escHtml(label)}</div>`;
      list.appendChild(li);
    }

    scroll.appendChild(list);
  }

  const inboxRecent = Array.isArray(data?.recentEmails) ? data.recentEmails : [];
  const inboxPanel = document.createElement('section');
  inboxPanel.className =
    'dash-panel dash-panel-inbox' + (inboxRecent.length ? '' : ' dash-panel-inbox--empty');
  inboxPanel.innerHTML = `<div class="dash-panel-head"><h2 class="dash-panel-title">Recent inbox</h2></div>`;
  const inboxBody = document.createElement('div');
  inboxBody.className = 'dash-panel-body';
  if (!inboxRecent.length) {
    const empty = document.createElement('p');
    empty.className = 'dash-empty';
    empty.textContent = 'No emails yet.';
    inboxBody.appendChild(empty);
  } else {
    const list = document.createElement('ul');
    list.className = 'dash-inbox-list';
    for (const mail of inboxRecent) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'dash-inbox-item';
      btn.innerHTML =
        `<span class="dash-inbox-subject">${escHtml(mail.subject)}</span>` +
        `<span class="dash-inbox-meta">${escHtml(mail.from || 'Unknown')} · ${escHtml(formatEmailWhen(mail.receivedAt))}</span>`;
      btn.addEventListener('click', () => setActiveMap('email', { force: true }));
      const li = document.createElement('li');
      li.appendChild(btn);
      list.appendChild(li);
    }
    inboxBody.appendChild(list);
  }
  inboxPanel.appendChild(inboxBody);
  scroll.appendChild(inboxPanel);

  const grid = document.createElement('div');
  grid.className = 'home-dashboard-grid';
  for (const card of dashboardGridCards()) {
    const key = card.mapKey;
    const m = MAPS[key];
    if (!m) continue;
    const href = m.link;
    const label = card.title || m.title;
    const icon = card.icon || mapIconName(key);
    if (href) {
      grid.appendChild(buildHomeLinkTile({ href, label, icon }));
    } else {
      grid.appendChild(buildHomeMapTile(key, { title: label }, icon));
    }
  }
  scroll.appendChild(grid);

  root.appendChild(scroll);
}

function showAddUptimeSiteDialog() {
  const backdrop = document.getElementById('os-dialog-backdrop');
  const titleEl = document.getElementById('os-dialog-title');
  const bodyEl = document.getElementById('os-dialog-body');
  const actionsEl = document.getElementById('os-dialog-actions');
  if (!backdrop || !titleEl || !bodyEl || !actionsEl) return Promise.resolve(false);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      releaseOsDialogKeyboardLayout();
      closeOsDialogBackdrop();
      document.removeEventListener('keydown', onKey);
      resolve(value);
    };
    const onKey = (ev) => {
      if (ev.key === 'Escape') finish(false);
    };

    titleEl.textContent = 'Add site to UptimeRobot';
    bodyEl.innerHTML =
      '<p class="em-book-dialog-lead">Create an HTTP monitor via the UptimeRobot API. ' +
      'If your plan blocks API creates, add the monitor in the ' +
      '<a href="https://uptimerobot.com/dashboard" target="_blank" rel="noopener noreferrer">UptimeRobot dashboard</a> ' +
      'and use <strong>Link monitor</strong> or <strong>Sync status</strong> instead.</p>' +
      '<label class="de-label sched-create-field">' +
        '<span>URL</span>' +
        '<div class="control-field">' +
          '<input id="uptime-add-url" type="url" inputmode="url" autocapitalize="none" autocomplete="url" placeholder="https://example.com" required>' +
        '</div>' +
      '</label>' +
      '<label class="de-label sched-create-field">' +
        '<span>Display name (optional)</span>' +
        '<div class="control-field">' +
          '<input id="uptime-add-name" type="text" autocapitalize="words" placeholder="example.com">' +
        '</div>' +
      '</label>';
    actionsEl.innerHTML = '';

    const urlInput = bodyEl.querySelector('#uptime-add-url');
    const nameInput = bodyEl.querySelector('#uptime-add-name');

    const mkBtn = (label, cls, onClick) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `os-dialog-btn ${cls}`.trim();
      btn.textContent = label;
      btn.addEventListener('click', onClick);
      actionsEl.appendChild(btn);
      return btn;
    };

    mkBtn('Cancel', 'os-dialog-btn--ghost', () => finish(false));
    const addBtn = mkBtn('Add site', 'os-dialog-btn--primary', async () => {
      const url = normalizeUptimeUrlClient(urlInput?.value);
      if (!url) {
        urlInput?.focus();
        return;
      }
      addBtn.disabled = true;
      addBtn.textContent = 'Adding…';
      try {
        const res = await adminFetch('/api/uptime/monitors', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url,
            friendlyName: nameInput?.value.trim() || undefined,
          }),
        });
        const data = await readApiJson(res);
        if (!data.ok) throw new Error(data.error || 'Could not add site');
        finish(true);
        await loadAdminDashboard();
      } catch (e) {
        addBtn.disabled = false;
        addBtn.textContent = 'Add site';
        await osAlert({
          title: 'Could not add site',
          bodyHtml: uptimeAddSiteErrorHtml(url, e.message || String(e)),
        });
      }
    });

    openOsDialogBackdrop();
    bindOsDialogDismiss(backdrop, () => finish(false), true);
    document.addEventListener('keydown', onKey);
    bindOsDialogKeyboardLayout();
    urlInput?.focus();
  });
}

function showLinkUptimeMonitorDialog() {
  const backdrop = document.getElementById('os-dialog-backdrop');
  const titleEl = document.getElementById('os-dialog-title');
  const bodyEl = document.getElementById('os-dialog-body');
  const actionsEl = document.getElementById('os-dialog-actions');
  if (!backdrop || !titleEl || !bodyEl || !actionsEl) return Promise.resolve(false);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      releaseOsDialogKeyboardLayout();
      closeOsDialogBackdrop();
      document.removeEventListener('keydown', onKey);
      resolve(value);
    };
    const onKey = (ev) => {
      if (ev.key === 'Escape') finish(false);
    };

    titleEl.textContent = 'Link UptimeRobot monitor';
    bodyEl.innerHTML =
      '<p class="em-book-dialog-lead">After creating a monitor in the ' +
      '<a href="https://uptimerobot.com/dashboard" target="_blank" rel="noopener noreferrer">UptimeRobot dashboard</a>, ' +
      'enter its numeric ID here to import it into ' +
      escHtml(companyBrand().name) +
      '. You can also use <strong>Sync status</strong> to pull all monitors at once.</p>' +
      '<label class="de-label sched-create-field">' +
        '<span>Monitor ID</span>' +
        '<div class="control-field">' +
          '<input id="uptime-link-id" type="number" inputmode="numeric" min="1" step="1" placeholder="798092635" required>' +
        '</div>' +
      '</label>' +
      '<p class="dash-muted-inline">Find the ID in the dashboard URL when editing a monitor, or in the monitor list.</p>';
    actionsEl.innerHTML = '';

    const idInput = bodyEl.querySelector('#uptime-link-id');

    const mkBtn = (label, cls, onClick) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `os-dialog-btn ${cls}`.trim();
      btn.textContent = label;
      btn.addEventListener('click', onClick);
      actionsEl.appendChild(btn);
      return btn;
    };

    mkBtn('Cancel', 'os-dialog-btn--ghost', () => finish(false));
    const linkBtn = mkBtn('Link monitor', 'os-dialog-btn--primary', async () => {
      const monitorId = Number(idInput?.value.trim());
      if (!Number.isFinite(monitorId) || monitorId <= 0) {
        idInput?.focus();
        return;
      }
      linkBtn.disabled = true;
      linkBtn.textContent = 'Linking…';
      try {
        const res = await adminFetch('/api/uptime/monitors/link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ monitorId }),
        });
        const data = await readApiJson(res);
        if (!data.ok) throw new Error(data.error || 'Could not link monitor');
        finish(true);
        await loadAdminDashboard();
      } catch (e) {
        linkBtn.disabled = false;
        linkBtn.textContent = 'Link monitor';
        await osAlert({ title: 'Could not link monitor', bodyHtml: escHtml(e.message || String(e)) });
      }
    });

    openOsDialogBackdrop();
    bindOsDialogDismiss(backdrop, () => finish(false), true);
    document.addEventListener('keydown', onKey);
    bindOsDialogKeyboardLayout();
    idInput?.focus();
  });
}

async function syncUptimeSitesFromPlatforms() {
  if (uptimePlatformSyncActive) {
    setUptimeSyncButtonBusy(true, { running: true, phase: 'creating' });
    ensureUptimePlatformSyncPolling();
    return;
  }

  uptimePlatformSyncActive = true;
  setUptimeSyncButtonBusy(true, { running: true, phase: 'starting' });

  try {
    const res = await fetch('/api/uptime/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const data = await res.json().catch(() => null);
    if (!data) throw new Error(`HTTP ${res.status}`);

    if (data.alreadyRunning) {
      ensureUptimePlatformSyncPolling();
      return;
    }

    if (!data.ok || !data.started) {
      throw new Error(data.error || `HTTP ${res.status}`);
    }

    ensureUptimePlatformSyncPolling();
  } catch (e) {
    uptimePlatformSyncActive = false;
    stopUptimePlatformSyncPolling();
    setUptimeSyncButtonBusy(false);
    await osAlert({ title: 'Sync failed', bodyHtml: escHtml(e.message || String(e)) });
  }
}

async function syncUptimeMonitorsFromApi() {
  const backdrop = document.getElementById('os-dialog-backdrop');
  const titleEl = document.getElementById('os-dialog-title');
  const bodyEl = document.getElementById('os-dialog-body');
  const actionsEl = document.getElementById('os-dialog-actions');
  if (!backdrop || !titleEl || !bodyEl || !actionsEl) return;

  titleEl.textContent = 'Sync monitor status';
  bodyEl.innerHTML = '<p class="em-book-dialog-lead">Syncing monitor status from UptimeRobot API…</p>';
  actionsEl.innerHTML = '';
  openOsDialogBackdrop();

  try {
    const res = await fetch('/api/admin/uptimerobot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const data = await res.json().catch(() => null);
    if (!data) throw new Error(`HTTP ${res.status}`);
    if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);

    bodyEl.innerHTML = `<p>Synced <strong>${data.synced}</strong> monitor${data.synced === 1 ? '' : 's'} from UptimeRobot.</p>`;

    actionsEl.innerHTML = '';
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'os-dialog-btn os-dialog-btn--primary';
    closeBtn.textContent = 'Done';
    closeBtn.addEventListener('click', async () => {
      closeOsDialogBackdrop();
      if (data.synced > 0) await loadAdminDashboard();
    });
    actionsEl.appendChild(closeBtn);
    closeBtn.focus();
  } catch (e) {
    closeOsDialogBackdrop();
    await osAlert({ title: 'Sync failed', bodyHtml: escHtml(e.message || String(e)) });
  }
}

let homeDashboardLoadPromise = null;
let homeDashboardLastLoadAt = 0;
const DASHBOARD_MIN_RELOAD_MS = 1500;

async function loadAdminDashboard(opts = {}) {
  if (!userId) return;
  const quiet = opts.quiet === true;
  const root = document.getElementById('dashboard-panel');
  if (!root) return;
  if (homeDashboardLoadPromise) return homeDashboardLoadPromise;

  const hasContent = dashboardPanelHasContent();
  if (!quiet && hasContent) {
    const elapsed = Date.now() - homeDashboardLastLoadAt;
    if (elapsed < DASHBOARD_MIN_RELOAD_MS) return;
  }

  homeDashboardLoadPromise = (async () => {
    if (!hasContent) {
      mountPanelSkeleton(root, 'dashboard-home', 'Loading dashboard…', {
        quiet: false,
        contentSelector: '.home-dashboard-scroll .dash-today, .home-dashboard-scroll .home-dashboard-grid',
      });
    } else if (!quiet) {
      mountPanelSkeleton(root, 'dashboard-home', 'Loading dashboard…', {
        quiet: true,
        contentSelector: '.home-dashboard-scroll .dash-today, .home-dashboard-scroll .home-dashboard-grid',
      });
    }

    try {
      const res = await adminFetch('/api/admin/dashboard');
      const data = await readAdminJson(res, 'dashboard');
      if (!data.ok) throw new Error(data.error || `HTTP ${res.status}`);
      syncDashboardFooterBadges(data.stats);
      renderAdminDashboard(data);
      homeDashboardLastLoadAt = Date.now();
      void initFleetLocationReporter();
    } catch (e) {
      if (e.message === 'Session expired') return;
      root.innerHTML =
        `<div class="home-dashboard-scroll">` +
          `<p class="dash-empty">Could not load dashboard: ${escHtml(e.message)}</p>` +
        `</div>`;
    }
  })();

  try {
    await homeDashboardLoadPromise;
  } finally {
    homeDashboardLoadPromise = null;
  }
}

/** Update dashboard review banners without wiping the view (badge poll / push). */
async function refreshDashboardReviewBannersQuiet() {
  if (MAP?.type !== 'dashboard') return;
  const root = document.getElementById('dashboard-panel');
  const scroll = root?.querySelector('.home-dashboard-scroll');
  if (!scroll || scroll.querySelector('.dash-loading, .panel-skeleton')) return;

  try {
    const res = await adminFetch('/api/admin/dashboard');
    const data = await readAdminJson(res, 'dashboard');
    if (!data.ok) return;
    syncDashboardFooterBadges(data.stats);

    scroll.querySelector('.dash-review-alerts')?.remove();
    const notifications = filterPendingDismissNotifications(
      Array.isArray(data.automationNotifications) ? data.automationNotifications : [],
    );
    if (notifications.length) {
      scroll.insertBefore(buildReviewAlertBanners(notifications), scroll.firstChild);
    }
    maybeOpenPendingTriageDialog(notifications);
  } catch {}
}


const PROFILE_TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Anchorage',
  'Pacific/Honolulu',
  'America/Toronto',
  'America/Vancouver',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Asia/Kolkata',
  'Australia/Sydney',
  'Pacific/Auckland',
  'UTC',
];

function profileTimezoneOptions(selected) {
  const list = [...PROFILE_TIMEZONES];
  if (selected && !list.includes(selected)) list.unshift(selected);
  return list.map((tz) => {
    const label = tz.replace(/_/g, ' ');
    const sel = tz === selected ? ' selected' : '';
    return `<option value="${escHtml(tz)}"${sel}>${escHtml(label)}</option>`;
  }).join('');
}

export const AUTOSAVE_DEBOUNCE_MS = 650;
const FORM_FIELD_SAVING = 'form-field--saving';
export const FORM_FIELD_SAVED = 'form-field--saved';
export const FORM_FIELD_INVALID = 'form-field--invalid';

let settingsAutosaveFlush = null;

function setFormFieldState(el, state) {
  if (!el) return;
  el.classList.remove(FORM_FIELD_SAVING, FORM_FIELD_SAVED, FORM_FIELD_INVALID);
  el.removeAttribute('aria-invalid');
  if (!state) return;
  el.classList.add(`form-field--${state}`);
  if (state === 'invalid') el.setAttribute('aria-invalid', 'true');
}

function flashFormFieldSaved(el) {
  if (!el) return;
  setFormFieldState(el, 'saved');
  const prev = el.dataset.savedTimerId;
  if (prev) clearTimeout(Number(prev));
  const id = window.setTimeout(() => {
    if (document.activeElement !== el) setFormFieldState(el, null);
    delete el.dataset.savedTimerId;
  }, 2000);
  el.dataset.savedTimerId = String(id);
}

function isValidEmailField(value) {
  const v = (value || '').trim();
  if (!v) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function isValidPhoneField(value) {
  return isValidPhone(value);
}

function isValidUrlField(value) {
  const v = (value || '').trim();
  if (!v) return true;
  try {
    const u = new URL(v);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function defaultFieldValidator(el) {
  if (el.disabled) return true;
  const type = (el.getAttribute('type') || '').toLowerCase();
  const name = (el.getAttribute('name') || '').toLowerCase();
  if (type === 'email' || name.includes('email')) return isValidEmailField(el.value);
  if (type === 'tel' || name.includes('phone')) return isValidPhoneField(el.value);
  if (type === 'url') return isValidUrlField(el.value);
  if (el.required && !String(el.value || '').trim()) return false;
  return true;
}

function getFormEditableFields(form) {
  return [...form.querySelectorAll(
    'input:not([disabled]):not([type=file]):not([type=hidden]):not([type=color]), select, textarea',
  )];
}

function serializeFormData(form) {
  return JSON.stringify(Object.fromEntries(new FormData(form)));
}

function bindAutosaveForm(scope, opts) {
  const form = scope.querySelector(opts.formSelector);
  if (!(form instanceof HTMLFormElement)) return { flush: async () => {} };

  let baseline = serializeFormData(form);
  let activeEl = null;
  let debounceTimer = null;
  let saving = false;
  let pendingFlush = false;

  const validateField = opts.validateField || defaultFieldValidator;

  const canSave = () => {
    let ok = true;
    for (const el of getFormEditableFields(form)) {
      const valid = validateField(el, form);
      if (!valid) {
        ok = false;
        if (el === activeEl) setFormFieldState(el, 'invalid');
      }
    }
    return ok;
  };

  const flush = async () => {
    clearTimeout(debounceTimer);
    debounceTimer = null;

    if (saving) {
      pendingFlush = true;
      return;
    }

    const current = serializeFormData(form);
    if (current === baseline) return;
    if (!canSave()) return;

    saving = true;
    if (activeEl) setFormFieldState(activeEl, 'saving');

    try {
      const payload = Object.fromEntries(new FormData(form));
      const result = await opts.save(payload);
      if (result.ok) {
        baseline = serializeFormData(form);
        if (activeEl) flashFormFieldSaved(activeEl);
        else if (opts.alertEl) showProfileAlert(opts.alertEl, 'Saved.', 'success');
      } else {
        if (activeEl) setFormFieldState(activeEl, 'invalid');
        if (opts.alertEl && result.error) showProfileAlert(opts.alertEl, result.error, 'error');
      }
    } catch {
      if (activeEl) setFormFieldState(activeEl, 'invalid');
      if (opts.alertEl) showProfileAlert(opts.alertEl, 'Network error — please try again.', 'error');
    } finally {
      saving = false;
      if (
        activeEl &&
        !activeEl.classList.contains(FORM_FIELD_SAVED) &&
        !activeEl.classList.contains(FORM_FIELD_INVALID)
      ) {
        setFormFieldState(activeEl, null);
      }
      if (pendingFlush) {
        pendingFlush = false;
        await flush();
      }
    }
  };

  const schedule = (el) => {
    activeEl = el;
    if (!el.classList.contains(FORM_FIELD_INVALID) && !el.classList.contains(FORM_FIELD_SAVED)) {
      setFormFieldState(el, null);
    }
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(flush, opts.debounceMs ?? AUTOSAVE_DEBOUNCE_MS);
  };

  for (const el of getFormEditableFields(form)) {
    const handler = () => schedule(el);
    el.addEventListener('input', handler);
    el.addEventListener('change', handler);
    el.addEventListener('blur', () => {
      activeEl = el;
      const valid = validateField(el, form);
      if (!valid) setFormFieldState(el, 'invalid');
      clearTimeout(debounceTimer);
      void flush();
    });
    el.addEventListener('focus', () => {
      if (!el.classList.contains(FORM_FIELD_INVALID)) setFormFieldState(el, null);
    });
  }

  form.addEventListener('submit', (e) => e.preventDefault());

  const resync = () => {
    baseline = serializeFormData(form);
  };

  settingsAutosaveFlush = flush;
  return { flush, resync };
}

async function flushSettingsAutosave() {
  if (typeof settingsAutosaveFlush === 'function') {
    await settingsAutosaveFlush();
    settingsAutosaveFlush = null;
  }
  destroyCompanyMap();
}

function showProfileAlert(el, msg, type) {
  if (!el) return;
  el.textContent = msg;
  el.className = `prof-alert prof-alert--${type}`;
  el.hidden = false;
  el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  clearTimeout(el.dataset.timerId ? Number(el.dataset.timerId) : 0);
  const timerId = window.setTimeout(() => {
    el.hidden = true;
  }, 4000);
  el.dataset.timerId = String(timerId);
}

function svgPreviewDataUri(svg) {
  const trimmed = String(svg || '').trim();
  if (!trimmed || !/<svg[\s>]/i.test(trimmed)) return '';
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(trimmed)}`;
}

function companyLogoPreviewUrl(company) {
  const svgUrl = svgPreviewDataUri(company?.logoSvg);
  if (svgUrl) return svgUrl;
  if (hasUploadedCompanyLogoPng(company)) {
    const v = company.logoVersion ? `?v=${encodeURIComponent(company.logoVersion)}` : '';
    return `/branding/logo.png${v}`;
  }
  if (company?.logoSource === 'admin' && company.logoPath && company.logoSource !== 'hidden') {
    const path = String(company.logoPath);
    const v = company.logoVersion ? `?v=${encodeURIComponent(company.logoVersion)}` : '';
    if (/^https?:\/\//i.test(path)) return path + (company.logoVersion ? v : '');
    return `${path.startsWith('/') ? path : `/${path}`}${v}`;
  }
  return '';
}

function companyBrandingIconPreviewUrl(company, size = 512) {
  const version = company?.iconVersion || company?.logoVersion;
  const params = new URLSearchParams({ size: String(size) });
  if (version) params.set('v', version);
  return `/api/branding/icon?${params.toString()}`;
}

function companyIconPreviewUrl(company) {
  const svgUrl = svgPreviewDataUri(company?.iconSvg);
  if (svgUrl) return svgUrl;
  if (hasCustomCompanyIcon(company)) {
    return companyBrandingIconPreviewUrl(company, 512);
  }
  return '';
}

function hasUploadedCompanyLogoPng(company) {
  if (company?.logoHasRaster === true) return true;
  if (company?.logoHasRaster === false) return false;
  const path = String(company?.logoPath || '');
  return (
    company?.logoSource === 'admin' &&
    (path.includes('/branding/logo.png') || path.includes('/api/branding/logo'))
  );
}

function hasUploadedCompanyIconPng(company) {
  if (company?.iconHasRaster === true) return true;
  if (company?.iconHasRaster === false) return false;
  return (
    company?.iconSource === 'admin' &&
    String(company?.iconPath || '').includes('/api/branding/icon') &&
    !String(company?.iconSvg || '').trim()
  );
}

function hasLegacyCompanyIconPath(company) {
  return (
    company?.iconSource === 'admin' &&
    !!company?.iconPath &&
    !String(company.iconPath).includes('/api/branding/icon')
  );
}

function hasCompanySvg(company, key) {
  return Boolean(String(company?.[key] || '').trim());
}

function hasRemovableCompanyIcon(company) {
  return hasCustomCompanyIcon(company);
}

function companyStaffAvatarPreviewUrl(company) {
  const version = company?.iconVersion || company?.logoVersion;
  const params = new URLSearchParams({ size: '192', transparent: '1' });
  if (version) params.set('v', version);
  return `/api/branding/icon?${params.toString()}`;
}

function syncHeaderProfileIcon(url) {
  if (!url) return;
  document.querySelectorAll('.topbar-profile-icon-img').forEach((img) => {
    if (img instanceof HTMLImageElement) img.src = url;
  });
}

function hasCustomCompanyLogo(company) {
  return (
    hasCompanySvg(company, 'logoSvg') ||
    hasUploadedCompanyLogoPng(company) ||
    (company?.logoSource === 'admin' && !!companyLogoPreviewUrl(company))
  );
}

function hasCustomCompanyIcon(company) {
  return (
    hasCompanySvg(company, 'iconSvg') ||
    hasUploadedCompanyIconPng(company) ||
    hasLegacyCompanyIconPath(company)
  );
}

function hasUploadedCompanyOg(company) {
  return company?.ogHasRaster === true;
}

function companyOgPreviewUrl(company) {
  const version = company?.logoVersion || company?.iconVersion || '';
  const bust = `_=${Date.now()}`;
  return version
    ? `/api/branding/og.png?v=${encodeURIComponent(version)}&${bust}`
    : `/api/branding/og.png?${bust}`;
}

function syncSvgFieldPreview(root, fieldId, svg) {
  const wrap = root.querySelector(`#${fieldId}-preview-wrap`);
  const img = root.querySelector(`#${fieldId}-preview`);
  const url = svgPreviewDataUri(svg);
  if (img instanceof HTMLImageElement) {
    if (url) img.src = url;
    else img.removeAttribute('src');
  }
  if (wrap instanceof HTMLElement) wrap.hidden = !url;
}

function syncCompanySvgFields(root, company) {
  const logoTa = root.querySelector('#company-logoSvg');
  const iconTa = root.querySelector('#company-iconSvg');
  if (logoTa instanceof HTMLTextAreaElement) logoTa.value = company?.logoSvg || '';
  if (iconTa instanceof HTMLTextAreaElement) iconTa.value = company?.iconSvg || '';
  syncSvgFieldPreview(root, 'company-logoSvg', company?.logoSvg);
  syncSvgFieldPreview(root, 'company-iconSvg', company?.iconSvg);
}

function usesLogoAsIconFallback(company) {
  return company?.iconSource === 'logo' && hasCustomCompanyLogo(company) && !hasCustomCompanyIcon(company);
}

function bindCompanyLogoUpload(root, companyAlert, opts = {}) {
  const fileInput = root.querySelector('#company-logo-file');
  const uploadBtn = root.querySelector('#company-logo-upload-btn');
  const fileWrap = root.querySelector('#company-logo-file-wrap');
  const previewWrap = root.querySelector('#company-logo-preview-wrap');
  const preview = root.querySelector('#company-logo-preview');
  const removeBtn = root.querySelector('#company-logo-remove');
  const onCompany = typeof opts.onCompany === 'function' ? opts.onCompany : null;
  let lastCompany = opts.company || null;

  const refreshPreview = (company) => {
    lastCompany = company;
    const hasLogo = hasCustomCompanyLogo(company);
    const hasPng = hasUploadedCompanyLogoPng(company);
    const url = hasLogo ? companyLogoPreviewUrl(company) : '';

    if (preview instanceof HTMLImageElement) {
      preview.src = url;
    }
    if (previewWrap instanceof HTMLElement) {
      previewWrap.hidden = !hasLogo;
    }
    if (fileWrap instanceof HTMLElement) {
      fileWrap.hidden = hasPng;
    }
    if (removeBtn instanceof HTMLButtonElement) {
      removeBtn.hidden = !hasLogo;
    }
    if (preview instanceof HTMLImageElement && !url) {
      preview.removeAttribute('src');
    }
    syncCompanySvgFields(root, company);
  };

  uploadBtn?.addEventListener('click', () => {
    if (fileInput instanceof HTMLInputElement && !fileInput.disabled) fileInput.click();
  });

  fileInput?.addEventListener('change', async () => {
    if (!(fileInput instanceof HTMLInputElement) || !fileInput.files?.length) return;
    const file = fileInput.files[0];
    const fd = new FormData();
    fd.append('logo', file);
    if (removeBtn instanceof HTMLButtonElement) removeBtn.disabled = true;
    fileInput.disabled = true;
    if (uploadBtn instanceof HTMLButtonElement) {
      uploadBtn.disabled = true;
      uploadBtn.textContent = 'Uploading…';
    }
    if (preview instanceof HTMLImageElement) {
      preview.src = URL.createObjectURL(file);
    }
    if (previewWrap instanceof HTMLElement) previewWrap.hidden = false;
    try {
      const res = await adminFetch('/api/admin/company/logo', { method: 'POST', body: fd });
      const json = await readAdminJson(res, 'logo upload');
      if (res.ok && json.company) {
        refreshPreview(json.company);
        onCompany?.(json.company);
        showProfileAlert(companyAlert, 'Logo updated.', 'success');
      } else {
        refreshPreview(lastCompany);
        showProfileAlert(companyAlert, json.error || 'Logo upload failed.', 'error');
      }
    } catch (e) {
      refreshPreview(lastCompany);
      showProfileAlert(companyAlert, e.message || 'Network error — please try again.', 'error');
    } finally {
      fileInput.value = '';
      fileInput.disabled = false;
      if (uploadBtn instanceof HTMLButtonElement) {
        uploadBtn.disabled = false;
        uploadBtn.textContent = 'Upload';
      }
      if (removeBtn instanceof HTMLButtonElement) removeBtn.disabled = false;
    }
  });

  removeBtn?.addEventListener('click', async () => {
    if (!(removeBtn instanceof HTMLButtonElement)) return;
    removeBtn.disabled = true;
    try {
      const res = await fetch('/api/admin/company/logo', { method: 'DELETE' });
      const json = await res.json();
      if (res.ok && json.company) {
        refreshPreview(json.company);
        onCompany?.(json.company);
        showProfileAlert(companyAlert, 'Logo removed.', 'success');
      } else {
        showProfileAlert(companyAlert, json.error || 'Could not remove logo.', 'error');
      }
    } catch {
      showProfileAlert(companyAlert, 'Network error — please try again.', 'error');
    } finally {
      removeBtn.disabled = false;
    }
  });

  root.querySelector('#company-logo-library')?.addEventListener('click', () => {
    void openMediaPicker({
      title: 'Choose logo',
      hint: 'Choose a PNG, JPEG, or WebP (max 2 MB), or an SVG (max 200 KB).',
      emptyHint:
        'No logos in the library yet. Close and upload a file here, or add one from the Media tab.',
      emptyFilteredHint:
        'Library files are present, but none are PNG, JPEG, WebP, or SVG in the size limit.',
      filter: brandingMediaFilter,
      onPick: async (item) => {
        const json = await applyMediaToTarget(item.id, 'company-logo');
        if (json.company) {
          refreshPreview(json.company);
          onCompany?.(json.company);
        }
        showProfileAlert(companyAlert, 'Logo updated from library.', 'success');
      },
    });
  });

  if (opts.company) refreshPreview(opts.company);

  return { refreshPreview };
}

function bindCompanyIconUpload(root, companyAlert, initialCompany, opts = {}) {
  const fileInput = root.querySelector('#company-icon-file');
  const uploadBtn = root.querySelector('#company-icon-upload-btn');
  const fileWrap = root.querySelector('#company-icon-file-wrap');
  const previewWrap = root.querySelector('#company-icon-preview-wrap');
  const preview = root.querySelector('#company-icon-preview');
  const removeBtn = root.querySelector('#company-icon-remove');
  const fallbackHint = root.querySelector('#company-icon-fallback-hint');
  const onCompany = typeof opts.onCompany === 'function' ? opts.onCompany : null;

  const refreshPreview = (company) => {
    const hasIcon = hasCustomCompanyIcon(company);
    const hasPng = hasUploadedCompanyIconPng(company);
    const hasRemovableIcon = hasRemovableCompanyIcon(company);
    const url = hasIcon ? companyIconPreviewUrl(company) : '';
    const avatarUrl = companyStaffAvatarPreviewUrl(company);

    if (preview instanceof HTMLImageElement) {
      preview.src = url;
    }
    if (previewWrap instanceof HTMLElement) {
      previewWrap.hidden = !hasIcon;
    }
    if (fileWrap instanceof HTMLElement) {
      fileWrap.hidden = hasPng;
    }
    if (removeBtn instanceof HTMLButtonElement) {
      removeBtn.hidden = !hasRemovableIcon;
    }
    if (preview instanceof HTMLImageElement && !url) {
      preview.removeAttribute('src');
    }
    if (fallbackHint instanceof HTMLElement) {
      fallbackHint.hidden = !usesLogoAsIconFallback(company);
    }
    syncCompanySvgFields(root, company);
    window.__companyStaffAvatarUrl = avatarUrl;
    syncHeaderProfileIcon(`${avatarUrl}${avatarUrl.includes('?') ? '&' : '?'}_=${Date.now()}`);
  };

  uploadBtn?.addEventListener('click', () => {
    if (fileInput instanceof HTMLInputElement && !fileInput.disabled) fileInput.click();
  });

  fileInput?.addEventListener('change', async () => {
    if (!(fileInput instanceof HTMLInputElement) || !fileInput.files?.length) return;
    const file = fileInput.files[0];
    const fd = new FormData();
    fd.append('icon', file);
    if (removeBtn instanceof HTMLButtonElement) removeBtn.disabled = true;
    fileInput.disabled = true;
    try {
      const res = await adminFetch('/api/admin/company/icon', { method: 'POST', body: fd });
      const json = await readAdminJson(res, 'icon upload');
      if (res.ok && json.company) {
        refreshPreview(json.company);
        onCompany?.(json.company);
        showProfileAlert(companyAlert, 'Icon updated.', 'success');
      } else {
        showProfileAlert(companyAlert, json.error || 'Icon upload failed.', 'error');
      }
    } catch (e) {
      showProfileAlert(companyAlert, e.message || 'Network error — please try again.', 'error');
    } finally {
      fileInput.value = '';
      fileInput.disabled = false;
      if (removeBtn instanceof HTMLButtonElement) removeBtn.disabled = false;
    }
  });

  removeBtn?.addEventListener('click', async () => {
    if (!(removeBtn instanceof HTMLButtonElement)) return;
    removeBtn.disabled = true;
    try {
      const res = await adminFetch('/api/admin/company/icon', { method: 'DELETE' });
      const json = await readAdminJson(res, 'icon delete');
      if (res.ok && json.company) {
        refreshPreview(json.company);
        onCompany?.(json.company);
        showProfileAlert(companyAlert, 'Icon removed.', 'success');
      } else {
        showProfileAlert(companyAlert, json.error || 'Could not remove icon.', 'error');
      }
    } catch (e) {
      showProfileAlert(companyAlert, e.message || 'Network error — please try again.', 'error');
    } finally {
      removeBtn.disabled = false;
    }
  });

  if (initialCompany) refreshPreview(initialCompany);

  root.querySelector('#company-icon-library')?.addEventListener('click', () => {
    void openMediaPicker({
      title: 'Choose icon',
      hint: 'Choose a PNG, JPEG, or WebP (max 2 MB), or an SVG (max 200 KB).',
      emptyHint:
        'No icons in the library yet. Close and upload a file here, or add one from the Media tab.',
      emptyFilteredHint:
        'Library files are present, but none are PNG, JPEG, WebP, or SVG in the size limit.',
      filter: brandingMediaFilter,
      onPick: async (item) => {
        const json = await applyMediaToTarget(item.id, 'company-icon');
        if (json.company) {
          refreshPreview(json.company);
          onCompany?.(json.company);
        }
        showProfileAlert(companyAlert, 'Icon updated from library.', 'success');
      },
    });
  });

  return { refreshPreview };
}

function bindCompanyOgUpload(root, companyAlert, initialCompany, opts = {}) {
  const fileInput = root.querySelector('#company-og-file');
  const uploadBtn = root.querySelector('#company-og-upload-btn');
  const fileWrap = root.querySelector('#company-og-file-wrap');
  const previewWrap = root.querySelector('#company-og-preview-wrap');
  const preview = root.querySelector('#company-og-preview');
  const removeBtn = root.querySelector('#company-og-remove');
  const onCompany = typeof opts.onCompany === 'function' ? opts.onCompany : null;
  let lastCompany = initialCompany || null;

  const refreshPreview = (company) => {
    lastCompany = company;
    const hasCustom = hasUploadedCompanyOg(company);
    const url = companyOgPreviewUrl(company);

    if (preview instanceof HTMLImageElement) {
      preview.src = url;
    }
    if (previewWrap instanceof HTMLElement) {
      previewWrap.hidden = false;
    }
    if (fileWrap instanceof HTMLElement) {
      fileWrap.hidden = hasCustom;
    }
    if (removeBtn instanceof HTMLButtonElement) {
      removeBtn.hidden = !hasCustom;
    }
  };

  uploadBtn?.addEventListener('click', () => {
    if (fileInput instanceof HTMLInputElement && !fileInput.disabled) fileInput.click();
  });

  fileInput?.addEventListener('change', async () => {
    if (!(fileInput instanceof HTMLInputElement) || !fileInput.files?.length) return;
    const file = fileInput.files[0];
    const fd = new FormData();
    fd.append('og', file);
    if (removeBtn instanceof HTMLButtonElement) removeBtn.disabled = true;
    fileInput.disabled = true;
    if (uploadBtn instanceof HTMLButtonElement) {
      uploadBtn.disabled = true;
      uploadBtn.textContent = 'Uploading…';
    }
    if (preview instanceof HTMLImageElement) {
      preview.src = URL.createObjectURL(file);
    }
    if (previewWrap instanceof HTMLElement) previewWrap.hidden = false;
    try {
      const res = await adminFetch('/api/admin/company/og', { method: 'POST', body: fd });
      const json = await readAdminJson(res, 'share image upload');
      if (res.ok && json.company) {
        refreshPreview(json.company);
        onCompany?.(json.company);
        showProfileAlert(companyAlert, 'Share image updated.', 'success');
      } else {
        refreshPreview(lastCompany);
        showProfileAlert(companyAlert, json.error || 'Share image upload failed.', 'error');
      }
    } catch (e) {
      refreshPreview(lastCompany);
      showProfileAlert(companyAlert, e.message || 'Network error — please try again.', 'error');
    } finally {
      fileInput.value = '';
      fileInput.disabled = false;
      if (uploadBtn instanceof HTMLButtonElement) {
        uploadBtn.disabled = false;
        uploadBtn.textContent = 'Upload';
      }
      if (removeBtn instanceof HTMLButtonElement) removeBtn.disabled = false;
    }
  });

  removeBtn?.addEventListener('click', async () => {
    if (!(removeBtn instanceof HTMLButtonElement)) return;
    removeBtn.disabled = true;
    try {
      const res = await adminFetch('/api/admin/company/og', { method: 'DELETE' });
      const json = await readAdminJson(res, 'share image delete');
      if (res.ok && json.company) {
        refreshPreview(json.company);
        onCompany?.(json.company);
        showProfileAlert(companyAlert, 'Share image removed. Pages will use the generated logo card.', 'success');
      } else {
        showProfileAlert(companyAlert, json.error || 'Could not remove share image.', 'error');
      }
    } catch (e) {
      showProfileAlert(companyAlert, e.message || 'Network error — please try again.', 'error');
    } finally {
      removeBtn.disabled = false;
    }
  });

  root.querySelector('#company-og-library')?.addEventListener('click', () => {
    void openMediaPicker({
      title: 'Choose share image',
      hint: 'Choose a PNG, JPEG, or WebP (max 2 MB). 1200×630 works best for link previews.',
      emptyHint:
        'No share images in the library yet. Close and upload a file here, or add one from the Media tab.',
      emptyFilteredHint:
        'Library files are present, but none are PNG, JPEG, or WebP in the size limit.',
      filter: brandingRasterMediaFilter,
      onPick: async (item) => {
        const json = await applyMediaToTarget(item.id, 'company-og');
        if (json.company) {
          refreshPreview(json.company);
          onCompany?.(json.company);
        }
        showProfileAlert(companyAlert, 'Share image updated from library.', 'success');
      },
    });
  });

  if (initialCompany) refreshPreview(initialCompany);

  return { refreshPreview };
}

function bindProfileForm(root) {
  bindFormattedPhoneInputs(root);
  bindAutosaveForm(root, {
    formSelector: '#profile-form',
    alertEl: root.querySelector('#profile-alert'),
    async save(payload) {
      if (payload.phone != null) payload.phone = phoneToStorage(payload.phone);
      const res = await fetch('/api/admin/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      return { ok: res.ok, error: json.error };
    },
  });
}

let companyMapController = null;
let companyPendingGeo = null;
let destroyCompanyAddressAutocomplete = null;
let companyFontPickers = null;

function destroyCompanyMap() {
  if (companyMapController) {
    companyMapController.destroy();
    companyMapController = null;
  }
  if (destroyCompanyAddressAutocomplete) {
    destroyCompanyAddressAutocomplete();
    destroyCompanyAddressAutocomplete = null;
  }
  companyPendingGeo = null;
}

function bindCompanyForm(root, company, fontCatalog, emailFontCatalog) {
  destroyCompanyMap();
  if (companyFontPickers) {
    companyFontPickers.destroy();
    companyFontPickers = null;
  }

  const companyAlert = root.querySelector('#company-alert');
  let resyncCompanyForm = () => {};
  let refreshLogoPreview = () => {};
  let refreshIconPreview = () => {};
  let refreshOgPreview = () => {};
  const onBrandCompany = (next) => {
    syncCompanySvgFields(root, next);
    refreshLogoPreview(next);
    refreshIconPreview(next);
    refreshOgPreview(next);
    resyncCompanyForm();
  };
  const logoBranding = bindCompanyLogoUpload(root, companyAlert, {
    company,
    onCompany: onBrandCompany,
  });
  refreshLogoPreview = logoBranding.refreshPreview;
  const iconBranding = bindCompanyIconUpload(root, companyAlert, company, {
    onCompany: onBrandCompany,
  });
  refreshIconPreview = iconBranding.refreshPreview;
  const ogBranding = bindCompanyOgUpload(root, companyAlert, company, {
    onCompany: onBrandCompany,
  });
  refreshOgPreview = ogBranding.refreshPreview;

  const addressInput = root.querySelector('#company-address');
  const mapHost = root.querySelector('#company-map-host');
  const initialAddress = (addressInput?.value || company?.address || '').trim();
  const hasStoredGeo =
    Number.isFinite(company?.geo?.lat) && Number.isFinite(company?.geo?.lng);

  if (mapHost) {
    companyMapController = createClientMap(mapHost, {
      token: window.__mapboxAccessToken,
      lat: hasStoredGeo ? company.geo.lat : null,
      lng: hasStoredGeo ? company.geo.lng : null,
      address: initialAddress,
      showDirections: false,
      showOpenMaps: false,
    });
  }

  if (addressInput) {
    let companyGeocodeTimer = null;

    async function geocodeCompanyAddressFromInput() {
      const q = addressInput.value.trim();
      if (!q) {
        companyPendingGeo = null;
        companyMapController?.setLocation(null, null, '');
        return;
      }
      const geo = await geocodeClientAddressPreview(q);
      if (geo && companyMapController) {
        companyPendingGeo = geo;
        companyMapController.setLocation(geo.lat, geo.lng, q);
      } else if (companyMapController) {
        companyMapController.setGeocodeFailed(true);
      }
    }

    function scheduleCompanyAddressGeocode() {
      clearTimeout(companyGeocodeTimer);
      companyGeocodeTimer = setTimeout(() => {
        void geocodeCompanyAddressFromInput();
      }, 400);
    }

    destroyCompanyAddressAutocomplete = mountAddressAutocomplete(
      addressInput,
      root.closest('.profile-panel-scroll') || document.getElementById('settings-panel'),
      async (pickedAddress) => {
        clearTimeout(companyGeocodeTimer);
        companyPendingGeo = await geocodeClientAddressPreview(pickedAddress);
        if (companyPendingGeo && companyMapController) {
          companyMapController.setLocation(
            companyPendingGeo.lat,
            companyPendingGeo.lng,
            pickedAddress,
          );
        }
      },
    );

    addressInput.addEventListener('input', () => {
      if (!addressInput.dataset.autocompletePick) companyPendingGeo = null;
      if (!addressInput.value.trim()) {
        clearTimeout(companyGeocodeTimer);
        companyMapController?.setLocation(null, null, '');
        return;
      }
      scheduleCompanyAddressGeocode();
    });
    addressInput.addEventListener('blur', () => {
      clearTimeout(companyGeocodeTimer);
      void geocodeCompanyAddressFromInput();
    });

    if (initialAddress && !hasStoredGeo) {
      void geocodeCompanyAddressFromInput();
    }
  }

  bindFormattedPhoneInputs(root);
  const companyAutosave = bindAutosaveForm(root, {
    formSelector: '#company-form',
    alertEl: companyAlert,
    async save(payload) {
      if (payload.supportPhone != null) payload.supportPhone = phoneToStorage(payload.supportPhone);
      if (companyPendingGeo) payload.geo = companyPendingGeo;
      const res = await fetch('/api/admin/company', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (res.ok) {
        companyPendingGeo = null;
        if (json.company) {
          syncCompanySvgFields(root, json.company);
          logoBranding.refreshPreview(json.company);
          iconBranding.refreshPreview(json.company);
          companyAutosave.resync?.();
        }
      }
      return { ok: res.ok, error: json.error };
    },
  });
  resyncCompanyForm = () => companyAutosave.resync?.();
  companyFontPickers = mountCompanyBrandFontPickers(root, fontCatalog);
  bindCompanyFontPreview(root, fontCatalog);
  bindCompanyEmailFontPreview(root, emailFontCatalog);
  bindCompanyBrandColors(root);
  bindCompanyFontScrape(root, fontCatalog, root.querySelector('#company-alert'), company);
}

function bindCompanyBrandColors(root) {
  const pairs = [
    ['#company-brandPrimary-swatch', '#company-brandPrimary'],
    ['#company-brandSecondary-swatch', '#company-brandSecondary'],
  ];

  for (const [swatchSel, textSel] of pairs) {
    const swatch = root.querySelector(swatchSel);
    const text = root.querySelector(textSel);
    if (!(swatch instanceof HTMLInputElement) || !(text instanceof HTMLInputElement)) continue;

    const syncFromText = () => {
      const normalized = normalizeHexColor(text.value);
      if (normalized) {
        swatch.value = normalized;
        applyCompanyBrandPreview(root);
      }
    };

    swatch.addEventListener('input', () => {
      text.value = swatch.value;
      applyCompanyBrandPreview(root);
      text.dispatchEvent(new Event('change', { bubbles: true }));
    });

    text.addEventListener('change', syncFromText);
    text.addEventListener('blur', syncFromText);
  }
}

function normalizeHexColor(raw) {
  const t = (raw || '').trim();
  if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(t)) return '';
  if (t.length === 4) {
    return `#${t[1]}${t[1]}${t[2]}${t[2]}${t[3]}${t[3]}`.toLowerCase();
  }
  return t.toLowerCase();
}

function hexToRgbChannels(hex) {
  const n = normalizeHexColor(hex);
  if (!n) return '';
  return `${parseInt(n.slice(1, 3), 16)}, ${parseInt(n.slice(3, 5), 16)}, ${parseInt(n.slice(5, 7), 16)}`;
}

function applyCompanyBrandPreview(root) {
  const primary = root.querySelector('#company-brandPrimary');
  const secondary = root.querySelector('#company-brandSecondary');
  if (!(primary instanceof HTMLInputElement) || !(secondary instanceof HTMLInputElement)) return;
  const p = normalizeHexColor(primary.value) || '#ffffff';
  const s = normalizeHexColor(secondary.value) || '#a1a1a1';
  const pRgb = hexToRgbChannels(p);
  const sRgb = hexToRgbChannels(s);
  const gradient = `linear-gradient(135deg, ${p}, ${s})`;
  const rootStyle = document.documentElement.style;
  rootStyle.setProperty('--brand-pink', p);
  rootStyle.setProperty('--brand-magenta', s);
  rootStyle.setProperty('--brand-indigo', s);
  rootStyle.setProperty('--brand-pink-rgb', pRgb);
  rootStyle.setProperty('--brand-magenta-rgb', sRgb);
  rootStyle.setProperty('--brand-indigo-rgb', sRgb);
  rootStyle.setProperty('--brand-gradient', gradient);
  rootStyle.setProperty('--brand-gradient-shadow', 'none');
  rootStyle.setProperty('--create-fab-bg', gradient);
  rootStyle.setProperty('--create-fab-shadow', '0 1px 2px rgba(0, 0, 0, 0.12)');
  rootStyle.setProperty('--brand-glow-filter', 'none');
}

const SOCIAL_OAUTH_ERRORS = {
  not_configured: "That platform isn't set up yet — add its API credentials first.",
  denied: 'Authorization was cancelled.',
  state_mismatch: 'Security check failed. Please try connecting again.',
  missing_code: "The provider didn't return an authorization code.",
  exchange_failed: 'Could not complete the connection. Check the app credentials and callback URL.',
  unknown_platform: 'Unknown platform.',
};

function showSocialOAuthReturnAlert(root) {
  const params = new URLSearchParams(location.search);
  const connected = params.get('social_connected');
  const error = params.get('social_error');
  const errPlatform = params.get('platform');
  if (!connected && !error) return;

  const alertEl = root.querySelector('#socials-alert');
  if (connected) {
    showProfileAlert(alertEl, `Connected ${socialPlatformLabel(connected)}.`, 'success');
  } else if (error) {
    const prefix = errPlatform ? `${socialPlatformLabel(errPlatform)}: ` : '';
    showProfileAlert(alertEl, prefix + (SOCIAL_OAUTH_ERRORS[error] || 'Connection failed.'), 'error');
  }

  params.delete('social_connected');
  params.delete('social_error');
  params.delete('platform');
  const qs = params.toString();
  history.replaceState({}, '', location.pathname + (qs ? `?${qs}` : '') + location.hash);
}

function bindSocialsForm(root) {
  const form = root.querySelector('#socials-form');
  const hiddenInput = root.querySelector('#social-hidden-platforms');

  const readHidden = () => {
    try {
      const parsed = JSON.parse(hiddenInput?.value || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  const writeHidden = (ids) => {
    if (hiddenInput) hiddenInput.value = JSON.stringify(ids);
  };

  const saveCompanyPayload = async (payload) => {
    const res = await fetch('/api/admin/company', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    return { ok: res.ok, error: json.error };
  };

  const payloadFromSocialsForm = (formEl) => composeSocialFormPayload(formEl);

  bindSocialHandleInputs(root);
  bindAutosaveForm(root, {
    formSelector: '#socials-form',
    alertEl: root.querySelector('#socials-alert'),
    save: () => saveCompanyPayload(composeSocialFormPayload(form)),
    validateField: (el) => validateSocialHandleField(el),
  });

  root.querySelectorAll('[data-soc-copy]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      copyChatText(btn.getAttribute('data-soc-copy') || '', btn);
    });
  });

  root.querySelectorAll('[data-soc-disconnect]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const platform = btn.getAttribute('data-soc-disconnect');
      if (!platform) return;
      btn.disabled = true;
      try {
        const res = await fetch(`/api/admin/social/disconnect/${platform}`, { method: 'POST' });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json.ok) throw new Error(json.error || `HTTP ${res.status}`);
        await loadSocialsTab();
      } catch (e) {
        btn.disabled = false;
        showProfileAlert(root.querySelector('#socials-alert'), e.message || 'Disconnect failed.', 'error');
      }
    });
  });

  root.querySelectorAll('[data-soc-hide]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const platformId = btn.getAttribute('data-soc-hide');
      if (!platformId || !(form instanceof HTMLFormElement)) return;
      const label = socialPlatformLabel(platformId);
      if (!confirm(`Remove ${label} from your socials list? You can restore it later from "Removed platforms".`)) {
        return;
      }

      const hidden = readHidden();
      if (!hidden.includes(platformId)) hidden.push(platformId);
      writeHidden(hidden);

      const platform = socialPlatformCatalog.find((p) => p.id === platformId);
      if (platform) {
        const input = form.querySelector(`[name="${platform.field}"]`);
        if (input instanceof HTMLInputElement) input.value = '';
      }

      btn.disabled = true;
      try {
        const payload = payloadFromSocialsForm(form);
        const result = await saveCompanyPayload(payload);
        if (!result.ok) throw new Error(result.error || 'Save failed');
        await loadSocialsTab();
      } catch (e) {
        btn.disabled = false;
        showProfileAlert(root.querySelector('#socials-alert'), e.message || 'Remove failed.', 'error');
      }
    });
  });

  root.querySelectorAll('[data-soc-restore]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const platformId = btn.getAttribute('data-soc-restore');
      if (!platformId || !(form instanceof HTMLFormElement)) return;
      writeHidden(readHidden().filter((id) => id !== platformId));
      btn.disabled = true;
      try {
        const payload = payloadFromSocialsForm(form);
        const result = await saveCompanyPayload(payload);
        if (!result.ok) throw new Error(result.error || 'Save failed');
        await loadSocialsTab();
      } catch (e) {
        btn.disabled = false;
        showProfileAlert(root.querySelector('#socials-alert'), e.message || 'Restore failed.', 'error');
      }
    });
  });

  const addSelect = root.querySelector('#social-add-platform');
  if (addSelect instanceof HTMLSelectElement) {
    addSelect.addEventListener('change', async () => {
      const platformId = addSelect.value;
      if (!platformId || !(form instanceof HTMLFormElement)) return;
      writeHidden(readHidden().filter((id) => id !== platformId));
      addSelect.disabled = true;
      try {
        const payload = payloadFromSocialsForm(form);
        const result = await saveCompanyPayload(payload);
        if (!result.ok) throw new Error(result.error || 'Save failed');
        await loadSocialsTab();
      } catch (e) {
        addSelect.disabled = false;
        showProfileAlert(root.querySelector('#socials-alert'), e.message || 'Could not add platform.', 'error');
      }
    });
  }

  showSocialOAuthReturnAlert(root);
}

function industriesEmptyHtml() {
  return `<div class="ind-empty">No industries yet — add one below.</div>`;
}

let industryBaselineIds = new Set(['001', '002', '003']);

function setIndustryBaselineIds(ids) {
  if (!Array.isArray(ids) || !ids.length) return;
  industryBaselineIds = new Set(ids.map((id) => String(id).trim().padStart(3, '0')));
}

function setIndustryEnabledToggle(toggle, enabled) {
  if (!(toggle instanceof HTMLElement)) return;
  const on = enabled !== false;
  setToggleSwitch(toggle, on);
  toggle.title = on ? 'On' : 'Off';
  toggle.setAttribute('aria-label', on ? 'Enabled' : 'Disabled');
}

function normalizeIndustryPlaybookClient(raw) {
  const o = raw && typeof raw === 'object' ? raw : {};
  const moduleIds = Array.isArray(o.moduleIds)
    ? [...new Set(o.moduleIds.map((id) => String(id).trim().padStart(3, '0')).filter((id) => /^\d{3}$/.test(id)))]
        .filter((id) => !industryBaselineIds.has(id))
        .sort()
    : [];
  const extras = Array.isArray(o.extras)
    ? [...new Set(o.extras.filter((id) => typeof id === 'string'))]
    : [];
  return {
    moduleIds,
    extras,
    seedInbox: o.seedInbox !== false,
    seedTodos: o.seedTodos !== false,
    seedSchedule: o.seedSchedule !== false,
    postAlias: typeof o.postAlias === 'string' ? o.postAlias.trim().toLowerCase() : '',
    notes: typeof o.notes === 'string' ? o.notes.replace(/\r\n/g, '\n').trim() : '',
  };
}

function playbookFromIndustryCard(card) {
  let stored = {};
  try {
    stored = JSON.parse(card.dataset.playbook || '{}');
  } catch {
    stored = {};
  }
  const fallback = normalizeIndustryPlaybookClient(stored);
  const moduleChips = card.querySelectorAll('[data-ind-module]');
  const extraChips = card.querySelectorAll('[data-ind-extra]');
  return {
    notes: card.querySelector('.ind-notes')?.value?.trim() || '',
    postAlias: card.querySelector('.ind-post-alias')?.value?.trim().toLowerCase() || '',
    seedInbox: card.querySelector('[data-ind-seed="inbox"]')?.getAttribute('aria-checked') === 'true',
    seedTodos: card.querySelector('[data-ind-seed="todos"]')?.getAttribute('aria-checked') === 'true',
    seedSchedule: card.querySelector('[data-ind-seed="schedule"]')?.getAttribute('aria-checked') === 'true',
    moduleIds: moduleChips.length
      ? Array.from(card.querySelectorAll('[data-ind-module][aria-checked="true"]'))
          .map((el) => el.getAttribute('data-ind-module') || '')
          .filter(Boolean)
          .sort()
      : fallback.moduleIds,
    extras: extraChips.length
      ? Array.from(card.querySelectorAll('[data-ind-extra][aria-checked="true"]'))
          .map((el) => el.getAttribute('data-ind-extra') || '')
          .filter(Boolean)
      : fallback.extras,
  };
}

function setIndustryChip(btn, on) {
  if (!(btn instanceof HTMLElement)) return;
  btn.setAttribute('aria-checked', on ? 'true' : 'false');
  btn.classList.toggle('is-on', on);
}

function industryChip(kind, id, label, on) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'ind-chip';
  btn.setAttribute('role', 'switch');
  btn.setAttribute(kind === 'module' ? 'data-ind-module' : kind === 'extra' ? 'data-ind-extra' : 'data-ind-seed', id);
  btn.textContent = label;
  setIndustryChip(btn, on);
  return btn;
}

function createIndustryRow(item, { onDelete, onToggle, onPlaybookChange, modules = [], extras = [], expanded = false } = {}) {
  const enabled = item?.enabled !== false;
  const playbook = normalizeIndustryPlaybookClient(item?.playbook);
  const card = document.createElement('div');
  card.className = 'ind-card' + (expanded ? ' is-open' : '');
  if (item?.slug) card.dataset.slug = item.slug;
  card.dataset.playbook = JSON.stringify(playbook);

  const row = document.createElement('div');
  row.className = 'ind-row';

  const labelInput = document.createElement('input');
  labelInput.className = 'ind-label';
  labelInput.type = 'text';
  labelInput.value = item?.label || '';
  labelInput.placeholder = 'Industry';
  labelInput.setAttribute('aria-label', 'Industry label');

  const expandBtn = document.createElement('button');
  expandBtn.type = 'button';
  expandBtn.className = 'prof-btn-secondary ind-expand';
  expandBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  expandBtn.textContent = 'Playbook';

  const toggle = createToggleSwitch({
    className: 'ind-enabled-toggle',
    checked: enabled,
    label: enabled ? 'Enabled' : 'Disabled',
    title: enabled ? 'On' : 'Off',
    onClick: (btn) => {
      const next = btn.getAttribute('aria-checked') !== 'true';
      setIndustryEnabledToggle(btn, next);
      onToggle?.(btn);
    },
  });
  setIndustryEnabledToggle(toggle, enabled);

  const removeBtn = paneDeleteIcon({
    label: 'Delete industry',
    onClick: () => onDelete?.(card),
  });

  row.append(labelInput, expandBtn, toggle, removeBtn);

  const body = document.createElement('div');
  body.className = 'ind-playbook';
  if (!expanded) body.hidden = true;

  const notesField = document.createElement('label');
  notesField.className = 'ind-field';
  notesField.innerHTML = `<span>What to include</span>`;
  const notes = document.createElement('textarea');
  notes.className = 'ind-notes';
  notes.rows = 3;
  notes.maxLength = 2000;
  notes.placeholder = 'Operator notes for this deploy — modules to stress, sample-data caveats, court/knowledge setup…';
  notes.value = playbook.notes;
  notes.setAttribute('aria-label', 'Deployment instructions');
  notesField.appendChild(notes);

  const aliasField = document.createElement('label');
  aliasField.className = 'ind-field';
  aliasField.innerHTML = `<span>Work name</span>`;
  const alias = document.createElement('input');
  alias.className = 'ind-post-alias';
  alias.type = 'text';
  alias.maxLength = 32;
  alias.placeholder = 'project';
  alias.value = playbook.postAlias;
  alias.setAttribute('aria-label', 'Work record name');
  aliasField.appendChild(alias);

  const seedWrap = document.createElement('div');
  seedWrap.className = 'ind-chip-list';
  seedWrap.setAttribute('role', 'group');
  seedWrap.setAttribute('aria-label', 'Sample data');
  seedWrap.append(
    industryChip('seed', 'inbox', 'Inbox', playbook.seedInbox),
    industryChip('seed', 'todos', 'Todos', playbook.seedTodos),
    industryChip('seed', 'schedule', 'Schedule', playbook.seedSchedule),
  );

  const moduleWrap = document.createElement('div');
  moduleWrap.className = 'ind-chip-list';
  moduleWrap.setAttribute('role', 'group');
  moduleWrap.setAttribute('aria-label', 'Optional modules');
  const moduleSet = new Set(playbook.moduleIds);
  if (modules.length) {
    for (const mod of modules) {
      moduleWrap.appendChild(industryChip('module', mod.id, mod.label, moduleSet.has(mod.id)));
    }
  } else {
    moduleWrap.innerHTML = `<p class="ind-empty">Module catalog unavailable.</p>`;
  }

  const extraWrap = document.createElement('div');
  extraWrap.className = 'ind-chip-list';
  extraWrap.setAttribute('role', 'group');
  extraWrap.setAttribute('aria-label', 'Optional extras');
  const extraSet = new Set(playbook.extras);
  for (const extra of extras) {
    extraWrap.appendChild(industryChip('extra', extra.id, extra.label, extraSet.has(extra.id)));
  }

  const seedLabel = document.createElement('p');
  seedLabel.className = 'ind-field-label';
  seedLabel.textContent = 'Sample data';
  const moduleLabel = document.createElement('p');
  moduleLabel.className = 'ind-field-label';
  moduleLabel.textContent = 'Optional modules';
  const extraLabel = document.createElement('p');
  extraLabel.className = 'ind-field-label';
  extraLabel.textContent = extras.length ? 'Optional extras' : '';

  body.append(notesField, aliasField, seedLabel, seedWrap, moduleLabel, moduleWrap);
  if (extras.length) body.append(extraLabel, extraWrap);

  expandBtn.addEventListener('click', (e) => {
    e.preventDefault();
    const open = !card.classList.contains('is-open');
    card.classList.toggle('is-open', open);
    body.hidden = !open;
    expandBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  });

  body.addEventListener('click', (e) => {
    const chip = e.target?.closest?.('.ind-chip');
    if (!chip) return;
    e.preventDefault();
    const next = chip.getAttribute('aria-checked') !== 'true';
    setIndustryChip(chip, next);
    onPlaybookChange?.(chip);
  });

  card.append(row, body);
  return card;
}

function mountIndustriesList(listEl, industries, rowHandlers) {
  listEl.replaceChildren();
  const list = Array.isArray(industries) && industries.length ? industries : [];
  if (!list.length) {
    listEl.innerHTML = industriesEmptyHtml();
    return;
  }
  const openSlugs = rowHandlers.openSlugs instanceof Set ? rowHandlers.openSlugs : new Set();
  for (const item of list) {
    listEl.appendChild(
      createIndustryRow(item, {
        ...rowHandlers,
        expanded: Boolean(item?.slug && openSlugs.has(item.slug)),
      }),
    );
  }
}

function collectIndustriesFromDom(root) {
  return Array.from(root.querySelectorAll('.ind-card'))
    .map((card, i) => {
      const label = card.querySelector('.ind-label')?.value?.trim() || '';
      const slug = card.dataset.slug?.trim() || '';
      const enabled = card.querySelector('.ind-enabled-toggle')?.getAttribute('aria-checked') === 'true';
      return {
        label,
        slug: slug || undefined,
        enabled,
        sortOrder: i,
        playbook: normalizeIndustryPlaybookClient(playbookFromIndustryCard(card)),
      };
    })
    .filter((r) => r.label);
}

function industriesIdentity(industries) {
  return (industries || []).map((item) => `${item.slug || ''}\t${item.label || ''}`).join('\n');
}

function industriesBaselineFromList(industries) {
  return JSON.stringify(
    (industries || []).map((item, i) => ({
      label: item.label || '',
      slug: item.slug || '',
      enabled: item.enabled !== false,
      sortOrder: i,
      playbook: normalizeIndustryPlaybookClient(item.playbook),
    })),
  );
}

/**
 * Remount from the server list (already alphabetized) and restore focus.
 * Patching existing rows by index overwrites the last item whenever a new
 * entry sorts into the middle — the focused input is skipped, so its label
 * stays on the last row and the previous last industry is lost on the next save.
 */
function syncIndustriesListFromServer(listEl, industries, rowHandlers) {
  const active = document.activeElement;
  const wasInList = active instanceof HTMLElement && listEl.contains(active);
  const activeCard = wasInList ? active.closest('.ind-card') : null;
  const activeSlug = activeCard?.dataset.slug || '';
  const activeLabel = activeCard?.querySelector('.ind-label')?.value?.trim() || '';
  const focusKey = wasInList
    ? active.classList.contains('ind-label')
      ? 'label'
      : active.classList.contains('ind-notes')
        ? 'notes'
        : active.classList.contains('ind-post-alias')
          ? 'alias'
          : null
    : null;
  const selStart = wasInList && 'selectionStart' in active ? active.selectionStart : null;
  const selEnd = wasInList && 'selectionEnd' in active ? active.selectionEnd : null;
  const openSlugs = new Set(rowHandlers.openSlugs instanceof Set ? rowHandlers.openSlugs : []);
  listEl.querySelectorAll('.ind-card.is-open').forEach((card) => {
    if (card.dataset.slug) openSlugs.add(card.dataset.slug);
  });
  rowHandlers.openSlugs = openSlugs;

  mountIndustriesList(listEl, industries, rowHandlers);

  if (!wasInList) return null;

  const cards = Array.from(listEl.querySelectorAll('.ind-card'));
  const match =
    (activeSlug && cards.find((c) => c.dataset.slug === activeSlug)) ||
    (activeLabel && cards.find((c) => c.querySelector('.ind-label')?.value?.trim() === activeLabel)) ||
    null;
  const input =
    focusKey === 'notes'
      ? match?.querySelector('.ind-notes')
      : focusKey === 'alias'
        ? match?.querySelector('.ind-post-alias')
        : match?.querySelector('.ind-label');
  if (!(input instanceof HTMLInputElement) && !(input instanceof HTMLTextAreaElement)) return null;
  input.focus();
  try {
    const len = input.value.length;
    input.setSelectionRange(
      Math.min(selStart ?? len, len),
      Math.min(selEnd ?? len, len),
    );
  } catch {
    /* ignore non-text inputs */
  }
  return input;
}

function bindIndustriesEditor(root, industries, catalogs = {}) {
  setIndustryBaselineIds(catalogs.baselineModuleIds);
  const listEl = root.querySelector('#industries-list');
  const alertEl = root.querySelector('#industries-alert');
  const addBtn = root.querySelector('#industries-add-btn');
  if (!listEl) return;

  let baseline = '[]';
  let activeEl = null;
  let debounceTimer = null;
  let saving = false;
  let pendingFlush = false;
  const rowHandlers = {
    modules: Array.isArray(catalogs.modules) ? catalogs.modules : [],
    extras: Array.isArray(catalogs.extras) ? catalogs.extras : [],
    openSlugs: new Set(),
  };

  const snapshot = () => JSON.stringify(collectIndustriesFromDom(root));

  const flush = async () => {
    clearTimeout(debounceTimer);
    debounceTimer = null;

    if (saving) {
      pendingFlush = true;
      return;
    }

    const current = snapshot();
    if (current === baseline) return;

    saving = true;
    if (activeEl) setFormFieldState(activeEl, 'saving');

    try {
      const nextIndustries = collectIndustriesFromDom(root);
      const res = await fetch('/api/admin/deck-industries', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ industries: nextIndustries }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.ok) {
        if (industriesIdentity(json.industries) !== industriesIdentity(nextIndustries)) {
          const focused = syncIndustriesListFromServer(listEl, json.industries, rowHandlers);
          if (focused) activeEl = focused;
        } else {
          const cards = Array.from(listEl.querySelectorAll('.ind-card'));
          for (const item of json.industries || []) {
            const card =
              cards.find((c) => c.dataset.slug === item.slug) ||
              cards.find((c) => c.querySelector('.ind-label')?.value?.trim() === item.label);
            if (card && item.slug) card.dataset.slug = item.slug;
          }
        }
        baseline = industriesBaselineFromList(json.industries);
        if (activeEl) flashFormFieldSaved(activeEl);
      } else {
        if (activeEl) setFormFieldState(activeEl, 'invalid');
        showProfileAlert(alertEl, json.error || 'Save failed.', 'error');
      }
    } catch {
      if (activeEl) setFormFieldState(activeEl, 'invalid');
      showProfileAlert(alertEl, 'Network error — please try again.', 'error');
    } finally {
      saving = false;
      if (
        activeEl &&
        !activeEl.classList.contains(FORM_FIELD_SAVED) &&
        !activeEl.classList.contains(FORM_FIELD_INVALID)
      ) {
        setFormFieldState(activeEl, null);
      }
      if (pendingFlush) {
        pendingFlush = false;
        await flush();
      }
    }
  };

  const schedule = (el) => {
    activeEl = el || null;
    if (
      el &&
      !el.classList.contains(FORM_FIELD_INVALID) &&
      !el.classList.contains(FORM_FIELD_SAVED)
    ) {
      setFormFieldState(el, null);
    }
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(flush, AUTOSAVE_DEBOUNCE_MS);
  };

  const removeRow = (card) => {
    if (card?.dataset?.slug) rowHandlers.openSlugs.delete(card.dataset.slug);
    card?.remove();
    if (!listEl.querySelector('.ind-card')) {
      listEl.innerHTML = industriesEmptyHtml();
    }
    activeEl = null;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(flush, AUTOSAVE_DEBOUNCE_MS);
  };

  rowHandlers.onDelete = removeRow;
  rowHandlers.onToggle = () => {
    activeEl = null;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(flush, AUTOSAVE_DEBOUNCE_MS);
  };
  rowHandlers.onPlaybookChange = (el) => schedule(el);

  mountIndustriesList(listEl, industries, rowHandlers);
  baseline = industriesBaselineFromList(
    Array.isArray(industries) && industries.length ? industries : collectIndustriesFromDom(root),
  );

  listEl.addEventListener('input', (e) => {
    if (e.target?.matches?.('.ind-label, .ind-notes, .ind-post-alias')) schedule(e.target);
  });

  addBtn?.addEventListener('click', () => {
    listEl.querySelector('.ind-empty')?.remove();
    const card = createIndustryRow(
      { label: '', slug: '', enabled: true, playbook: normalizeIndustryPlaybookClient(null) },
      { ...rowHandlers, expanded: true },
    );
    listEl.appendChild(card);
    const labelInput = card.querySelector('.ind-label');
    labelInput?.focus();
    if (labelInput) schedule(labelInput);
  });

  settingsAutosaveFlush = flush;
}

function profSection(title, subtitle, fieldsHtml) {
  return (
    `<section class="prof-section">` +
      `<div class="prof-section-copy">` +
        `<h2 class="prof-title prof-title--section">${title}</h2>` +
        (subtitle ? `<p class="prof-subtitle">${subtitle}</p>` : '') +
      `</div>` +
      `<div class="prof-section-fields">${fieldsHtml}</div>` +
    `</section>`
  );
}

function renderProfileOnlyPanel(profile) {
  const p = profile || {};
  return (
    `<div class="profile-panel-scroll">` +
      `<div class="prof-card">` +
        `<h1 class="prof-title">Profile</h1>` +
        `<p class="prof-subtitle">Your account details and preferences.</p>` +
        `<div id="profile-alert" class="prof-alert" hidden></div>` +
        `<form id="profile-form" class="prof-form">` +
          profSection(
            'Account',
            'Name and contact details for your signed-in user.',
            `<div class="prof-field-row">` +
              `<div class="prof-field"><label for="profile-firstName">First Name</label>` +
              `<input id="profile-firstName" name="firstName" type="text" value="${escHtml(p.firstName || '')}" autocomplete="given-name" /></div>` +
              `<div class="prof-field"><label for="profile-lastName">Last Name</label>` +
              `<input id="profile-lastName" name="lastName" type="text" value="${escHtml(p.lastName || '')}" autocomplete="family-name" /></div>` +
            `</div>` +
            `<div class="prof-field"><label for="profile-email">Email</label>` +
            `<input id="profile-email" name="email" type="email" value="${escHtml(p.email || '')}" disabled autocomplete="email" />` +
            `<span class="prof-hint">Email is managed through your Clerk account.</span></div>` +
            `<div class="prof-field-row">` +
              `<div class="prof-field"><label for="profile-phone">Phone</label>` +
              `<input id="profile-phone" name="phone" type="tel" value="${escHtml(formatPhoneInput(p.phone || ''))}" autocomplete="tel" inputmode="tel" placeholder="+1 (555) 000-0000" /></div>` +
              `<div class="prof-field"><label for="profile-timezone">Time Zone</label>` +
              `<select id="profile-timezone" name="timezone">${profileTimezoneOptions(p.timezone || '')}</select></div>` +
            `</div>`,
          ) +
          profSection(
            'Email signature',
            'Appended to outbound emails you send from the inbox. Stored on your account, not company settings.',
            `<div class="prof-field prof-field--signature">` +
              `<div id="profile-signature-editor"></div>` +
              `<textarea id="profile-emailSignature" name="emailSignature" hidden>${escHtml(p.emailSignature || '')}</textarea>` +
              `<span class="prof-hint">Drag a logo in, or use Upload / Library / Company logo. Switch to Preview to see how it looks in email.</span></div>`,
          ) +
        `</form>` +
      `</div>` +
    `</div>`
  );
}

function brandFontsForRole(catalog, role) {
  return (catalog || []).filter(
    (entry) =>
      entry.id.startsWith('google:') ||
      (Array.isArray(entry.roles) && entry.roles.includes(role)),
  );
}

function renderBrandFontOptions(catalog, role, selectedId) {
  const entry =
    (catalog || []).find((item) => item.id === selectedId) ||
    brandFontsForRole(catalog, role)[0];
  if (!entry) return '';
  return `<option value="${escHtml(entry.id)}" selected>${escHtml(entry.label)}</option>`;
}

function buildBrandFontsHref(catalog, primaryId, secondaryId, contentId) {
  const ids = [primaryId, secondaryId, contentId].filter(Boolean);
  const entries = ids
    .map((id) => (catalog || []).find((entry) => entry.id === id))
    .filter(Boolean);
  if (!entries.length) return '';
  const specs = new Map();
  for (const entry of entries) {
    specs.set(entry.family, entry.googleSpec);
  }
  return `https://fonts.googleapis.com/css2?${[...specs.values()]
    .map((spec) => `family=${spec}`)
    .join('&')}&display=swap`;
}

function bindCompanyFontPreview(root, catalog) {
  const primarySelect = root.querySelector('#company-fontPrimary');
  const secondarySelect = root.querySelector('#company-fontSecondary');
  const contentSelect = root.querySelector('#company-fontContent');
  const previewPrimary = root.querySelector('.prof-font-preview-primary');
  const previewSecondary = root.querySelector('.prof-font-preview-secondary');
  const previewContent = root.querySelector('.prof-font-preview-content');
  if (
    !primarySelect ||
    !secondarySelect ||
    !contentSelect ||
    !previewPrimary ||
    !previewSecondary ||
    !previewContent
  ) {
    return;
  }

  let fontLink = document.getElementById('company-font-preview-link');
  if (!(fontLink instanceof HTMLLinkElement)) {
    fontLink = document.createElement('link');
    fontLink.id = 'company-font-preview-link';
    fontLink.rel = 'stylesheet';
    document.head.appendChild(fontLink);
  }

  const sansFallback = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  const serifFallback = 'Georgia, "Times New Roman", serif';
  const contentStack = (entry) => {
    if (!entry) return '';
    const serif =
      entry.id === 'source-serif-4' ||
      /\bserif\b/i.test(String(entry.family || '')) ||
      /\bserif\b/i.test(String(entry.id || ''));
    return `"${entry.family}", ${serif ? serifFallback : sansFallback}`;
  };

  const update = () => {
    const primaryId = primarySelect.value;
    const secondaryId = secondarySelect.value;
    const contentId = contentSelect.value;
    const primary = (catalog || []).find((entry) => entry.id === primaryId);
    const secondary = (catalog || []).find((entry) => entry.id === secondaryId);
    const content = (catalog || []).find((entry) => entry.id === contentId);
    const href = buildBrandFontsHref(catalog, primaryId, secondaryId, contentId);
    if (href) fontLink.href = href;
    previewPrimary.style.fontFamily = primary ? `"${primary.family}", ${sansFallback}` : '';
    previewSecondary.style.fontFamily = secondary ? `"${secondary.family}", ${sansFallback}` : '';
    previewContent.style.fontFamily = contentStack(content);
  };

  primarySelect.addEventListener('change', update);
  secondarySelect.addEventListener('change', update);
  contentSelect.addEventListener('change', update);
  update();
}

function rebuildCompanyFontSelects(root, catalog, fonts) {
  const primary = root.querySelector('#company-fontPrimary');
  const secondary = root.querySelector('#company-fontSecondary');
  const content = root.querySelector('#company-fontContent');
  if (!(primary instanceof HTMLSelectElement)) return;
  if (!(secondary instanceof HTMLSelectElement)) return;
  if (!(content instanceof HTMLSelectElement)) return;
  primary.innerHTML = renderBrandFontOptions(catalog, 'primary', fonts?.fontPrimaryId);
  secondary.innerHTML = renderBrandFontOptions(catalog, 'secondary', fonts?.fontSecondaryId);
  content.innerHTML = renderBrandFontOptions(catalog, 'content', fonts?.fontContentId);
  primary.value = fonts?.fontPrimaryId || primary.value;
  secondary.value = fonts?.fontSecondaryId || secondary.value;
  content.value = fonts?.fontContentId || content.value;
  companyFontPickers?.updateCatalog(catalog);
}

function bindCompanyFontScrape(root, fontCatalog, alertEl, company) {
  const btn = root.querySelector('#company-font-scrape');
  const domainInput = root.querySelector('#company-domain');
  if (!(btn instanceof HTMLButtonElement)) return;

  const hasWebsite = () => {
    const typed = domainInput instanceof HTMLInputElement ? domainInput.value.trim() : '';
    return !!(typed || (company?.domain || '').trim());
  };

  const syncBtn = () => {
    btn.disabled = !hasWebsite();
  };

  syncBtn();
  domainInput?.addEventListener('input', syncBtn);

  btn.addEventListener('click', async () => {
    const domain = domainInput instanceof HTMLInputElement ? domainInput.value.trim() : '';
    if (!hasWebsite()) return;

    btn.disabled = true;
    const prevLabel = btn.textContent;
    btn.textContent = 'Fetching…';
    try {
      const res = await fetch('/api/admin/company/scrape-fonts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(domain ? { website: domain } : {}),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        showProfileAlert(alertEl, json.error || 'Could not fetch fonts from website.', 'error');
        return;
      }

      const catalog = Array.isArray(json.fontCatalog) ? json.fontCatalog : fontCatalog;
      rebuildCompanyFontSelects(root, catalog, json.company?.fonts);
      root.querySelector('#company-fontPrimary')?.dispatchEvent(new Event('change'));
      showProfileAlert(alertEl, json.message || 'Fonts imported from website.', 'success');
    } catch {
      showProfileAlert(alertEl, 'Network error — please try again.', 'error');
    } finally {
      syncBtn();
      btn.textContent = prevLabel;
    }
  });
}

function renderEmailFontOptions(catalog, selectedId) {
  const list = Array.isArray(catalog) ? catalog : [];
  const groups = [
    { id: 'sans', label: 'Sans-serif' },
    { id: 'serif', label: 'Serif' },
    { id: 'mono', label: 'Monospace' },
  ];
  const grouped = groups
    .map((group) => {
      const opts = list.filter((entry) => entry.category === group.id);
      if (!opts.length) return '';
      return (
        `<optgroup label="${escHtml(group.label)}">` +
        opts
          .map((entry) => {
            const sel = entry.id === selectedId ? ' selected' : '';
            return `<option value="${escHtml(entry.id)}"${sel}>${escHtml(entry.label)}</option>`;
          })
          .join('') +
        `</optgroup>`
      );
    })
    .join('');
  if (grouped) return grouped;
  const sel = !selectedId || selectedId === 'system' ? ' selected' : '';
  return `<option value="system"${sel}>System UI</option>`;
}

function bindCompanyEmailFontPreview(root, catalog) {
  const select = root.querySelector('#company-emailFont');
  const preview = root.querySelector('.prof-email-font-preview-text');
  const note = root.querySelector('#company-email-font-note');
  if (!(select instanceof HTMLSelectElement) || !preview) return;
  const update = () => {
    const entry = (catalog || []).find((item) => item.id === select.value);
    preview.style.fontFamily =
      entry?.preview || '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
    if (note) note.textContent = entry?.note || '';
  };
  select.addEventListener('change', update);
  update();
}

function renderCompanyPanel(company, fontCatalog, emailFontCatalog) {
  const c = company || {};
  const fonts = c.fonts || {};
  const logoUrl = companyLogoPreviewUrl(c);
  const hasLogo = hasCustomCompanyLogo(c);
  const hasLogoPng = hasUploadedCompanyLogoPng(c);
  const iconUrl = companyIconPreviewUrl(c);
  const hasIcon = hasCustomCompanyIcon(c);
  const hasIconPng = hasUploadedCompanyIconPng(c);
  const hasRemovableIcon = hasRemovableCompanyIcon(c);
  return (
    `<div class="profile-panel-scroll">` +
      `<div class="prof-card">` +
        `<h1 class="prof-title">Company</h1>` +
        `<p class="prof-subtitle">Branding shown on client pages, emails, documents, and legal pages.</p>` +
        `<div id="company-alert" class="prof-alert" hidden></div>` +
        `<form id="company-form" class="prof-form">` +
          profSection(
            'Identity',
            'Name and tagline shown on client pages, emails, documents, and legal.',
            `<div class="prof-field"><label for="company-name">Display name</label>` +
            `<input id="company-name" name="name" type="text" value="${escHtml(c.name || '')}" placeholder="Acme Corp" autocomplete="organization" /></div>` +
            `<div class="prof-field"><label for="company-legalName">Legal name</label>` +
            `<input id="company-legalName" name="legalName" type="text" value="${escHtml(c.legalName || '')}" placeholder="Acme Corporation LLC" />` +
            `<span class="prof-hint">Used in contracts and NDAs. Defaults to display name if empty.</span></div>` +
            `<div class="prof-field"><label for="company-description">Tagline / description</label>` +
            `<input id="company-description" name="description" type="text" value="${escHtml(c.description || '')}" placeholder="Automated client communication" /></div>`,
          ) +
          profSection(
            'Location',
            'Office location for the map, driving directions, and address autocomplete defaults.',
            `<div class="prof-field"><label for="company-address">Business address</label>` +
            `<input id="company-address" name="address" type="text" value="${escHtml(c.address || '')}" placeholder="Business or street address" autocomplete="street-address" autocapitalize="words" /></div>` +
            `<div id="company-map-host" class="cl-map-section"></div>`,
          ) +
          profSection(
            'Logo &amp; icon',
            'PNG, JPEG, or WebP. Used when no SVG is pasted in the group below. Header and homepage: SVG → image → company name.',
            `<div class="prof-branding-uploads">` +
              `<div class="prof-branding-upload-item">` +
                `<label for="company-logo-file">Logo</label>` +
                `<div class="prof-logo-upload">` +
                  `<div id="company-logo-preview-wrap" class="prof-logo-preview-wrap"${hasLogo ? '' : ' hidden'}>` +
                    `<img id="company-logo-preview" class="prof-logo-preview" src="${escHtml(logoUrl)}" alt="" />` +
                    `<button type="button" id="company-logo-remove" class="prof-logo-remove" aria-label="Remove logo"${hasLogo ? '' : ' hidden'}>×</button>` +
                  `</div>` +
                  `<div id="company-logo-file-wrap" class="prof-logo-file-wrap"${hasLogoPng ? ' hidden' : ''}>` +
                    `<input id="company-logo-file" class="prof-logo-file-input" type="file" accept="image/*,image/svg+xml,.svg,.png,.jpg,.jpeg,.webp" hidden />` +
                    `<button type="button" id="company-logo-upload-btn" class="de-btn de-btn-secondary">Upload</button>` +
                  `</div>` +
                  `<button type="button" id="company-logo-library" class="de-btn de-btn-secondary prof-branding-library-btn">Library</button>` +
                `</div>` +
              `</div>` +
              `<div class="prof-branding-upload-item">` +
                `<label for="company-icon-file">Icon</label>` +
                `<div class="prof-logo-upload">` +
                  `<div id="company-icon-preview-wrap" class="prof-logo-preview-wrap"${hasIcon ? '' : ' hidden'}>` +
                    `<img id="company-icon-preview" class="prof-icon-preview" src="${escHtml(iconUrl)}" alt="" />` +
                    `<button type="button" id="company-icon-remove" class="prof-logo-remove" aria-label="Remove icon"${hasRemovableIcon ? '' : ' hidden'}>×</button>` +
                  `</div>` +
                  `<div id="company-icon-file-wrap" class="prof-logo-file-wrap"${hasIconPng ? ' hidden' : ''}>` +
                    `<input id="company-icon-file" class="prof-logo-file-input" type="file" accept="image/*,image/svg+xml,.svg,.png,.jpg,.jpeg,.webp" hidden />` +
                    `<button type="button" id="company-icon-upload-btn" class="de-btn de-btn-secondary">Upload</button>` +
                  `</div>` +
                  `<button type="button" id="company-icon-library" class="de-btn de-btn-secondary prof-branding-library-btn">Library</button>` +
                `</div>` +
                `<span id="company-icon-fallback-hint" class="prof-hint"${usesLogoAsIconFallback(c) ? '' : ' hidden'}>Favicons and avatars use the logo until you add an icon.</span>` +
              `</div>` +
            `</div>` +
            `<span class="prof-hint prof-hint--block">Pick a PNG, JPEG, WebP, or SVG from the Media library, or upload a file here. An SVG file fills the paste fields below.</span>`,
          ) +
          profSection(
            'Social sharing',
            'Default image for Facebook, iMessage, Slack, and X. Individual pages can override this.',
            `<div class="prof-field"><label for="company-og-file">Share image</label>` +
            `<div class="prof-logo-upload">` +
              `<div id="company-og-preview-wrap" class="prof-logo-preview-wrap prof-og-preview-wrap">` +
                `<img id="company-og-preview" class="prof-og-preview" src="${escHtml(companyOgPreviewUrl(c))}" alt="" />` +
                `<button type="button" id="company-og-remove" class="prof-logo-remove" aria-label="Remove share image"${hasUploadedCompanyOg(c) ? '' : ' hidden'}>×</button>` +
              `</div>` +
              `<div id="company-og-file-wrap" class="prof-logo-file-wrap"${hasUploadedCompanyOg(c) ? ' hidden' : ''}>` +
                `<input id="company-og-file" class="prof-logo-file-input" type="file" accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp" hidden />` +
                `<button type="button" id="company-og-upload-btn" class="de-btn de-btn-secondary">Upload</button>` +
              `</div>` +
              `<button type="button" id="company-og-library" class="de-btn de-btn-secondary prof-branding-library-btn">Library</button>` +
            `</div>` +
            `<span class="prof-hint">1200×630 PNG, JPEG, or WebP. Leave empty to generate a card from the logo or icon. A page that sets its own share image wins.</span></div>`,
          ) +
          profSection(
            'SVG Logo and Icon',
            'Paste raw <code>&lt;svg&gt;…&lt;/svg&gt;</code> markup. These render first — header uses logo SVG, homepage hero uses icon SVG.',
            `<div class="prof-branding-uploads">` +
              `<div class="prof-branding-upload-item">` +
                `<div class="prof-field"><label for="company-logoSvg">Logo SVG</label>` +
                `<div id="company-logoSvg-preview-wrap" class="prof-logo-preview-wrap"${c.logoSvg ? '' : ' hidden'}>` +
                  `<img id="company-logoSvg-preview" class="prof-logo-preview" src="${escHtml(svgPreviewDataUri(c.logoSvg))}" alt="" />` +
                `</div>` +
                `<textarea id="company-logoSvg" name="logoSvg" class="prof-svg-input" rows="8" spellcheck="false" autocapitalize="off" autocomplete="off">${escHtml(c.logoSvg || '')}</textarea>` +
                `<span class="prof-hint">Wordmark for the site header. Clear the field to fall back to the logo image above, then the display name.</span></div>` +
              `</div>` +
              `<div class="prof-branding-upload-item">` +
                `<div class="prof-field"><label for="company-iconSvg">Icon SVG</label>` +
                `<div id="company-iconSvg-preview-wrap" class="prof-logo-preview-wrap"${c.iconSvg ? '' : ' hidden'}>` +
                  `<img id="company-iconSvg-preview" class="prof-icon-preview" src="${escHtml(svgPreviewDataUri(c.iconSvg))}" alt="" />` +
                `</div>` +
                `<textarea id="company-iconSvg" name="iconSvg" class="prof-svg-input" rows="8" spellcheck="false" autocapitalize="off" autocomplete="off">${escHtml(c.iconSvg || '')}</textarea>` +
                `<span class="prof-hint">Square mark for the homepage hero. Clear the field to fall back to the icon image above, then the display name.</span></div>` +
              `</div>` +
            `</div>`,
          ) +
          profSection(
            'Typography',
            'Primary = headlines. Secondary = labels and UI accents. Content = body copy. Saved as <code>--font-primary</code>, <code>--font-secondary</code>, and <code>--font-content</code>.',
            `<div class="prof-font-heading-row">` +
              `<button type="button" id="company-font-scrape" class="de-btn de-btn-secondary cl-branding-scrape-btn">Fetch fonts from website</button>` +
            `</div>` +
            `<div class="prof-field-row prof-field-row--fonts">` +
              `<div class="prof-field"><label for="company-fontPrimary">Primary font</label>` +
              `<select id="company-fontPrimary" name="fontPrimary" aria-describedby="company-font-hint">` +
                renderBrandFontOptions(fontCatalog, 'primary', fonts.fontPrimaryId) +
              `</select></div>` +
              `<div class="prof-field"><label for="company-fontSecondary">Secondary font</label>` +
              `<select id="company-fontSecondary" name="fontSecondary" aria-describedby="company-font-hint">` +
                renderBrandFontOptions(fontCatalog, 'secondary', fonts.fontSecondaryId) +
              `</select></div>` +
              `<div class="prof-field"><label for="company-fontContent">Content font</label>` +
              `<select id="company-fontContent" name="fontContent" aria-describedby="company-font-hint">` +
                renderBrandFontOptions(fontCatalog, 'content', fonts.fontContentId) +
              `</select></div>` +
            `</div>` +
            `<div class="prof-font-preview" aria-hidden="true">` +
              `<p class="prof-font-preview-secondary">THE BUSINESS OS</p>` +
              `<p class="prof-font-preview-primary">Runs your whole business</p>` +
              `<p class="prof-font-preview-content">Contacts, billing, projects, and AI — one platform.</p>` +
            `</div>` +
            `<span id="company-font-hint" class="prof-hint prof-hint--block">Uses the homepage address below — same idea as fetching logos from the source site.</span>`,
          ) +
          profSection(
            'Email templates',
            'Default typeface for outbound HTML mail. Website webfonts are stripped by Gmail — this list is only faces that are installed on the recipient’s device.',
            `<div class="prof-field"><label for="company-emailFont">Email font</label>` +
            `<select id="company-emailFont" name="emailFont" aria-describedby="company-email-font-hint">` +
              renderEmailFontOptions(emailFontCatalog, c.emailFont) +
            `</select></div>` +
            `<div class="prof-font-preview prof-email-font-preview" aria-hidden="true">` +
              `<p class="prof-email-font-preview-text">Hi there — this is how body copy looks in Gmail, Outlook, and Apple Mail.</p>` +
            `</div>` +
            `<span id="company-email-font-note" class="prof-hint"></span>` +
            `<span id="company-email-font-hint" class="prof-hint prof-hint--block">Sans, serif, and mono are all here so each install can match its brand. Unknown ids fall back to System UI.</span>`,
          ) +
          profSection(
            'Colors',
            'Brand colors map to site-wide CSS variables — <code>--brand-pink</code>, <code>--brand-magenta</code>, gradients, and buttons on marketing pages and admin.',
            `<div class="prof-field-row prof-field-row--colors">` +
              `<div class="prof-field"><label for="company-brandPrimary">Primary color</label>` +
              `<div class="prof-color-input-row">` +
                `<input type="color" id="company-brandPrimary-swatch" value="${escHtml(c.brandPrimary || '#ffffff')}" aria-label="Primary color swatch" />` +
                `<input id="company-brandPrimary" name="brandPrimary" type="text" value="${escHtml(c.brandPrimary || '')}" placeholder="#ffffff" autocapitalize="off" autocorrect="off" spellcheck="false" />` +
              `</div></div>` +
              `<div class="prof-field"><label for="company-brandSecondary">Secondary color</label>` +
              `<div class="prof-color-input-row">` +
                `<input type="color" id="company-brandSecondary-swatch" value="${escHtml(c.brandSecondary || '#a1a1a1')}" aria-label="Secondary color swatch" />` +
                `<input id="company-brandSecondary" name="brandSecondary" type="text" value="${escHtml(c.brandSecondary || '')}" placeholder="#a1a1a1" autocapitalize="off" autocorrect="off" spellcheck="false" />` +
              `</div></div>` +
            `</div>`,
          ) +
          profSection(
            'Website &amp; contact',
            'Hostname for link previews and legal pages, plus support contacts shown on client portals.',
            `<div class="prof-field"><label for="company-domain">Homepage address</label>` +
            `<input id="company-domain" type="text" value="${escHtml(c.domain || '')}" placeholder="example.com" readonly disabled autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" />` +
            `<span class="prof-hint">Set by the <code>PUBLIC_SITE_DOMAIN</code> Railway variable.</span></div>` +
            `<div class="prof-field-row">` +
              `<div class="prof-field"><label for="company-supportEmail">Support email</label>` +
              `<input id="company-supportEmail" name="supportEmail" type="email" value="${escHtml(c.supportEmail || '')}" placeholder="${String(c.domain || '').replace(/^www\./i, '').toLowerCase() === 'reave.app' ? 'get@reave.app' : 'support@example.com'}" autocomplete="email" /></div>` +
              `<div class="prof-field"><label for="company-supportPhone">Support phone</label>` +
              `<input id="company-supportPhone" name="supportPhone" type="tel" value="${escHtml(formatPhoneInput(c.supportPhone || ''))}" placeholder="+1 (555) 000-0000" autocomplete="tel" inputmode="tel" /></div>` +
            `</div>` +
            `<div class="prof-field"><label for="company-fromEmail">Outbound email (From)</label>` +
            `<input id="company-fromEmail" name="fromEmail" type="email" value="${escHtml(c.fromEmail || '')}" placeholder="noreply@example.com" autocomplete="email" />` +
            `<span class="prof-hint">Used when <code>RESEND_FROM</code> is not set. Support email and phone appear as Call / Text / Email on client portal pages.</span></div>`,
          ) +
          profSection(
            'Client Portal',
            'Shown in an auto-open bottom sheet when someone opens a client portal link.',
            `<div class="prof-field"><label for="company-portalOutreachNotice">Outreach note</label>` +
            `<textarea id="company-portalOutreachNotice" name="portalOutreachNotice" class="prof-svg-input" rows="6" spellcheck="true">${escHtml(c.portalOutreachNotice || '')}</textarea>` +
            `<span class="prof-hint">Starts blank on new installs. Separate paragraphs with a blank line. Clear the field to disable the sheet.</span></div>`,
          ) +
        `</form>` +
      `</div>` +
    `</div>`
  );
}

const SOCIAL_PLATFORM_LABELS = {
  twitter: 'X / Twitter',
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
  facebook: 'Facebook',
  youtube: 'YouTube',
  tiktok: 'TikTok',
  bluesky: 'Bluesky',
  threads: 'Threads',
  pinterest: 'Pinterest',
  snapchat: 'Snapchat',
  discord: 'Discord',
  reddit: 'Reddit',
  github: 'GitHub',
  twitch: 'Twitch',
  telegram: 'Telegram',
  whatsapp: 'WhatsApp',
  substack: 'Substack',
  yelp: 'Yelp',
  googlebusiness: 'Google Business',
};

const SOCIAL_PLATFORM_UI = {
  twitter: { slug: 'x', color: '#1d9bf0' },
  instagram: { slug: 'instagram', color: '#e1306c' },
  linkedin: { slug: 'linkedin', color: '#0a66c2' },
  facebook: { slug: 'facebook', color: '#1877f2' },
  youtube: { slug: 'youtube', color: '#ff0000' },
  tiktok: { slug: 'tiktok', color: '#ff0050' },
  bluesky: { slug: 'bluesky', color: '#0085ff' },
  threads: { slug: 'threads', color: '#000000' },
  pinterest: { slug: 'pinterest', color: '#bd081c' },
  snapchat: { slug: 'snapchat', color: '#fffc00' },
  discord: { slug: 'discord', color: '#5865f2' },
  reddit: { slug: 'reddit', color: '#ff4500' },
  github: { slug: 'github', color: '#181717' },
  twitch: { slug: 'twitch', color: '#9146ff' },
  telegram: { slug: 'telegram', color: '#26a5e4' },
  whatsapp: { slug: 'whatsapp', color: '#25d366' },
  substack: { slug: 'substack', color: '#ff6719' },
  yelp: { slug: 'yelp', color: '#d32323' },
  googlebusiness: { slug: 'google', color: '#4285f4' },
};

let socialPlatformCatalog = [];
let socialDefaultVisible = [];

const FALLBACK_SOCIAL_LINK_CATALOG = [
  { id: 'twitter', label: 'X / Twitter', field: 'socialTwitter', prefix: 'x.com/', placeholder: 'yourcompany', iconSlug: 'x', color: '#1d9bf0' },
  { id: 'instagram', label: 'Instagram', field: 'socialInstagram', prefix: 'instagram.com/', placeholder: 'yourcompany', iconSlug: 'instagram', color: '#e1306c' },
  { id: 'linkedin', label: 'LinkedIn', field: 'socialLinkedin', prefix: 'linkedin.com/company/', placeholder: 'yourcompany', iconSlug: 'linkedin', color: '#0a66c2' },
  { id: 'facebook', label: 'Facebook', field: 'socialFacebook', prefix: 'facebook.com/', placeholder: 'yourcompany', iconSlug: 'facebook', color: '#1877f2' },
  { id: 'youtube', label: 'YouTube', field: 'socialYoutube', prefix: 'youtube.com/@', placeholder: 'yourcompany', iconSlug: 'youtube', color: '#ff0000' },
  { id: 'tiktok', label: 'TikTok', field: 'socialTiktok', prefix: 'tiktok.com/@', placeholder: 'yourcompany', iconSlug: 'tiktok', color: '#ff0050' },
  { id: 'bluesky', label: 'Bluesky', field: 'socialBluesky', prefix: 'bsky.app/profile/', suffix: '.bsky.social', placeholder: 'yourcompany', iconSlug: 'bluesky', color: '#0085ff' },
  { id: 'threads', label: 'Threads', field: 'socialThreads', prefix: 'threads.net/@', placeholder: 'yourcompany', iconSlug: 'threads', color: '#000000' },
];

const FALLBACK_SOCIAL_DEFAULT_VISIBLE = ['twitter', 'instagram', 'linkedin', 'facebook', 'youtube', 'tiktok', 'bluesky', 'threads'];

function syncSocialPlatformCatalog(catalog, defaultVisible) {
  socialPlatformCatalog = Array.isArray(catalog) ? catalog : [];
  socialDefaultVisible = Array.isArray(defaultVisible) ? defaultVisible : [];
  for (const platform of socialPlatformCatalog) {
    if (!platform?.id) continue;
    SOCIAL_PLATFORM_LABELS[platform.id] = platform.label || platform.id;
    SOCIAL_PLATFORM_UI[platform.id] = {
      slug: platform.iconSlug || platform.id,
      color: platform.color || '#64748b',
    };
  }
}

function socialHiddenPlatformIds(company) {
  return Array.isArray(company?.socialHiddenPlatforms) ? company.socialHiddenPlatforms : [];
}

function visibleSocialLinkPlatforms(company) {
  const hidden = new Set(socialHiddenPlatformIds(company));
  const visible = socialPlatformCatalog.filter((p) => !hidden.has(p.id));
  if (visible.length) return visible;
  const defaults = new Set(socialDefaultVisible);
  return socialPlatformCatalog.filter((p) => defaults.has(p.id));
}

function hiddenSocialLinkPlatforms(company) {
  const hidden = new Set(socialHiddenPlatformIds(company));
  return socialPlatformCatalog.filter((p) => hidden.has(p.id));
}

function addableSocialLinkPlatforms(company) {
  const visibleIds = new Set(visibleSocialLinkPlatforms(company).map((p) => p.id));
  return socialPlatformCatalog.filter((p) => !visibleIds.has(p.id));
}

/** Keep in sync with extractSocialHandle / composeSocialUrl in src/lib/social/platforms.ts */
function extractSocialHandle(raw, platform) {
  const original = String(raw || '').trim();
  if (!original) return '';

  const prefix = String(platform?.prefix || '').replace(/^https?:\/\//i, '');
  const suffix = platform?.suffix || '';
  const stripped = original.replace(/^https?:\/\//i, '');
  const lower = stripped.toLowerCase();
  const prefixLower = prefix.toLowerCase();

  let value = stripped;
  if (prefixLower && lower.startsWith(prefixLower)) {
    value = stripped.slice(prefix.length);
  } else if (prefixLower && lower.startsWith('www.') && lower.slice(4).startsWith(prefixLower)) {
    value = stripped.slice(4 + prefix.length);
  } else if (/^https?:\/\//i.test(original) || stripped.includes('/')) {
    try {
      const url = new URL(/^https?:\/\//i.test(original) ? original : `https://${stripped}`);
      const segments = url.pathname.split('/').filter(Boolean);
      const last = segments[segments.length - 1] || '';
      if (last) value = last;
      else if (suffix && url.hostname.toLowerCase().endsWith(suffix.toLowerCase())) {
        value = url.hostname.slice(0, -suffix.length);
      } else {
        value = url.hostname;
      }
    } catch {
      value = stripped;
    }
  }

  if (suffix && value.toLowerCase().endsWith(suffix.toLowerCase())) {
    value = value.slice(0, -suffix.length);
  }

  return value.replace(/^@/, '').replace(/^\/+|\/+$/g, '');
}

function applySocialSuffix(handle, suffix) {
  if (!suffix) return handle;
  if (handle.toLowerCase().endsWith(suffix.toLowerCase())) return handle;
  if (handle.includes('.')) return handle;
  return `${handle}${suffix}`;
}

function composeSocialUrl(handle, platform) {
  const extracted = extractSocialHandle(handle, platform);
  if (!extracted) return '';
  const full = applySocialSuffix(extracted, platform?.suffix);
  const prefix = String(platform?.prefix || '').replace(/^https?:\/\//i, '');
  return `https://${prefix}${full}`;
}

function sanitizeSocialHandleInput(raw, platform) {
  let next = extractSocialHandle(raw, platform);
  if (platform?.handleCharset) {
    next = next.replace(new RegExp(`[^${platform.handleCharset}]`, 'g'), '');
  }
  if (platform?.handleMaxLength) next = next.slice(0, platform.handleMaxLength);
  return next;
}

function composeSocialFormPayload(formOrPayload) {
  const form = formOrPayload instanceof HTMLFormElement ? formOrPayload : null;
  const next = form
    ? Object.fromEntries(new FormData(form))
    : { ...formOrPayload };
  for (const platform of socialPlatformCatalog) {
    if (!(platform.field in next)) continue;
    const handle = sanitizeSocialHandleInput(String(next[platform.field] || ''), platform);
    if (!handle) {
      next[platform.field] = '';
      continue;
    }
    const input = form?.querySelector(`[name="${platform.field}"]`);
    const previous = input instanceof HTMLInputElement ? (input.dataset.socStored || '') : '';
    const previousHandle = extractSocialHandle(previous, platform);
    next[platform.field] =
      previous && previousHandle === handle && /^https?:\/\//i.test(previous)
        ? previous
        : composeSocialUrl(handle, platform);
  }
  return next;
}

function validateSocialHandleField(el) {
  if (!(el instanceof HTMLInputElement) || !el.dataset.socPlatformId) {
    return defaultFieldValidator(el);
  }
  const platform = socialPlatformCatalog.find((p) => p.id === el.dataset.socPlatformId);
  const value = String(el.value || '').trim();
  if (!value) return true;
  if (!platform?.handleCharset) return true;
  return new RegExp(`^[${platform.handleCharset}]+$`).test(value);
}

function bindSocialHandleInputs(root) {
  root.querySelectorAll('input[data-soc-platform-id]').forEach((input) => {
    if (!(input instanceof HTMLInputElement)) return;
    const platform = socialPlatformCatalog.find((p) => p.id === input.dataset.socPlatformId);
    if (!platform) return;

    const apply = () => {
      const next = sanitizeSocialHandleInput(input.value, platform);
      if (next === input.value) return;
      const start = input.selectionStart;
      input.value = next;
      if (start != null) {
        const pos = Math.min(start, next.length);
        try { input.setSelectionRange(pos, pos); } catch { /* ignore */ }
      }
    };

    input.addEventListener('input', apply);
    input.addEventListener('blur', apply);
  });
}

function socialLinkFieldRow(platform, company) {
  const stored = company?.[platform.field] || '';
  const handle = sanitizeSocialHandleInput(stored, platform);
  const prefix = platform.prefix || '';
  const suffix = platform.suffix || '';
  const extraAttrs = [
    `data-soc-stored="${escHtml(stored)}"`,
    platform.handleCharset ? `data-soc-charset="${escHtml(platform.handleCharset)}"` : '',
    platform.handleMaxLength ? `maxlength="${Number(platform.handleMaxLength)}"` : '',
    platform.handleCharset ? `pattern="[${escHtml(platform.handleCharset)}]*"` : '',
  ].filter(Boolean).join(' ');

  return (
    `<div class="soc-field-row" data-soc-platform="${escHtml(platform.id)}">` +
      `<div class="prof-field soc-field">` +
        `<label for="social-${escHtml(platform.id)}">${escHtml(platform.label)}</label>` +
        `<div class="soc-affix">` +
          (prefix ? `<span class="soc-affix-prefix">${escHtml(prefix)}</span>` : '') +
          `<input id="social-${escHtml(platform.id)}" name="${escHtml(platform.field)}" type="text" value="${escHtml(handle)}" placeholder="${escHtml(platform.placeholder || 'yourcompany')}" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" data-soc-platform-id="${escHtml(platform.id)}" ${extraAttrs} />` +
          (suffix ? `<span class="soc-affix-suffix">${escHtml(suffix)}</span>` : '') +
        `</div>` +
      `</div>` +
      `<button type="button" class="prof-btn-secondary soc-field-remove" data-soc-hide="${escHtml(platform.id)}" aria-label="Remove ${escHtml(platform.label)}">Remove</button>` +
    `</div>`
  );
}

function socialPlatformLabel(platform) {
  return SOCIAL_PLATFORM_LABELS[platform] || platform || '';
}

function socialPlatformIcon(platform) {
  const ui = SOCIAL_PLATFORM_UI[platform];
  if (!ui) return `<span class="soc-icon soc-icon--fallback"></span>`;
  return (
    `<span class="soc-icon" style="--soc-color:${ui.color};` +
    `--soc-icon:url('${ICON_CDN(ui.slug)}')"></span>`
  );
}

function socialCopyRow(value) {
  const val = value || '';
  return (
    `<span class="soc-copy-row">` +
      `<code>${escHtml(val)}</code>` +
      `<button type="button" class="soc-copy-btn" data-soc-copy="${escHtml(val)}" aria-label="Copy">Copy</button>` +
    `</span>`
  );
}

function socialSetupDetails(conn) {
  const portalLink = conn.developerPortal
    ? `<a href="${escHtml(conn.developerPortal)}" target="_blank" rel="noopener noreferrer">developer portal ↗</a>`
    : 'developer portal';
  const envVars = (conn.envVars || []).join(', ');
  const steps = [
    `<li><span class="soc-step-body">Open the ${portalLink} and create/register an OAuth app. ${escHtml(conn.setupHint || '')}</span></li>`,
    `<li><span class="soc-step-body">Add this redirect / callback URL to the app:</span>${socialCopyRow(conn.callbackUrl)}</li>`,
    `<li><span class="soc-step-body">Set these environment variables on the server (Railway), then redeploy:</span>${socialCopyRow(envVars)}</li>`,
    `<li><span class="soc-step-body">Return here — the status flips to <strong>Not connected</strong> and a <strong>Connect</strong> button appears so you can sign in and authorize.</span></li>`,
  ];
  const summary = conn.configured ? 'Setup &amp; callback URL' : 'How to set this up ↓';
  return (
    `<details class="soc-conn-setup">` +
      `<summary>${summary}</summary>` +
      `<ol class="soc-conn-steps">${steps.join('')}</ol>` +
    `</details>`
  );
}

function socialConnectionRow(conn) {
  let statusHtml;
  let actionHtml;
  if (!conn.configured) {
    statusHtml = `<span class="soc-conn-pill soc-conn-pill--muted">Setup required</span>`;
    actionHtml = '';
  } else if (conn.connected && !conn.expired) {
    statusHtml = `<span class="soc-conn-pill soc-conn-pill--ok">Connected</span>`;
    actionHtml =
      `<button type="button" class="prof-btn-secondary soc-conn-btn" data-soc-disconnect="${escHtml(conn.platform)}">Disconnect</button>`;
  } else if (conn.connected && conn.expired) {
    statusHtml = `<span class="soc-conn-pill soc-conn-pill--warn">Expired</span>`;
    actionHtml = `<a class="prof-btn-secondary soc-conn-btn" href="${escHtml(conn.connectUrl)}">Reconnect</a>`;
  } else {
    statusHtml = `<span class="soc-conn-pill">Not connected</span>`;
    actionHtml = `<a class="prof-btn-secondary soc-conn-btn" href="${escHtml(conn.connectUrl)}">Connect</a>`;
  }
  const meta =
    conn.connected && conn.accountLabel
      ? `<span class="soc-conn-account">${escHtml(conn.accountLabel)}</span>`
      : '';
  return (
    `<div class="soc-conn-item">` +
      `<div class="soc-conn-row">` +
        `<span class="soc-conn-id">${socialPlatformIcon(conn.platform)}` +
          `<span class="soc-conn-name">${escHtml(conn.label)}${meta}</span></span>` +
        `<div class="soc-conn-actions">${statusHtml}${actionHtml}</div>` +
      `</div>` +
      socialSetupDetails(conn) +
    `</div>`
  );
}

function renderSocialConnectionsCard(connections) {
  const list = Array.isArray(connections) ? connections : [];
  const rows = list.map(socialConnectionRow).join('');
  return profSection(
    'API access',
    'Connect an account so Agentic Social Media can pull live posts and comments. Until then, saved profile links show sample activity, and Google reviews sync into the same feed. Each platform needs a one-time app setup first (expand “How to set this up”); tokens stay on the server.',
    `<div class="soc-conn-list">${rows || '<p class="dash-empty">No platforms available.</p>'}</div>`,
  );
}

function renderSocialsPanel(company, connections) {
  const c = company || {};
  const visible = visibleSocialLinkPlatforms(c);
  const hidden = hiddenSocialLinkPlatforms(c);
  const addable = addableSocialLinkPlatforms(c);
  const hiddenJson = escHtml(JSON.stringify(socialHiddenPlatformIds(c)));

  const addPlatformHtml = addable.length
    ? `<div class="soc-add-row">` +
        `<label for="social-add-platform">Add platform</label>` +
        `<select id="social-add-platform" class="soc-add-select">` +
          `<option value="">Choose a platform…</option>` +
          addable.map((p) => `<option value="${escHtml(p.id)}">${escHtml(p.label)}</option>`).join('') +
        `</select>` +
      `</div>`
    : '';

  const hiddenHtml = hidden.length
    ? `<details class="soc-hidden-wrap">` +
        `<summary>Removed platforms (${hidden.length})</summary>` +
        `<div class="soc-hidden-list">` +
          hidden
            .map(
              (p) =>
                `<div class="soc-hidden-item">` +
                  `<span>${escHtml(p.label)}</span>` +
                  `<button type="button" class="prof-btn-secondary soc-field-restore" data-soc-restore="${escHtml(p.id)}">Restore</button>` +
                `</div>`,
            )
            .join('') +
        `</div>` +
      `</details>`
    : '';

  return (
    `<div class="profile-panel-scroll">` +
      `<div class="prof-card">` +
        `<h1 class="prof-title">Socials</h1>` +
        `<p class="prof-subtitle">Public profile links and API connections for your organization.</p>` +
        `<div id="socials-alert" class="prof-alert" hidden></div>` +
        `<form id="socials-form" class="prof-form">` +
          `<input type="hidden" id="social-hidden-platforms" name="socialHiddenPlatforms" value="${hiddenJson}" />` +
          profSection(
            'Profile links',
            'Remove platforms you will never use — they stay out of the way until you restore them.',
            `<div id="social-fields-list" class="soc-fields-list">` +
              visible.map((p) => socialLinkFieldRow(p, c)).join('') +
            `</div>` +
            addPlatformHtml +
            hiddenHtml,
          ) +
        `</form>` +
        renderSocialConnectionsCard(connections) +
      `</div>` +
    `</div>`
  );
}

function renderIndustriesPanel() {
  return (
    `<div class="profile-panel-scroll">` +
      `<div class="prof-card">` +
        `<h1 class="prof-title">Industries</h1>` +
        `<p class="prof-subtitle">Deployment playbooks — what each industry install should include.</p>` +
        `<div id="industries-alert" class="prof-alert" hidden></div>` +
        `<div class="prof-form">` +
          profSection(
            'Playbooks',
            'Each industry is a deploy recipe: operator notes, work name, sample data, and modules. The deploy wizard applies this when you pick the industry. Turn Off to hide without deleting.',
            `<div id="industries-list" class="ind-list"></div>` +
            `<div class="prof-actions ind-actions">` +
              `<button type="button" id="industries-add-btn" class="prof-btn-secondary">Add industry</button>` +
            `</div>`,
          ) +
        `</div>` +
      `</div>` +
    `</div>`
  );
}

const VAPI_DEFAULT_FIRST_MESSAGE =
  'Hi! Thanks for reaching out to {{companyName}}. How can I help you today?';

const VAPI_DEFAULT_SYSTEM_PROMPT =
  `[Identity]\nYou are the voice assistant for {{companyName}}.\n\n[About]\n{{companyDescription}}\n\n[Guidelines]\n- Speak naturally and concisely.\n- You represent {{companyName}} only. Never introduce yourself as a different brand, product, or company name.\n- Website: {{companyDomain}}\n- If you do not know an answer, say so and suggest visiting {{companyDomain}} or leaving contact details.\n\n[Channel]\nYou are on the website voice widget (web call). Keep replies short enough to say aloud in one breath.`;

function renderVapiPanel(company) {
  const c = company || {};
  const syncBtn =
    isDeploymentOwnerClient
      ? `<button type="button" id="vapi-sync-btn" class="prof-btn-secondary">Sync assistant now</button>`
      : '';
  return (
    `<div class="profile-panel-scroll">` +
      `<div class="prof-card">` +
        `<h1 class="prof-title">Vapi</h1>` +
        `<p class="prof-subtitle">Voice assistant ID, greeting, and system prompt.</p>` +
        `<div id="vapi-alert" class="prof-alert" hidden></div>` +
        `<form id="vapi-form" class="prof-form">` +
          profSection(
            'Assistant',
            'Voice assistant ID. Company name and tagline come from Admin → Company. <code>VAPI_API_KEY</code> stays on the server.',
            `<div id="vapi-plugin-status" class="prof-hint prof-hint--block">Checking status…</div>` +
            `<div class="prof-field"><label for="vapi-assistant-id">Assistant ID</label>` +
            `<input id="vapi-assistant-id" name="vapiAssistantId" type="text" value="${escHtml(c.vapiAssistantId || '')}" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" autocomplete="off" /></div>` +
            (syncBtn ? `<div class="prof-actions">${syncBtn}</div>` : ''),
          ) +
          profSection(
            'Prompts',
            'Spoken greeting and system instructions. Placeholders are filled at call time.',
            `<div class="prof-field"><label for="vapi-first-message">First message</label>` +
            `<textarea id="vapi-first-message" name="vapiFirstMessage" rows="3" placeholder="${escHtml(VAPI_DEFAULT_FIRST_MESSAGE)}">${escHtml(c.vapiFirstMessage || '')}</textarea>` +
            `<span class="prof-hint">Supports <code>{{companyName}}</code> — filled at call time.</span></div>` +
            `<div class="prof-field"><label for="vapi-system-prompt">System prompt</label>` +
            `<textarea id="vapi-system-prompt" name="vapiSystemPrompt" rows="12" placeholder="${escHtml(VAPI_DEFAULT_SYSTEM_PROMPT.slice(0, 120))}…">${escHtml(c.vapiSystemPrompt || '')}</textarea>` +
            `<span class="prof-hint">Supports <code>{{companyName}}</code>, <code>{{companyDescription}}</code>, <code>{{companyDomain}}</code>. Leave blank for the default template.</span></div>`,
          ) +
        `</form>` +
      `</div>` +
    `</div>`
  );
}

/**
 * Every settings/account page (Profile, Company, Socials, Industries, Vapi —
 * everything reached from the profile menu in the top-right) fully replaces
 * root.innerHTML per tab load, so the back binding has to be re-prepended
 * after every render, including loading/error states. The chevron itself
 * lives in the logo topbar (#admin-special-back).
 */
function prependSettingsBackHeader(root) {
  root.prepend(
    createPaneHeader({
      back: { label: 'Back', onClick: () => setActiveMap('dashboard') },
      className: 'settings-subheader',
    }).root,
  );
}

async function loadProfileTab() {
  await flushSettingsAutosave();
  const root = settingsPanelRoot();
  if (!root) return;
  mountPanelSkeleton(root, 'dashboard', 'Loading profile…', {
    contentSelector: '.prof-card',
    wrapper: (sk) => `<div class="profile-panel-scroll">${sk}</div>`,
  });
  prependSettingsBackHeader(root);

  try {
    const [profileRes, companyRes] = await Promise.all([
      fetch('/api/admin/profile', { cache: 'no-store' }),
      fetch('/api/admin/company', { cache: 'no-store' }),
    ]);
    const profileData = await profileRes.json();
    const companyData = companyRes.ok ? await companyRes.json() : null;
    if (!profileRes.ok || !profileData.ok) throw new Error(profileData.error || `HTTP ${profileRes.status}`);
    root.innerHTML = renderProfileOnlyPanel(profileData.profile);
    prependSettingsBackHeader(root);
    bindProfileForm(root);
    bindProfileSignatureEditor(root, {
      initialHtml: profileData.profile?.emailSignature || '',
      companyLogoUrl: companyData?.ok ? companyLogoPreviewUrl(companyData.company) : '',
    });
  } catch (e) {
    root.innerHTML =
      `<div class="profile-panel-scroll">` +
        `<div class="prof-card"><h1 class="prof-title">Profile</h1>` +
        `<p class="dash-empty">Could not load profile: ${escHtml(e.message)}</p></div>` +
      `</div>`;
    prependSettingsBackHeader(root);
  }
}

async function loadCompanyTab() {
  await flushSettingsAutosave();
  destroyCompanyMap();
  const root = settingsPanelRoot();
  if (!root) return;
  mountPanelSkeleton(root, 'dashboard', 'Loading company…', {
    contentSelector: '.prof-card',
    wrapper: (sk) => `<div class="profile-panel-scroll">${sk}</div>`,
  });
  prependSettingsBackHeader(root);

  try {
    const companyRes = await fetch('/api/admin/company', { cache: 'no-store' });
    const companyData = await companyRes.json();
    if (!companyRes.ok || !companyData.ok) throw new Error(companyData.error || `HTTP ${companyRes.status}`);
    root.innerHTML = renderCompanyPanel(
      companyData.company,
      companyData.fontCatalog,
      companyData.emailFontCatalog,
    );
    prependSettingsBackHeader(root);
    bindCompanyForm(
      root,
      companyData.company,
      companyData.fontCatalog,
      companyData.emailFontCatalog,
    );
  } catch (e) {
    root.innerHTML =
      `<div class="profile-panel-scroll">` +
        `<div class="prof-card"><h1 class="prof-title">Company</h1>` +
        `<p class="dash-empty">Could not load company details: ${escHtml(e.message)}</p></div>` +
      `</div>`;
    prependSettingsBackHeader(root);
  }
}

function renderAppSettingsPanel(settings, sleepData) {
  const s = settings || {};
  const sleep = sleepData?.settings || {};
  const ttl = Number.isFinite(Number(s.otpTtlMinutes)) ? Number(s.otpTtlMinutes) : 5;
  const recentlyViewedDays = Number.isFinite(Number(s.recentlyViewedDays))
    ? Number(s.recentlyViewedDays)
    : 7;
  const shareOpenChatAlerts = s.shareOpenChatAlerts === true;
  const sleepEnabled = sleep.sleepModeEnabled !== false;
  const quietStart = sleep.quietStart || '23:00';
  const quietEnd = sleep.quietEnd || '07:00';
  const tz =
    sleep.timezone ||
    (typeof Intl !== 'undefined'
      ? Intl.DateTimeFormat().resolvedOptions().timeZone
      : null) ||
    'America/New_York';
  const sleepStatus = sleepData?.active
    ? `<p class="prof-hint prof-hint--block">Sleep mode is active now (${escHtml(sleepData.label || `${quietStart} – ${quietEnd}`)}).</p>`
    : sleepData?.inQuietWindow && !sleepEnabled
      ? `<p class="prof-hint prof-hint--block">Quiet hours are in progress, but sleep mode is paused until the window ends.</p>`
      : '';
  return (
    `<div class="profile-panel-scroll">` +
      `<div class="prof-card">` +
        `<h1 class="prof-title">Settings</h1>` +
        `<p class="prof-subtitle">Install-wide preferences for inbox automation and alerts.</p>` +
        `<div id="app-settings-alert" class="prof-alert" hidden></div>` +
        `<form id="app-settings-form" class="prof-form">` +
          profSection(
            'Verification codes',
            'One-time passwords and activation codes are triaged as high-priority notices, then auto-deleted after this window.',
            `<div class="prof-field">` +
              `<label for="settings-otp-ttl">Auto-delete after (minutes)</label>` +
              `<input id="settings-otp-ttl" name="otpTtlMinutes" type="number" min="0" max="1440" step="1" value="${escHtml(String(ttl))}" required />` +
              `<span class="prof-hint">Applies to newly received codes. Use 0 to keep codes until you delete them. Expired notices are removed quietly when the app wakes from sleep.</span>` +
            `</div>`,
          ) +
          profSection(
            'Recently viewed',
            `Projects a client viewed on their portal (after a short dwell) appear under Recently Viewed in ${escHtml(postTitle(2))}. Admin edits and saves do not count.`,
            `<div class="prof-field">` +
              `<label for="settings-recently-viewed-days">Show projects viewed within (days)</label>` +
              `<input id="settings-recently-viewed-days" name="recentlyViewedDays" type="number" min="1" max="365" step="1" value="${escHtml(String(recentlyViewedDays))}" required />` +
              `<span class="prof-hint">Default is 7 days. Based on client portal dwell (~4s), not staff activity.</span>` +
            `</div>`,
          ) +
          profSection(
            'Portal opens',
            'When a client first opens a tracked portal or share link, optionally open a chat alert so you can follow up while interest is warm.',
            `<div class="prof-field">` +
              `<label class="prof-check-row">` +
                `<input id="settings-share-open-chat-alerts" name="shareOpenChatAlerts" type="checkbox" value="1"${shareOpenChatAlerts ? ' checked' : ''} />` +
                `<span>Open a chat alert suggesting follow-up</span>` +
              `</label>` +
              `<span class="prof-hint">Off by default. First opens still count for Recently Viewed; this only controls the chat + push.</span>` +
            `</div>`,
          ) +
        `</form>` +
        `<form id="sleep-settings-form" class="prof-form">` +
          profSection(
            'Sleep mode',
            'During quiet hours, inbound mail still lands in Email with its real arrival time. Notifications and AI triage pause until the window ends, then run on that queue without rewriting the received time. Owner-initiated <strong>Siri Shortcuts</strong> still run (including audits and their completion push).',
            sleepStatus +
            `<div class="prof-field">` +
              `<label class="prof-check-row">` +
                `<input id="settings-sleep-enabled" name="sleepModeEnabled" type="checkbox" value="1"${sleepEnabled ? ' checked' : ''} />` +
                `<span>Enable sleep mode</span>` +
              `</label>` +
            `</div>` +
            `<div class="prof-field-row">` +
              `<div class="prof-field"><label for="settings-sleep-start">From</label>` +
              `<input id="settings-sleep-start" name="quietStart" type="time" value="${escHtml(quietStart)}" required /></div>` +
              `<div class="prof-field"><label for="settings-sleep-end">Until</label>` +
              `<input id="settings-sleep-end" name="quietEnd" type="time" value="${escHtml(quietEnd)}" required /></div>` +
            `</div>` +
            `<div class="prof-field"><label for="settings-sleep-tz">Timezone</label>` +
            `<select id="settings-sleep-tz" name="timezone">${profileTimezoneOptions(tz)}</select></div>`,
          ) +
        `</form>` +
      `</div>` +
    `</div>`
  );
}

function bindAppSettingsForm(root) {
  const alertEl = root.querySelector('#app-settings-alert');
  const appForm = root.querySelector('#app-settings-form');
  const otpBind = bindAutosaveForm(root, {
    formSelector: '#app-settings-form',
    alertEl,
    validateField(el) {
      if (el.name === 'otpTtlMinutes') {
        const n = Number(el.value);
        if (!Number.isFinite(n) || n < 0 || n > 1440) return false;
        return true;
      }
      if (el.name === 'recentlyViewedDays') {
        const n = Number(el.value);
        if (!Number.isFinite(n) || n < 1 || n > 365) return false;
        return true;
      }
      return defaultFieldValidator(el);
    },
    async save(payload) {
      const shareOpenChatAlerts =
        appForm?.querySelector('#settings-share-open-chat-alerts')?.checked === true;
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          otpTtlMinutes: Number(payload.otpTtlMinutes),
          recentlyViewedDays: Number(payload.recentlyViewedDays),
          shareOpenChatAlerts,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.ok !== false && json.settings?.recentlyViewedDays != null) {
        document.dispatchEvent(
          new CustomEvent('reave-app-settings-updated', { detail: json.settings }),
        );
      }
      return { ok: res.ok && json.ok !== false, error: json.error };
    },
  });

  const sleepForm = root.querySelector('#sleep-settings-form');
  const sleepBind = bindAutosaveForm(root, {
    formSelector: '#sleep-settings-form',
    alertEl,
    validateField(el) {
      if (el.name === 'quietStart' || el.name === 'quietEnd') {
        return /^\d{2}:\d{2}$/.test(String(el.value || '').trim());
      }
      if (el.name === 'timezone') return Boolean(String(el.value || '').trim());
      return defaultFieldValidator(el);
    },
    async save() {
      const enabled = sleepForm?.querySelector('#settings-sleep-enabled')?.checked === true;
      const res = await fetch('/api/push/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sleepModeEnabled: enabled,
          quietStart: sleepForm?.querySelector('#settings-sleep-start')?.value || '23:00',
          quietEnd: sleepForm?.querySelector('#settings-sleep-end')?.value || '07:00',
          timezone: sleepForm?.querySelector('#settings-sleep-tz')?.value?.trim() || 'America/New_York',
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.ok !== false) {
        document.dispatchEvent(new CustomEvent('reave-sleep-settings-updated', { detail: json }));
        if (enabled) document.dispatchEvent(new CustomEvent('reave-purge-expired-otps'));
      }
      return { ok: res.ok && json.ok !== false, error: json.error };
    },
  });

  settingsAutosaveFlush = async () => {
    await otpBind.flush();
    await sleepBind.flush();
  };
}

async function loadAppSettingsTab() {
  await flushSettingsAutosave();
  const root = settingsPanelRoot();
  if (!root) return;
  mountPanelSkeleton(root, 'dashboard', 'Loading settings…', {
    contentSelector: '.prof-card',
    wrapper: (sk) => `<div class="profile-panel-scroll">${sk}</div>`,
  });
  prependSettingsBackHeader(root);

  try {
    const [appRes, sleepRes] = await Promise.all([
      fetch('/api/admin/settings', { cache: 'no-store' }),
      fetch('/api/push/settings', { cache: 'no-store' }),
    ]);
    const appData = await appRes.json();
    if (!appRes.ok || !appData.ok) throw new Error(appData.error || `HTTP ${appRes.status}`);
    let sleepData = null;
    try {
      const sleepJson = await sleepRes.json();
      if (sleepRes.ok && sleepJson.ok) sleepData = sleepJson;
    } catch {
      /* sleep settings are best-effort so OTP prefs still load */
    }
    root.innerHTML = renderAppSettingsPanel(appData.settings, sleepData);
    prependSettingsBackHeader(root);
    bindAppSettingsForm(root);
  } catch (e) {
    root.innerHTML =
      `<div class="profile-panel-scroll">` +
        `<div class="prof-card"><h1 class="prof-title">Settings</h1>` +
        `<p class="dash-empty">Could not load settings: ${escHtml(e.message)}</p></div>` +
      `</div>`;
    prependSettingsBackHeader(root);
  }
}

async function loadSocialsTab() {
  await flushSettingsAutosave();
  const root = settingsPanelRoot();
  if (!root) return;
  mountPanelSkeleton(root, 'dashboard', 'Loading socials…', {
    contentSelector: '.prof-card',
    wrapper: (sk) => `<div class="profile-panel-scroll">${sk}</div>`,
  });
  prependSettingsBackHeader(root);

  try {
    const [companyRes, connRes, catalogRes] = await Promise.all([
      fetch('/api/admin/company', { cache: 'no-store' }),
      fetch('/api/admin/social/connections', { cache: 'no-store' }),
      fetch('/api/admin/social/platforms', { cache: 'no-store' }),
    ]);
    const companyData = await companyRes.json();
    if (!companyRes.ok || !companyData.ok) throw new Error(companyData.error || `HTTP ${companyRes.status}`);

    try {
      const catalogData = await catalogRes.json();
      if (catalogRes.ok && catalogData.ok) {
        syncSocialPlatformCatalog(catalogData.platforms, catalogData.defaultVisible);
      }
    } catch {
      /* catalog is best-effort */
    }
    if (!socialPlatformCatalog.length) {
      syncSocialPlatformCatalog(FALLBACK_SOCIAL_LINK_CATALOG, FALLBACK_SOCIAL_DEFAULT_VISIBLE);
    }

    let connections = [];
    try {
      const connData = await connRes.json();
      if (connRes.ok && connData.ok) connections = connData.connections || [];
    } catch {
      /* connection status is best-effort */
    }

    root.innerHTML = renderSocialsPanel(companyData.company, connections);
    prependSettingsBackHeader(root);
    bindSocialsForm(root);
  } catch (e) {
    root.innerHTML =
      `<div class="profile-panel-scroll">` +
        `<div class="prof-card"><h1 class="prof-title">Socials</h1>` +
        `<p class="dash-empty">Could not load social links: ${escHtml(e.message)}</p></div>` +
      `</div>`;
    prependSettingsBackHeader(root);
  }
}

async function loadIndustriesTab() {
  if (!showIndustries()) {
    setActiveMap('dashboard', { force: true });
    return;
  }
  await flushSettingsAutosave();
  const root = settingsPanelRoot();
  if (!root) return;
  mountPanelSkeleton(root, 'dashboard', 'Loading industries…', {
    contentSelector: '.prof-card',
    wrapper: (sk) => `<div class="profile-panel-scroll">${sk}</div>`,
  });
  prependSettingsBackHeader(root);

  try {
    const industriesRes = await fetch('/api/admin/deck-industries', { cache: 'no-store' });
    const industriesData = await industriesRes.json().catch(() => ({}));
    if (!industriesRes.ok || !industriesData.ok) {
      throw new Error(industriesData.error || `HTTP ${industriesRes.status}`);
    }
    root.innerHTML = renderIndustriesPanel();
    prependSettingsBackHeader(root);
    bindIndustriesEditor(root, industriesData.industries, {
      modules: industriesData.modules || [],
      extras: industriesData.extras || [],
      baselineModuleIds: industriesData.baselineModuleIds || [],
    });
  } catch (e) {
    root.innerHTML =
      `<div class="profile-panel-scroll">` +
        `<div class="prof-card"><h1 class="prof-title">Industries</h1>` +
        `<p class="dash-empty">Could not load industries: ${escHtml(e.message)}</p></div>` +
      `</div>`;
    prependSettingsBackHeader(root);
  }
}

function bindVapiForm(root) {
  bindAutosaveForm(root, {
    formSelector: '#vapi-form',
    alertEl: root.querySelector('#vapi-alert'),
    async save(payload) {
      const res = await fetch('/api/admin/company', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (res.ok) void refreshVapiPluginStatus();
      return { ok: res.ok, error: json.error };
    },
  });

  const syncBtn = root.querySelector('#vapi-sync-btn');
  const alertEl = root.querySelector('#vapi-alert');

  if (syncBtn && !syncBtn.dataset.bound) {
    syncBtn.dataset.bound = '1';
    syncBtn.addEventListener('click', async () => {
      syncBtn.disabled = true;
      const statusEl = root.querySelector('#vapi-plugin-status');
      if (statusEl) statusEl.textContent = 'Syncing…';
      try {
        const res = await adminFetch('/api/admin/vapi', { method: 'POST' });
        const json = await res.json();
        if (!res.ok || !json.ok) throw new Error(json.error || `HTTP ${res.status}`);
        showProfileAlert(alertEl, `Synced for ${json.companyName}.`, 'success');
      } catch (e) {
        showProfileAlert(alertEl, e.message || 'Sync failed.', 'error');
      } finally {
        syncBtn.disabled = false;
        void refreshVapiPluginStatus();
      }
    });
  }

  void refreshVapiPluginStatus();
}

async function loadVapiTab() {
  await flushSettingsAutosave();
  const root = settingsPanelRoot();
  if (!root) return;
  mountPanelSkeleton(root, 'dashboard', 'Loading Vapi…', {
    contentSelector: '.prof-card',
    wrapper: (sk) => `<div class="profile-panel-scroll">${sk}</div>`,
  });
  prependSettingsBackHeader(root);

  try {
    const companyRes = await fetch('/api/admin/company', { cache: 'no-store' });
    const companyData = await companyRes.json();
    if (!companyRes.ok || !companyData.ok) throw new Error(companyData.error || `HTTP ${companyRes.status}`);
    root.innerHTML = renderVapiPanel(companyData.company);
    prependSettingsBackHeader(root);
    bindVapiForm(root);
  } catch (e) {
    root.innerHTML =
      `<div class="profile-panel-scroll">` +
        `<div class="prof-card"><h1 class="prof-title">Vapi</h1>` +
        `<p class="dash-empty">Could not load Vapi settings: ${escHtml(e.message)}</p></div>` +
      `</div>`;
    prependSettingsBackHeader(root);
  }
}

async function refreshVapiPluginStatus() {
  const statusEl = document.getElementById('vapi-plugin-status');
  const btn = document.getElementById('vapi-sync-btn');
  if (!statusEl) return;
  try {
    const res = await adminFetch('/api/admin/vapi', { cache: 'no-store' });
    const json = await res.json();
    if (!res.ok || !json.ok) throw new Error(json.error || `HTTP ${res.status}`);
    const parts = [
      json.pluginEnabled ? 'Vapi module enabled' : 'Add "vapi" to features in install config',
      json.configured ? 'Ready to sync' : 'Not configured — set assistant ID and VAPI_API_KEY',
      json.companyName ? `Company: ${json.companyName}` : '',
      json.assistantId ? `Assistant: ${json.assistantId}` : '',
    ].filter(Boolean);
    statusEl.textContent = parts.join(' · ');
    if (btn) btn.disabled = !json.configured || !json.pluginEnabled;
  } catch (e) {
    statusEl.textContent = `Status unavailable: ${e.message}`;
    if (btn) btn.disabled = true;
  }
}

function footerNavActiveKey() {
  if (activeKey === 'dashboard') return 'dashboard';
  if (activeKey === 'chats' || activeKey === 'knowledge') return 'chat';
  if (activeKey === 'email') return 'inbox';
  if (activeKey === 'schedule') return 'schedule';
  if (activeKey === 'work') return 'work';
  if (activeKey === 'todo') return 'todo';
  if (activeKey === 'clients') return 'clients';
  return null;
}


let footerSaveHandler = null;
let footerSaveNav = null;

function footerSaveNavForEditor() {
  if (activeKey === 'knowledge' && knowledgeState.activeSlug) return 'chat';
  if (activeKey === 'clients' && clientState.activeUid === '__new__') return 'clients';
  if (
    (activeKey === 'work' && workState.activeSlug) ||
    (activeKey === 'documents' && docState.activeSlug === '__new__') ||
    (activeKey === 'rules' && ruleState.activeId)
  ) {
    return 'work';
  }
  return null;
}

function setEditorFooterSave(submitFn) {
  // While a create drawer is up the footer is behind the scrim, so its save
  // action belongs to the drawer's own button instead.
  if (isCreateDrawerOpen()) {
    setCreateDrawerSubmit(submitFn);
    return;
  }
  footerSaveNav = footerSaveNavForEditor();
  footerSaveHandler = footerSaveNav && submitFn ? submitFn : null;
  if (!footerSaveHandler) footerSaveNav = null;
  syncFooterNav();
}

function clearEditorFooterSave() {
  if (isCreateDrawerOpen()) return;
  footerSaveHandler = null;
  footerSaveNav = null;
  syncFooterNav();
}

/** Drop a stale save handler when the active tab no longer owns it. */
function syncEditorFooterSaveState() {
  if (typeof footerSaveHandler !== 'function') return;
  const owner = footerSaveNavForEditor();
  if (owner && owner === footerSaveNav) return;
  footerSaveHandler = null;
  footerSaveNav = null;
}

function footerNavShowsSave(nav) {
  if (footerNavCollapsed) return false;
  return footerSaveNavForEditor() === nav && typeof footerSaveHandler === 'function';
}

function footerNavShowsCreate(nav) {
  if (footerNavCollapsed || nav === 'dashboard') return false;
  return footerNavActiveKey() === nav;
}

function applyFooterNavBtnMode(btn, iconEl, opts) {
  const { create, save, icon, label, title, saveLabel = 'Save' } = opts;
  btn.classList.toggle('footer-nav-btn--create', !!create);
  btn.classList.toggle('footer-nav-btn--save', !!save);
  btn.querySelector('.footer-nav-save-label')?.remove();
  if (save) {
    iconEl.innerHTML = navIcon('check-square', 20);
    const saveText = document.createElement('span');
    saveText.className = 'footer-nav-save-label';
    saveText.textContent = saveLabel;
    btn.appendChild(saveText);
    btn.setAttribute('aria-label', saveLabel);
    btn.title = saveLabel;
    return;
  }
  if (create) {
    iconEl.innerHTML = navIcon('plus', 20);
    btn.setAttribute('aria-label', title);
    btn.title = title;
    return;
  }
  iconEl.innerHTML = navIcon(icon, 20);
  btn.setAttribute('aria-label', label);
  btn.title = label;
}

function syncFooterChatNav() {
  const btn = document.getElementById('footer-nav-chat');
  if (!btn) return;
  const create = footerNavShowsCreate('chat');
  let iconEl = btn.querySelector('.footer-nav-chat-icon');
  if (!iconEl) {
    iconEl = document.createElement('span');
    iconEl.className = 'footer-nav-chat-icon';
    iconEl.setAttribute('aria-hidden', 'true');
    btn.insertBefore(iconEl, btn.firstChild);
  }
  btn.querySelector(':scope > svg')?.remove();
  applyFooterNavBtnMode(btn, iconEl, {
    create,
    icon: 'agent',
    label: 'Sessions',
    title: DEFAULT_SESSION_TITLE,
  });
}

function syncFooterWorkNav() {
  const btn = document.getElementById('footer-nav-work');
  if (!btn) return;
  const save = footerNavShowsSave('work');
  const create = !save && footerNavShowsCreate('work');
  let iconEl = btn.querySelector('.footer-nav-work-icon');
  if (!iconEl) {
    iconEl = document.createElement('span');
    iconEl.className = 'footer-nav-work-icon';
    iconEl.setAttribute('aria-hidden', 'true');
    btn.insertBefore(iconEl, btn.firstChild);
  }
  btn.querySelector(':scope > svg')?.remove();
  applyFooterNavBtnMode(btn, iconEl, {
    create,
    save,
    icon: 'briefcase',
    label: postTitle(2),
    title: postNew(),
    saveLabel: postSave(),
  });
}

function syncFooterTodoNav() {
  const btn = document.getElementById('footer-nav-todo');
  if (!btn) return;
  const create = footerNavShowsCreate('todo');
  let iconEl = btn.querySelector('.footer-nav-todo-icon');
  if (!iconEl) {
    iconEl = document.createElement('span');
    iconEl.className = 'footer-nav-todo-icon';
    iconEl.setAttribute('aria-hidden', 'true');
    btn.insertBefore(iconEl, btn.firstChild);
  }
  btn.querySelector(':scope > svg')?.remove();
  applyFooterNavBtnMode(btn, iconEl, {
    create,
    icon: 'check-square',
    label: 'To‑dos',
    title: 'New to‑do',
  });
}

function syncFooterInboxNav() {
  const btn = document.getElementById('footer-nav-inbox');
  if (!btn) return;
  const create = footerNavShowsCreate('inbox');
  let iconEl = btn.querySelector('.footer-nav-inbox-icon');
  if (!iconEl) {
    iconEl = document.createElement('span');
    iconEl.className = 'footer-nav-inbox-icon';
    iconEl.setAttribute('aria-hidden', 'true');
    btn.insertBefore(iconEl, btn.firstChild);
  }
  btn.querySelector(':scope > svg')?.remove();
  applyFooterNavBtnMode(btn, iconEl, {
    create,
    icon: 'mail',
    label: 'Inbox',
    title: 'Compose email',
  });
}

function syncFooterScheduleNav() {
  const btn = document.getElementById('footer-nav-schedule');
  if (!btn) return;
  const create = footerNavShowsCreate('schedule');
  let iconEl = btn.querySelector('.footer-nav-schedule-icon');
  if (!iconEl) {
    iconEl = document.createElement('span');
    iconEl.className = 'footer-nav-schedule-icon';
    iconEl.setAttribute('aria-hidden', 'true');
    btn.insertBefore(iconEl, btn.firstChild);
  }
  btn.querySelector(':scope > svg')?.remove();
  applyFooterNavBtnMode(btn, iconEl, {
    create,
    icon: 'calendar',
    label: 'Schedule',
    title: 'New event',
  });
}

function syncFooterClientsNav() {
  const btn = document.getElementById('footer-nav-clients');
  if (!btn) return;
  const save = footerNavShowsSave('clients');
  const create = !save && footerNavShowsCreate('clients');
  let iconEl = btn.querySelector('.footer-nav-clients-icon');
  if (!iconEl) {
    iconEl = document.createElement('span');
    iconEl.className = 'footer-nav-clients-icon';
    iconEl.setAttribute('aria-hidden', 'true');
    btn.insertBefore(iconEl, btn.firstChild);
  }
  btn.querySelector(':scope > svg')?.remove();
  applyFooterNavBtnMode(btn, iconEl, {
    create,
    save,
    icon: 'users',
    label: 'Contacts',
    title: 'New contact',
    saveLabel: 'Save contact',
  });
}

function footerNavCreateModeActive(nav) {
  return footerNavShowsCreate(nav);
}

async function triggerFooterSave() {
  if (typeof footerSaveHandler !== 'function') return;
  const btn =
    footerSaveNav === 'chat'
      ? document.getElementById('footer-nav-chat')
      : footerSaveNav === 'clients'
        ? document.getElementById('footer-nav-clients')
        : document.getElementById('footer-nav-work');
  if (btn) btn.disabled = true;
  try {
    await footerSaveHandler();
  } finally {
    if (btn) btn.disabled = false;
  }
}

const FOOTER_PANEL_SELECTOR =
  '#dashboard-panel, #settings-panel, #chat-panel, #email-panel, #doc-editor, #knowledge-editor, #work-editor, #clients-editor, #rule-editor, #todo-editor, #media-panel, #modules-panel, #search-overlay';
/** Primary scroll roots per panel — nested overflow regions must not collapse the footer. */
const FOOTER_PANEL_SCROLL_ROOT_SELECTOR =
  '.home-dashboard-scroll, .profile-panel-scroll, .schedule-panel-scroll, .modules-panel-scroll, .ml-panel-scroll, .ch-list, .ch-messages, .de-list, .em-detail, .search-overlay-results, .re-form-scroll, .de-sc-dir-body';
const footerPanelScrollTops = new WeakMap();
const FOOTER_SCROLL_DELTA = 4;

function collapseFooterNav() {
  if (!isMobileTabs()) return;
  if (footerNavCollapsed) return;
  footerNavCollapsed = true;
  document.getElementById('admin-footer-nav')?.classList.add('footer-nav-collapsed');
  const homeBtn = document.getElementById('footer-nav-dashboard');
  homeBtn?.setAttribute('title', 'Show navigation');
  syncFooterChatNav();
  syncFooterInboxNav();
  syncFooterScheduleNav();
  syncFooterWorkNav();
  syncFooterTodoNav();
  syncFooterClientsNav();
  syncFooterChatInlineDashboard();
  syncFooterNavCountTooltips();
  renderFooterNavBadges();
  scheduleFooterNavIndicatorSync();
}

function expandFooterNav() {
  if (!footerNavCollapsed) return;
  footerNavCollapsed = false;
  document.getElementById('admin-footer-nav')?.classList.remove('footer-nav-collapsed');
  const homeBtn = document.getElementById('footer-nav-dashboard');
  homeBtn?.setAttribute('title', 'Dashboard');
  syncFooterChatNav();
  syncFooterInboxNav();
  syncFooterScheduleNav();
  syncFooterWorkNav();
  syncFooterTodoNav();
  syncFooterClientsNav();
  syncFooterChatInlineDashboard();
  syncFooterNavCountTooltips();
  renderFooterNavBadges();
  scheduleFooterNavIndicatorSync();
}

function onPanelScrollCollapse(ev) {
  if (!isMobileTabs()) return;
  const target = ev.target;
  if (!(target instanceof Element)) return;
  if (target.closest('#wrap, #admin-footer-nav')) return;
  // Agent chat scrolls inside .aui-viewport; the panel shell does not scroll.
  if (target.closest('.aui-viewport')) return;
  const panel = target.closest(FOOTER_PANEL_SELECTOR);
  if (!panel) return;
  const style = window.getComputedStyle(panel);
  if (style.display === 'none' || style.visibility === 'hidden') return;
  // Only the panel shell or its primary scroll root should drive footer collapse.
  if (target !== panel && !target.matches(FOOTER_PANEL_SCROLL_ROOT_SELECTOR)) return;

  const scrollTop = target.scrollTop;
  const prevTop = footerPanelScrollTops.get(target);
  footerPanelScrollTops.set(target, scrollTop);

  if (scrollTop <= 6) {
    expandFooterNav();
    return;
  }

  if (prevTop == null) return;

  const delta = scrollTop - prevTop;
  if (delta > FOOTER_SCROLL_DELTA) collapseFooterNav();
  else if (delta < -FOOTER_SCROLL_DELTA) expandFooterNav();
}

function initFooterNavScrollCollapse() {
  document.addEventListener('scroll', onPanelScrollCollapse, { capture: true, passive: true });
}

const FOOTER_NAV_DRAG_ORDER = ['dashboard', 'chat', 'inbox', 'schedule', 'work', 'todo', 'clients'];
const FOOTER_NAV_DRAG_THRESHOLD = 8;

function footerNavIndicatorHidden() {
  const indicator = document.getElementById('footer-nav-indicator');
  if (!indicator || indicator.hidden) return true;
  const activeNav = footerNavActiveKey();
  return activeNav != null && activeNav !== 'dashboard' && footerNavCreateModeActive(activeNav);
}

function getVisibleFooterNavButtons() {
  const pill = document.querySelector('.admin-footer-nav-pill');
  if (!pill) return [];
  return FOOTER_NAV_DRAG_ORDER.map((nav) => {
    const btn = pill.querySelector(`.footer-nav-btn[data-nav="${nav}"]`);
    if (!btn) return null;
    const style = window.getComputedStyle(btn);
    if (style.display === 'none' || style.visibility === 'hidden') return null;
    if (parseFloat(style.opacity) < 0.05) return null;
    if (btn.offsetWidth <= 0) return null;
    return { nav, btn };
  }).filter(Boolean);
}

function footerNavSnapTargets() {
  const pill = document.querySelector('.admin-footer-nav-pill');
  if (!pill) return [];
  const pillRect = pill.getBoundingClientRect();
  return getVisibleFooterNavButtons().map(({ nav, btn }) => {
    const rect = btn.getBoundingClientRect();
    const x = rect.left - pillRect.left;
    return { nav, btn, x, width: rect.width, center: x + rect.width / 2 };
  });
}

function parseFooterIndicatorX(indicator) {
  const transform = indicator.style.transform || '';
  const match = transform.match(/translateX\(([-\d.]+)px\)/);
  if (match) return parseFloat(match[1]);
  const matrix = window.getComputedStyle(indicator).transform;
  if (matrix && matrix !== 'none') {
    const values = matrix.match(/matrix\(([^)]+)\)/);
    if (values) {
      const parts = values[1].split(',').map((part) => parseFloat(part.trim()));
      if (parts.length === 6) return parts[4];
    }
  }
  return 0;
}

function setFooterIndicatorPosition(x, width, { animate = true } = {}) {
  const indicator = document.getElementById('footer-nav-indicator');
  if (!indicator) return;
  indicator.classList.toggle('footer-nav-indicator--dragging', !animate);
  indicator.style.transition = animate ? '' : 'none';
  indicator.style.width = `${width}px`;
  indicator.style.transform = `translateX(${x}px)`;
}

function nearestFooterNavTarget(clientX) {
  const pill = document.querySelector('.admin-footer-nav-pill');
  if (!pill) return null;
  const targets = footerNavSnapTargets();
  if (!targets.length) return null;
  const x = clientX - pill.getBoundingClientRect().left;
  let best = targets[0];
  let bestDist = Math.abs(x - best.center);
  for (const target of targets.slice(1)) {
    const dist = Math.abs(x - target.center);
    if (dist < bestDist) {
      best = target;
      bestDist = dist;
    }
  }
  return best;
}

function activateFooterChatNav() {
  closeSearchOverlay();
  if (footerNavShowsSave('chat')) {
    void triggerFooterSave();
    return;
  }
  if (activeKey === 'chats') {
    void startNewChat();
    return;
  }
  setActiveMap('chats', { force: activeKey === 'chats' });
}

function activateFooterNavFromDrag(nav) {
  closeSearchOverlay();
  if (nav === 'dashboard') {
    if (footerNavCollapsed) {
      expandFooterNav();
      return;
    }
    if (activeKey === 'dashboard') pollActiveViewQuiet();
    else setActiveMap('dashboard');
    return;
  }
  if (nav === 'chat') {
    activateFooterChatNav();
    return;
  }
  if (nav === 'inbox') {
    if (activeKey === 'email') {
      startNewEmail();
      return;
    }
    setActiveMap('email', { force: activeKey === 'email' });
    return;
  }
  if (nav === 'schedule') {
    if (activeKey === 'schedule') {
      scheduleEnsureFocusDate();
      scheduleOpenCreateDialog();
      return;
    }
    setActiveMap('schedule', { force: activeKey === 'schedule' });
    return;
  }
  if (nav === 'work') {
    if (footerNavShowsSave('work')) {
      void triggerFooterSave();
      return;
    }
    if (activeKey === 'work') {
      startNewProject();
      return;
    }
    setActiveMap('work', { force: activeKey === 'work' });
    return;
  }
  if (nav === 'todo') {
    if (activeKey === 'todo') {
      startNewTodo();
      return;
    }
    setActiveMap('todo', { force: activeKey === 'todo' });
    return;
  }
  if (nav === 'clients') {
    if (footerNavShowsSave('clients')) {
      void triggerFooterSave();
      return;
    }
    if (activeKey === 'clients') {
      startNewClient();
      return;
    }
    setActiveMap('clients', { force: activeKey === 'clients' });
  }
}

function initFooterNavIndicatorDrag() {
  const pill = document.querySelector('.admin-footer-nav-pill');
  if (!pill || pill.dataset.indicatorDragBound) return;
  pill.dataset.indicatorDragBound = '1';

  let pointerId = null;
  let dragStartX = 0;
  let dragStartIndicatorX = 0;
  let dragWidth = 0;
  let dragActive = false;

  const finishDrag = (ev) => {
    if (pointerId == null || ev.pointerId !== pointerId) return;
    const moved = dragActive;
    const clientX = ev.clientX;
    pill.releasePointerCapture?.(pointerId);
    pointerId = null;
    dragActive = false;
    footerIndicatorDragging = false;
    pill.classList.remove('footer-nav-pill--dragging');

    const indicator = document.getElementById('footer-nav-indicator');
    if (indicator) {
      indicator.classList.remove('footer-nav-indicator--dragging');
      indicator.style.transition = '';
    }

    const target = nearestFooterNavTarget(clientX);
    if (target) {
      setFooterIndicatorPosition(target.x, target.width, { animate: true });
      if (moved) {
        footerIndicatorSuppressClick = true;
        const currentNav = footerNavActiveKey();
        if (target.nav !== currentNav) activateFooterNavFromDrag(target.nav);
      }
    } else {
      scheduleFooterNavIndicatorSync();
    }
  };

  pill.addEventListener('pointerdown', (ev) => {
    if (footerNavIndicatorHidden()) return;
    if (getVisibleFooterNavButtons().length < 2) return;
    if (!(ev.target instanceof Element)) return;
    if (ev.target.closest('.footer-nav-badge')) return;

    pointerId = ev.pointerId;
    dragActive = false;
    footerIndicatorDragging = false;
    footerIndicatorSuppressClick = false;
    dragStartX = ev.clientX;

    const indicator = document.getElementById('footer-nav-indicator');
    if (!indicator) return;
    dragStartIndicatorX = parseFooterIndicatorX(indicator);
    dragWidth = indicator.offsetWidth || parseFloat(indicator.style.width) || 0;
  });

  pill.addEventListener('pointermove', (ev) => {
    if (pointerId == null || ev.pointerId !== pointerId) return;
    const dx = ev.clientX - dragStartX;
    if (!dragActive) {
      if (Math.abs(dx) < FOOTER_NAV_DRAG_THRESHOLD) return;
      dragActive = true;
      footerIndicatorDragging = true;
      pill.classList.add('footer-nav-pill--dragging');
      pill.setPointerCapture(ev.pointerId);
    }

    const pillRect = pill.getBoundingClientRect();
    const maxX = Math.max(0, pillRect.width - dragWidth);
    const nextX = Math.min(maxX, Math.max(0, dragStartIndicatorX + dx));
    setFooterIndicatorPosition(nextX, dragWidth, { animate: false });
    ev.preventDefault();
  });

  pill.addEventListener('pointerup', finishDrag);
  pill.addEventListener('pointercancel', finishDrag);

  pill.addEventListener('click', (ev) => {
    if (!footerIndicatorSuppressClick) return;
    ev.preventDefault();
    ev.stopImmediatePropagation();
    footerIndicatorSuppressClick = false;
  }, true);
}

function syncFooterNavIndicator() {
  if (footerIndicatorDragging) return;
  const indicator = document.getElementById('footer-nav-indicator');
  const pill = document.querySelector('.admin-footer-nav-pill');
  if (!indicator || !pill) return;

  const activeNav = footerNavActiveKey();
  const hideForCreate = activeNav != null && activeNav !== 'dashboard' && footerNavCreateModeActive(activeNav);

  let targetBtn = activeNav
    ? document.querySelector(`.footer-nav-btn[data-nav="${activeNav}"]`)
    : null;
  if (footerNavCollapsed) {
    targetBtn = document.getElementById('footer-nav-dashboard');
  }

  if (!targetBtn || hideForCreate) {
    indicator.hidden = true;
    indicator.classList.remove('is-visible');
    return;
  }

  indicator.hidden = false;
  const pillRect = pill.getBoundingClientRect();
  const btnRect = targetBtn.getBoundingClientRect();
  indicator.style.width = `${btnRect.width}px`;
  indicator.style.transform = `translateX(${btnRect.left - pillRect.left}px)`;
  indicator.classList.add('is-visible');
}

function scheduleFooterNavIndicatorSync() {
  syncFooterNavIndicator();
  requestAnimationFrame(syncFooterNavIndicator);
  window.setTimeout(syncFooterNavIndicator, 340);
}

function syncFooterChatInlineDashboard() {
  const use =
    isMobileTabs() &&
    footerNavCollapsed &&
    activeKey === 'chats' &&
    Boolean(chatState.activeId) &&
    !document.body.classList.contains('chat-compose-focused');
  document.body.classList.toggle('footer-chat-inline-dashboard', use);
}

function syncChatComposeViewport() {
  if (!document.body.classList.contains('chat-compose-focused')) {
    document.documentElement.style.removeProperty('--chat-compose-bottom');
    return;
  }
  const vv = window.visualViewport;
  if (!vv) {
    document.documentElement.style.setProperty('--chat-compose-bottom', '0px');
    return;
  }
  const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
  document.documentElement.style.setProperty('--chat-compose-bottom', `${inset}px`);
}

function chatComposerInputEl() {
  return document.querySelector('#chat-panel .aui-input');
}

function isChatComposerFocusTarget(el) {
  return (
    el instanceof HTMLElement &&
    Boolean(
      el.closest(
        '.aui-compose, .aui-compose-footer, .aui-composer-shell, .aui-composer-card, .aui-helper-panel, .ch-compose',
      ),
    )
  );
}

/** True only while the real message textarea still owns focus — not Stop / deploy lock. */
function isChatComposerTextFocused() {
  const active = document.activeElement;
  return active instanceof HTMLElement && active.classList.contains('aui-input') && Boolean(active.closest('#chat-panel'));
}

function syncChatComposeFormNav(focused) {
  const header = getChatPanel()?.querySelector('.ch-pane-header');
  if (header instanceof HTMLElement) {
    // inert must track a live focused textarea. While the agent is running the
    // composer swaps to Stop (no .aui-input) — leaving inert stuck made share /
    // archive / rename look like a dead z-index overlay.
    header.inert = Boolean(focused);
  }
  const searchInput = document.getElementById('search-overlay-input');
  if (searchInput instanceof HTMLInputElement && !searchOverlayOpen) {
    searchInput.disabled = Boolean(focused);
  }
}

function setChatComposeFocused(focused) {
  if (!isMobileTabs() || activeKey !== 'chats' || !chatState.activeId) {
    focused = false;
  }
  // Refuse to arm the lock unless the textarea is actually focused (guards against
  // stale true after send → agent-running UI unmounts the input).
  if (focused && !isChatComposerTextFocused()) {
    focused = false;
  }
  document.body.classList.toggle('chat-compose-focused', focused);
  syncChatComposeFormNav(focused);
  if (focused) syncChatComposeViewport();
  else document.documentElement.style.removeProperty('--chat-compose-bottom');
  syncFooterChatInlineDashboard();
}

function initChatComposeFocusLayout() {
  if (document.documentElement.dataset.chatComposeFocusBound === '1') return;
  document.documentElement.dataset.chatComposeFocusBound = '1';

  document.addEventListener(
    'focusin',
    (ev) => {
      if (!isMobileTabs() || activeKey !== 'chats' || !chatState.activeId) return;
      const t = ev.target;
      if (!(t instanceof HTMLElement) || !t.classList.contains('aui-input')) return;
      setChatComposeFocused(true);
    },
    true,
  );

  document.addEventListener(
    'focusout',
    (ev) => {
      if (!isMobileTabs()) return;
      const related = ev.relatedTarget;
      // Stay armed only when focus moves to another composer *text* affordance
      // (slash helpers). Stop / running chrome must not keep the header inert.
      if (related instanceof HTMLElement && related.classList.contains('aui-input')) {
        return;
      }
      if (related instanceof HTMLElement && related.closest('.aui-helper-panel')) {
        return;
      }
      requestAnimationFrame(() => {
        if (isChatComposerTextFocused()) return;
        setChatComposeFocused(false);
      });
    },
    true,
  );

  window.visualViewport?.addEventListener('resize', syncChatComposeViewport);
  window.visualViewport?.addEventListener('scroll', syncChatComposeViewport);
  MOBILE_TABS_MQ.addEventListener('change', () => setChatComposeFocused(false));

  document.addEventListener(
    'pointerdown',
    (ev) => {
      if (!document.body.classList.contains('chat-compose-focused')) return;
      const t = ev.target;
      if (isChatComposerFocusTarget(t)) {
        // Stop / running chrome still lives under .aui-composer-shell, but the
        // textarea is gone — release inert so header actions work again.
        if (!chatComposerInputEl()) setChatComposeFocused(false);
        return;
      }
      // Outside the composer: blur the textarea when it exists; otherwise the
      // agent-running UI left no input to blur and the header stayed inert.
      const input = chatComposerInputEl();
      if (input instanceof HTMLElement) input.blur();
      setChatComposeFocused(false);
    },
    true,
  );
}

function syncFooterNav() {
  syncEditorFooterSaveState();
  syncFooterChatInlineDashboard();
  const activeNav = footerNavActiveKey();
  document.querySelectorAll('.footer-nav-btn[data-nav]').forEach((btn) => {
    btn.classList.toggle('active', activeNav != null && btn.dataset.nav === activeNav);
  });
  syncFooterChatNav();
  syncFooterInboxNav();
  syncFooterScheduleNav();
  syncFooterWorkNav();
  syncFooterTodoNav();
  syncFooterClientsNav();
  syncFooterNavCountTooltips();
  renderFooterNavBadges();
  scheduleFooterNavIndicatorSync();
}

function syncProfileMenuActive() {
  const activeSection = isSettingsMapType(MAP?.type) ? MAP.type : null;
  for (const key of window.__installConfig?.profileMenu || []) {
    const el = document.getElementById(`topbar-${key}-link`);
    if (el) el.classList.toggle('is-active', activeSection === key);
  }
}

function initFooterNav() {
  document.getElementById('footer-nav-dashboard')?.addEventListener('click', () => {
    closeSearchOverlay();
    if (footerNavCollapsed) {
      expandFooterNav();
      return;
    }
    if (activeKey === 'dashboard') pollActiveViewQuiet();
    else setActiveMap('dashboard');
  });
  document.getElementById('footer-nav-chat')?.addEventListener('click', () => {
    activateFooterChatNav();
  });
  document.getElementById('footer-nav-inbox')?.addEventListener('click', () => {
    closeSearchOverlay();
    if (activeKey === 'email') {
      startNewEmail();
      return;
    }
    setActiveMap('email', { force: activeKey === 'email' });
  });
  document.getElementById('footer-nav-schedule')?.addEventListener('click', () => {
    closeSearchOverlay();
    if (activeKey === 'schedule') {
      scheduleEnsureFocusDate();
      scheduleOpenCreateDialog();
      return;
    }
    setActiveMap('schedule', { force: activeKey === 'schedule' });
  });
  document.getElementById('footer-nav-work')?.addEventListener('click', () => {
    closeSearchOverlay();
    if (footerNavShowsSave('work')) {
      void triggerFooterSave();
      return;
    }
    if (activeKey === 'work') {
      startNewProject();
      return;
    }
    setActiveMap('work', { force: activeKey === 'work' });
  });
  document.getElementById('footer-nav-todo')?.addEventListener('click', () => {
    closeSearchOverlay();
    if (activeKey === 'todo') {
      startNewTodo();
      return;
    }
    setActiveMap('todo', { force: activeKey === 'todo' });
  });
  document.getElementById('footer-nav-clients')?.addEventListener('click', () => {
    closeSearchOverlay();
    if (footerNavShowsSave('clients')) {
      void triggerFooterSave();
      return;
    }
    if (activeKey === 'clients') {
      startNewClient();
      return;
    }
    setActiveMap('clients', { force: activeKey === 'clients' });
  });
  window.addEventListener('resize', () => {
    if (!isMobileTabs() && footerNavCollapsed) expandFooterNav();
    syncFooterNavIndicator();
  }, { passive: true });
  initFooterNavIndicatorDrag();
  if (!isMobileTabs() && footerNavCollapsed) expandFooterNav();
}

function openSearchOverlay() {
  const overlay = document.getElementById('search-overlay');
  const input = document.getElementById('search-overlay-input');
  if (!overlay) return;
  searchOverlayOpen = true;
  expandFooterNav();
  overlay.classList.add('open');
  overlay.setAttribute('aria-hidden', 'false');
  if (input instanceof HTMLInputElement) input.disabled = false;
  renderSearchResults('');
  syncSearchOverlayClearBtn();
  syncFooterNav();
  requestAnimationFrame(() => input?.focus());
}

function syncSearchOverlayClearBtn() {
  const input = document.getElementById('search-overlay-input');
  const clearBtn = document.getElementById('search-overlay-clear');
  syncSearchFieldAdornment(input, clearBtn);
}

function closeSearchOverlay() {
  const overlay = document.getElementById('search-overlay');
  if (!overlay || !searchOverlayOpen) return;
  searchOverlayOpen = false;
  overlay.classList.remove('open');
  overlay.setAttribute('aria-hidden', 'true');
  const input = document.getElementById('search-overlay-input');
  if (input instanceof HTMLInputElement) {
    input.value = '';
    input.disabled = true;
  }
  syncSearchOverlayClearBtn();
  syncFooterNav();
}

function toggleSearchOverlay() {
  if (searchOverlayOpen) closeSearchOverlay();
  else openSearchOverlay();
}

function buildSearchResultItem(opts) {
  const { label, sub, icon, onClick, href, external } = opts;
  const el = href ? document.createElement('a') : document.createElement('button');
  el.className = 'search-result-item';
  if (href) {
    el.href = href;
    if (external) {
      el.target = '_blank';
      el.rel = 'noopener noreferrer';
    }
  } else {
    el.type = 'button';
    el.addEventListener('click', () => {
      closeSearchOverlay();
      onClick?.();
    });
  }
  el.innerHTML =
    `<span class="search-result-icon">${navIcon(icon || 'search')}</span>` +
    `<span class="search-result-body">` +
      `<div class="search-result-title">${escHtml(label)}</div>` +
      (sub ? `<div class="search-result-sub">${escHtml(sub)}</div>` : '') +
    `</span>`;
  if (href && !external) {
    el.addEventListener('click', () => closeSearchOverlay());
  }
  return el;
}

async function renderSearchResults(query) {
  const root = document.getElementById('search-overlay-results');
  if (!root) return;
  root.innerHTML = '';

  const q = query.trim().toLowerCase();
  const sections = dashboardSectionItems().filter((item) => {
    if (!q) return true;
    return item.label.toLowerCase().includes(q);
  });

  for (const item of sections) {
    if (item.kind === 'href' || item.kind === 'link') {
      root.appendChild(buildSearchResultItem({
        label: item.label,
        sub: item.href?.replace(/^https?:\/\//, '') || '',
        icon: item.icon,
        href: item.href,
        external: item.href?.startsWith('http'),
      }));
      continue;
    }
    root.appendChild(buildSearchResultItem({
      label: item.label,
      sub: 'Open section',
      icon: item.icon,
      onClick: () => setActiveMap(item.key, { force: item.key === activeKey && isPanelMapKey(item.key) }),
    }));
  }

  if (q.length >= 2) {
    try {
      const params = new URLSearchParams({ q: query.trim(), limit: '8' });
      const res = await fetch(`/api/clients?${params}`, { cache: 'no-store' });
      const data = await res.json();
      const clients = Array.isArray(data.clients) ? data.clients : [];
      for (const client of clients) {
        const name = client.displayName || client.name || client.uid || 'Contact';
        root.appendChild(buildSearchResultItem({
          label: name,
          sub: client.email || client.uid || '',
          icon: 'users',
          onClick: () => setActiveMap('clients', { force: true }),
        }));
      }
    } catch {
      // Ignore client search failures in the overlay.
    }
  }

  if (!root.children.length) {
    const empty = document.createElement('div');
    empty.className = 'search-result-empty';
    empty.textContent = q ? 'No Matches.' : 'Search Sections And Contacts…';
    root.appendChild(empty);
  }
}

function initSearchOverlay() {
  const input = document.getElementById('search-overlay-input');
  const clearBtn = document.getElementById('search-overlay-clear');
  if (input instanceof HTMLInputElement) input.disabled = !searchOverlayOpen;
  const field = input?.closest('.control-field');
  if (input instanceof HTMLInputElement && field instanceof HTMLElement) {
    attachSlashSearchHint(
      field,
      input,
      input.dataset.searchPlaceholderRaw || 'Search Sections And Contacts…',
    );
  }

  input?.addEventListener('input', () => {
    syncSearchOverlayClearBtn();
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => renderSearchResults(input.value), 180);
  });

  const resultsRoot = document.getElementById('search-overlay-results');
  if (input instanceof HTMLInputElement && resultsRoot && !input.dataset.keyNavBound) {
    input.dataset.keyNavBound = '1';
    attachAutosuggestKeyboardNav(input, resultsRoot, {
      optionSelector: '.search-result-item',
      onClose: () => closeSearchOverlay(),
    });
  }

  clearBtn?.addEventListener('click', () => {
    if (!(input instanceof HTMLInputElement) || !(clearBtn instanceof HTMLButtonElement)) return;
    if (clearBtn.dataset.mode === 'clear') {
      input.value = '';
      syncSearchFieldAdornment(input, clearBtn);
      renderSearchResults('');
      input.focus();
    } else {
      input.focus();
    }
  });

  syncSearchOverlayClearBtn();

  if (!document.documentElement.dataset.searchOverlayBound) {
    document.documentElement.dataset.searchOverlayBound = '1';
    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' && searchOverlayOpen) closeSearchOverlay();
    });
  }
}

function isEditableKeyboardTarget(el) {
  if (!(el instanceof Element)) return false;
  if (el.closest('#search-overlay-input')) return true;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

function keyboardShortcutBlocked() {
  if (document.getElementById('os-dialog-backdrop')?.classList.contains('open')) return true;
  if (document.querySelector('.ios-sheet-backdrop.open')) return true;
  if (document.querySelector('.ch-context-menu')) return true;
  return false;
}

function deleteKeyboardShortcutAvailable() {
  if (activeKey === 'chats' || activeKey === 'knowledge') {
    return !!chatState.activeId;
  }
  if (activeKey === 'email') {
    if (emailState.composing || emailState.inboxFilter === 'sent' || emailState.inboxFilter === 'draft') return false;
    return !!emailState.activeId;
  }
  return false;
}

async function handleDeleteKeyboardShortcut() {
  if (activeKey === 'chats' || activeKey === 'knowledge') {
    const id = chatState.activeId;
    if (id) await deleteChat(id);
    return;
  }
  if (activeKey === 'email') {
    const ev = emailState.allEvents.find((e) => e.id === emailState.activeId);
    if (ev) await deleteEmail(ev);
  }
}

function initKeyboardShortcuts() {
  if (document.documentElement.dataset.keyboardShortcutsBound) return;
  document.documentElement.dataset.keyboardShortcutsBound = '1';
  document.addEventListener('keydown', (ev) => {
    if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === 'k') {
      ev.preventDefault();
      toggleSearchOverlay();
      return;
    }

    if (ev.key === '/' && !ev.metaKey && !ev.ctrlKey && !ev.altKey) {
      if (keyboardShortcutBlocked()) return;
      if (searchOverlayOpen) return;
      if (isEditableKeyboardTarget(ev.target)) return;
      ev.preventDefault();
      if (!focusVisibleListSearch()) openSearchOverlay();
      return;
    }

    if (ev.key !== 'Delete') return;
    if (keyboardShortcutBlocked()) return;
    if (searchOverlayOpen) return;
    if (isEditableKeyboardTarget(ev.target)) return;
    if (!deleteKeyboardShortcutAvailable()) return;

    ev.preventDefault();
    void handleDeleteKeyboardShortcut();
  });
}

let reviewsPendingCount = 0;

const footerNavCounts = {
  reviews: null,
  chats: null,
  emails: null,
  meetings: null,
  projects: null,
  todos: null,
  clients: null,
};

function footerNavCountLabel(n, singular, plural) {
  const num = Math.max(0, Number(n) || 0);
  return `${num} ${num === 1 ? singular : plural}`;
}

function footerNavShowsCountTooltip(btn) {
  return (
    btn &&
    !btn.classList.contains('footer-nav-btn--create') &&
    !btn.classList.contains('footer-nav-btn--save')
  );
}

function syncFooterNavCountTooltips() {
  const defs = [
    { id: 'footer-nav-dashboard', key: 'reviews', singular: 'review', plural: 'reviews' },
    { id: 'footer-nav-chat', key: 'chats', singular: 'session', plural: 'sessions' },
    { id: 'footer-nav-inbox', key: 'emails', singular: 'email', plural: 'emails' },
    { id: 'footer-nav-schedule', key: 'meetings', singular: 'meeting', plural: 'meetings' },
    { id: 'footer-nav-work', key: 'projects', singular: postAlias().singular, plural: postAlias().plural },
    { id: 'footer-nav-todo', key: 'todos', singular: 'to-do', plural: 'to-dos' },
    { id: 'footer-nav-clients', key: 'clients', singular: 'contact', plural: 'contacts' },
  ];

  for (const { id, key, singular, plural } of defs) {
    const btn = document.getElementById(id);
    if (!btn) continue;
    if (!footerNavShowsCountTooltip(btn)) {
      btn.removeAttribute('data-footer-count');
      continue;
    }
    // Dashboard tip is the nav name (badge already shows pending reviews).
    if (id === 'footer-nav-dashboard') {
      btn.setAttribute('data-footer-count', footerNavCollapsed ? 'Show navigation' : 'Dashboard');
      continue;
    }
    const raw = footerNavCounts[key];
    if (raw == null) {
      btn.removeAttribute('data-footer-count');
      continue;
    }
    btn.setAttribute('data-footer-count', footerNavCountLabel(raw, singular, plural));
  }
}

function syncReviewBadge(count) {
  reviewsPendingCount = Math.max(0, Number(count) || 0);
  footerNavCounts.reviews = reviewsPendingCount;
  renderFooterNavBadges();
  syncFooterNavCountTooltips();
  void setAppIconBadge(reviewsPendingCount);
}

function renderFooterNavBadges() {
  const badge = document.getElementById('footer-dashboard-badge');
  const btn = document.getElementById('footer-nav-dashboard');
  if (!badge || !btn) return;

  const n = reviewsPendingCount;
  if (n > 0) {
    badge.hidden = false;
    badge.textContent = n > 99 ? '99+' : String(n);
    const hint = `${n} review${n === 1 ? '' : 's'} pending`;
    btn.setAttribute(
      'aria-label',
      footerNavCollapsed ? `Show navigation (${hint})` : `Dashboard (${hint})`,
    );
  } else {
    badge.hidden = true;
    badge.textContent = '0';
    btn.setAttribute('aria-label', footerNavCollapsed ? 'Show navigation' : 'Dashboard');
  }
}

function syncDashboardFooterBadges(stats) {
  if (!stats || typeof stats !== 'object') return;
  syncReviewBadge(stats.reviewsPending ?? stats.automationPending ?? 0);
  footerNavCounts.chats = stats.chats ?? 0;
  footerNavCounts.emails = stats.emailsTotal ?? stats.emails ?? 0;
  footerNavCounts.meetings = stats.meetingsTotal ?? null;
  footerNavCounts.projects = stats.projectsTotal ?? stats.projectsPending ?? 0;
  footerNavCounts.todos = stats.todosOpen ?? 0;
  footerNavCounts.clients = stats.clients ?? null;
  syncFooterNavCountTooltips();
}

function syncDashboardFooterBadgesWithoutReview(stats) {
  if (!stats || typeof stats !== 'object') return;
  footerNavCounts.reviews = reviewsPendingCount;
  footerNavCounts.chats = stats.chats ?? 0;
  footerNavCounts.emails = stats.emailsTotal ?? stats.emails ?? 0;
  footerNavCounts.meetings = stats.meetingsTotal ?? null;
  footerNavCounts.projects = stats.projectsTotal ?? stats.projectsPending ?? 0;
  footerNavCounts.todos = stats.todosOpen ?? 0;
  footerNavCounts.clients = stats.clients ?? null;
  syncFooterNavCountTooltips();
}

function initTopbarMenus() {
  if (!document.documentElement.dataset.topbarMenuBound) {
    document.documentElement.dataset.topbarMenuBound = '1';
    document.addEventListener('click', () => {
      const deployDot = document.getElementById('topbar-deploy-dot');
      if (deployDot?.classList.contains('tooltip-open')) {
        deployDot.classList.remove('tooltip-open');
        window.ProximityTooltip?.sync?.();
      }
    });
    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') {
        closeTopbarMenus();
        const deployDot = document.getElementById('topbar-deploy-dot');
        if (deployDot?.classList.contains('tooltip-open')) {
          deployDot.classList.remove('tooltip-open');
          window.ProximityTooltip?.hide?.();
        }
      }
    });
  }

  const profileToggle = document.getElementById('topbar-profile-toggle');
  const profileMenu = document.getElementById('topbar-profile-menu');
  if (profileToggle && profileMenu && !profileToggle.dataset.bound) {
    profileToggle.dataset.bound = '1';
    profileToggle.addEventListener('click', (ev) => {
      ev.stopPropagation();
      toggleTopbarMenu();
    });
  }

  const accountMenu = document.getElementById('topbar-profile-menu');
  if (accountMenu && !accountMenu.dataset.footerNavBound) {
    accountMenu.dataset.footerNavBound = '1';
    accountMenu.addEventListener('overlay-menu:close', () => syncFooterNav());
  }

  for (const key of window.__installConfig?.profileMenu || []) {
    const el = document.getElementById(`topbar-${key}-link`);
    if (el && !el.dataset.bound) {
      el.dataset.bound = '1';
      el.addEventListener('click', (ev) => {
        ev.preventDefault();
        closeTopbarMenus();
        setActiveMap(key, { force: activeKey === key });
      });
    }
  }

  const signOutBtn = document.getElementById('topbar-sign-out');
  if (signOutBtn && !signOutBtn.dataset.bound) {
    signOutBtn.dataset.bound = '1';
    signOutBtn.addEventListener('click', async (ev) => {
      ev.preventDefault();
      closeTopbarMenus();
      const clerk = window.Clerk;
      if (clerk) {
        await clerk.signOut();
        window.location.href = '/';
      } else {
        window.location.href = '/sign-out';
      }
    });
  }

  const logoLink = document.querySelector('.app-header-logo');
  if (logoLink && !logoLink.dataset.bound) {
    logoLink.dataset.bound = '1';
    logoLink.addEventListener('click', onAdminHomeClick);
  }
  const specialBack = document.getElementById('admin-special-back');
  if (specialBack && !specialBack.dataset.bound) {
    specialBack.dataset.bound = '1';
    specialBack.addEventListener('click', onAdminHomeClick);
  }
}

function onAdminHomeClick(ev) {
  if (ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
  ev.preventDefault();
  closeTopbarMenus();
  closeSearchOverlay();
  const href = ev.currentTarget instanceof HTMLAnchorElement ? ev.currentTarget.getAttribute('href') : '';
  if (href && href !== '/admin/' && href !== '/admin/?tab=dashboard' && !href.startsWith('/admin/?tab=dashboard')) {
    window.location.href = href;
    return;
  }
  if (activeKey === 'dashboard') pollActiveViewQuiet();
  else setActiveMap('dashboard');
}

function syncSpecialPageChrome() {
  const on = isSpecialAdminPage(activeKey);
  document.documentElement.classList.toggle('admin-special-page', on);
  document.body.classList.toggle('admin-special-page', on);
}

async function refreshDeployDot() {
  return window.DeployIndicator?.refresh?.();
}

function startDeployPoll() {
  window.DeployIndicator?.startPoll?.();
}

function stopDeployPoll() {
  window.DeployIndicator?.stopPoll?.();
}

function initDeployIndicator() {
  window.DeployIndicator?.init?.();
}

document.addEventListener('click', () => closeTabDropdowns());

// ---- legend ----
function buildLegend() {
  const legend = document.getElementById('legend');
  legend.innerHTML = '';
  for (const g of MAP.groups) {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.innerHTML = `<span class="dot" style="background:hsl(${g.hue} 75% 58%)"></span>${g.title}`;
    legend.appendChild(chip);
  }

  // Status key (only meaningful on the live System map).
  if (activeKey === 'system') {
    const states = [
      ['up', 'Online'],
      ['down', 'Down'],
      ['configured', 'Configured'],
      ['unconfigured', 'Not set'],
      ['unknown', 'Unknown'],
    ];
    for (const [s, label] of states) {
      const chip = document.createElement('span');
      chip.className = `chip st-key st-${s}`;
      chip.innerHTML = `<span class="dot st-dot"></span>${label}`;
      legend.appendChild(chip);
    }
  }
}

// ---- rules tab (list + editor, like Knowledge/Work) ----

// ───────────────────────── Newsletter / email automation ─────────────────────────








// ---- email tab (inbox summaries) ----
let emailState = {
  allEvents: [],
  sentEvents: [],
  draftEvents: [],
  inboxFilter: 'all',
  search: '',
  activeId: null,
  composing: false,
  replyToId: null,
  replyMode: null,
  replySourceFull: null,
  activeDraftId: null,
  compose: { to: [], cc: [], subject: '', body: '' },
  sending: false,
  storage: 'files',
  digest: null,
  pushConfigured: false,
  inboxRefreshing: false,
  /** Inline Email Lab Mode on the open message. */
  labMode: false,
  labEmailId: null,
  labPhrases: /** @type {{ text: string, field: 'from' | 'subject' | 'body' }[]} */ ([]),
  labCreating: false,
  labDetail: /** @type {HTMLElement | null} */ (null),
};
let pendingEmailDeepLinkId = null;
let emailPollTimer = null;
let inboxBadgeTimer = null;

const BADGE_CACHE = 'reave-badge-v1';
const BADGE_URL = '/badge-count';

function navigateToEmail(id) {
  if (!id) return;
  pendingEmailDeepLinkId = id;
  setActiveMap('email', { force: true, emailId: id });
}

function createProjectLinkChip(label, onClick) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'project-link-chip';
  btn.textContent = label;
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
  });
  return btn;
}

function resolveEmailProjectClientIcon(ev) {
  const uid = ev?.contactUid?.trim?.();
  if (!uid) return '';
  const client = clientState.clients?.find((c) => c.uid === uid);
  if (!client) return '';
  return (client.iconUrl || client.logoUrl || '').trim();
}

function emailProjectIconHtml(ev, size = 14) {
  const iconUrl = resolveEmailProjectClientIcon(ev);
  if (iconUrl) {
    return (
      `<img class="em-project-context-icon-img" src="${escHtml(iconUrl)}" alt="" loading="lazy" decoding="async" />`
    );
  }
  return navIcon('briefcase', size);
}

function emailProjectContextHtml(ev) {
  const title = ev?.jobTitle || ev?.jobSlug;
  if (!title) return '';
  return (
    `<button type="button" class="project-link-chip em-project-context em-project-link" title="${escHtml(title)}">` +
    `<span class="em-project-context-icon" aria-hidden="true">${emailProjectIconHtml(ev)}</span>` +
    `<span class="em-project-context-title">${escHtml(title)}</span>` +
    `</button>`
  );
}

async function hydrateEmailProjectContextIcon(detail, ev) {
  if (!ev?.contactUid?.trim?.() || resolveEmailProjectClientIcon(ev)) return;
  try {
    const res = await fetch(`/api/clients/${encodeURIComponent(ev.contactUid)}`, { cache: 'no-store' });
    const data = await res.json();
    if (!res.ok || !data.ok) return;
    const url = (data.iconUrl || data.logoUrl || '').trim();
    if (!url) return;
    const iconWrap = detail.querySelector('.em-project-context-icon');
    if (!iconWrap || iconWrap.querySelector('.em-project-context-icon-img')) return;
    iconWrap.innerHTML =
      `<img class="em-project-context-icon-img" src="${escHtml(url)}" alt="" loading="lazy" decoding="async" />`;
  } catch {}
}


function getEmailPanel() { return document.getElementById('email-panel'); }

function parseEmailDeepLinkFromUrl() {
  try {
    return new URLSearchParams(window.location.search).get('email')?.trim() || null;
  } catch {
    return null;
  }
}

function parseWorkDeepLinkFromUrl() {
  try {
    return new URLSearchParams(window.location.search).get('slug')?.trim() || null;
  } catch {
    return null;
  }
}

function parseScheduleDeepLinkFromUrl() {
  try {
    return new URLSearchParams(window.location.search).get('booking')?.trim() || null;
  } catch {
    return null;
  }
}

function isAutoDeletedEmail(ev) {
  return String(ev?.category || '').toLowerCase() === 'auto_deleted';
}

function isHiddenInboxEmail(ev) {
  const c = String(ev?.category || '').toLowerCase();
  return c === 'junk' || c === 'auto_deleted';
}

function applyEmailInboxFilterForEvent(ev) {
  if (!ev) return;
  if (isAutoDeletedEmail(ev)) emailState.inboxFilter = 'auto_deleted';
  else if (ev.category === 'junk') emailState.inboxFilter = 'junk';
  else if (ev.category === 'receipt') emailState.inboxFilter = 'receipt';
  else if (ev.category === 'alert') emailState.inboxFilter = 'alert';
  else if (isEmailBookable(ev)) emailState.inboxFilter = 'book';
  else if (isEmailProject(ev)) emailState.inboxFilter = 'project';
  else if (isEmailRouted(ev)) emailState.inboxFilter = 'routed';
  else if (ev.category === 'review' || ev.category === 'otp' || ev.category === 'auth_link') emailState.inboxFilter = 'review';
  else emailState.inboxFilter = 'all';
}

async function openEmailFromDeepLink(id) {
  if (!id) return false;
  const knownDraft = (emailState.draftEvents || []).some((d) => d.id === id);
  if (knownDraft) return openDraftEvent(id, { fromDeepLink: true });
  let ev = emailState.allEvents.find((e) => e.id === id);
  if (!ev) {
    const openedDraft = await openDraftEvent(id, { fromDeepLink: true });
    if (openedDraft) return true;
    try {
      const res = await fetch(`/api/email/inbox/${encodeURIComponent(id)}`, { cache: 'no-store' });
      const data = await readApiJson(res);
      if (data.event) {
        ev = { ...data.event, _fullLoaded: true };
        const idx = emailState.allEvents.findIndex((e) => e.id === id);
        if (idx !== -1) emailState.allEvents[idx] = ev;
        else emailState.allEvents.unshift(ev);
      }
    } catch (e) {
      console.warn('[email] deep link fetch failed', e);
    }
  }
  if (!ev) {
    pendingEmailDeepLinkId = id;
    return false;
  }
  // Deep links (dashboard notifications, push, URL) must show the target in the
  // sidebar — clear any leftover search so the list isn't filtered away from it.
  emailState.search = '';
  applyEmailInboxFilterForEvent(ev);
  openEmailEvent(id);
  return true;
}

function syncAdminDeepLinkUrl(url) {
  try {
    const u = new URL(url, window.location.origin);
    if (u.origin !== window.location.origin) return;
    history.replaceState({}, '', u.pathname + u.search + u.hash);
  } catch {}
}

/** Keep the address bar aligned with the active admin tab — clears stale deep-link params. */
function syncAdminTabUrl(key, opts = {}) {
  if (!MAPS[key]) return;
  try {
    const url = new URL(window.location.href);
    url.searchParams.set('tab', key);

    if (key === 'email') {
      const emailId =
        opts.emailId !== undefined
          ? opts.emailId
          : emailState.activeDraftId ||
            emailState.activeId ||
            pendingEmailDeepLinkId ||
            null;
      if (emailId) url.searchParams.set('email', emailId);
      else url.searchParams.delete('email');
    } else {
      url.searchParams.delete('email');
    }

    if (key === 'clients') {
      const clientUid = opts.clientUid || parseClientDeepLinkFromUrl() || clientState.activeUid || null;
      if (clientUid && clientUid !== '__new__') {
        url.searchParams.set('client', clientUid);
        const view = (opts.clientView || clientState.detailTab || '').trim();
        if (view && view !== 'profile') url.searchParams.set('view', view);
        else url.searchParams.delete('view');
      } else {
        url.searchParams.delete('client');
        url.searchParams.delete('view');
      }
    } else {
      url.searchParams.delete('client');
      url.searchParams.delete('view');
    }

    if (key === 'work') {
      const workSlug = opts.workSlug || workState.activeSlug || parseWorkDeepLinkFromUrl() || null;
      if (workSlug) url.searchParams.set('slug', workSlug);
      else url.searchParams.delete('slug');
      if (workState.returnToChatId) {
        url.searchParams.set('fromChat', workState.returnToChatId);
        if (workState.returnToFocusChat) url.searchParams.set('fromFocus', '1');
        else url.searchParams.delete('fromFocus');
      } else {
        url.searchParams.delete('fromChat');
        url.searchParams.delete('fromFocus');
      }
    } else {
      url.searchParams.delete('slug');
      url.searchParams.delete('fromChat');
      url.searchParams.delete('fromFocus');
    }

    if (key === 'chats') {
      const chatId = opts.chatId || parseChatDeepLinkFromUrl() || chatState.activeId || null;
      if (chatId) url.searchParams.set('chat', chatId);
      else url.searchParams.delete('chat');
    } else {
      url.searchParams.delete('chat');
    }

    if (key === 'schedule') {
      const bookingUid =
        opts.scheduleUid || scheduleState.activeUid || parseScheduleDeepLinkFromUrl() || null;
      if (bookingUid) url.searchParams.set('booking', bookingUid);
      else url.searchParams.delete('booking');
    } else {
      url.searchParams.delete('booking');
    }

    if (key === 'modules') {
      const moduleFeature = opts.moduleFeature || parseModuleDeepLinkFromUrl();
      if (moduleFeature) url.searchParams.set('module', moduleFeature);
      else url.searchParams.delete('module');
    } else {
      url.searchParams.delete('module');
    }

    url.searchParams.delete('copy');
    if (/^#c=/i.test(url.hash)) url.hash = '';

    const next = url.pathname + url.search + url.hash;
    const current = location.pathname + location.search + location.hash;
    if (next !== current) history.replaceState({}, '', next);
  } catch {}
}

/** Mobile inbox is list-only until em-pane-active — ensure detail opens after deep links. */
function ensureEmailMobilePaneOpen() {
  if (!isMobileTabs() || (!emailState.activeId && !emailState.composing)) return;
  getEmailPanel()?.classList.add('em-pane-active');
}

function resumeClientDeepLinkFromUrl() {
  const clientUid = parseClientDeepLinkFromUrl();
  if (!clientUid) return;
  if (MAP?.type !== 'clients') {
    navigateToClient(clientUid);
    return;
  }
  void resumeClientDetailFromUrl();
}

function resumeScheduleDeepLinkFromUrl() {
  const bookingUid = parseScheduleDeepLinkFromUrl();
  if (!bookingUid) return;
  openScheduleTab({ uid: bookingUid, view: 'week' });
}

function resumeEmailDeepLinkFromUrl() {
  const emailId = parseEmailDeepLinkFromUrl();
  if (!emailId) return;
  if (MAP?.type !== 'email') {
    pendingEmailDeepLinkId = emailId;
    setActiveMap('email', { force: true, emailId });
    return;
  }
  if (emailState.composing && (emailState.activeDraftId === emailId || emailState.activeId === emailId)) {
    ensureEmailMobilePaneOpen();
    syncAdminTabUrl('email', { emailId });
    return;
  }
  if (emailState.activeId === emailId && !emailState.composing) {
    ensureEmailMobilePaneOpen();
    syncAdminTabUrl('email', { emailId });
    return;
  }
  if (emailState.composing) {
    void leaveEmailCompose().then(() => openEmailFromDeepLink(emailId));
    return;
  }
  if (emailState.allEvents.length || (emailState.draftEvents || []).length) {
    void openEmailFromDeepLink(emailId);
  } else {
    pendingEmailDeepLinkId = emailId;
  }
}

function handleNotificationOpen(url) {
  if (!url) return;
  try {
    const u = new URL(url, window.location.origin);
    if (
      u.pathname.replace(/\/$/, '') === '/admin/copy' ||
      u.searchParams.get('copy') === '1' ||
      otpCodeFromHash(u.hash)
    ) {
      const code = otpCodeFromHash(u.hash);
      if (code) void handleOtpCopyFromPush({ code });
      else void consumePendingOtpCopy();
      return;
    }
    const tab = resolveMapKey(u.searchParams.get('tab'));
    const emailId = u.searchParams.get('email')?.trim();
    if (tab === 'email' && emailId) {
      pendingEmailDeepLinkId = emailId;
      setActiveMap('email', { force: true, emailId });
      return;
    }
    const workSlug = u.searchParams.get('slug')?.trim();
    if (tab === 'work' && workSlug) {
      const fromChat =
        u.searchParams.get('fromChat')?.trim() ||
        (MAP?.type === 'chats' ? chatState.activeId : null);
      const fromFocus = u.searchParams.get('fromFocus') === '1';
      if (fromChat) {
        navigateToWork(workSlug, { fromChatId: fromChat, fromFocus });
        return;
      }
      queueWorkDeepLink(workSlug);
      setActiveMap('work', { force: true, workSlug });
      return;
    }
    const chatId = u.searchParams.get('chat')?.trim();
    if (tab === 'chats' && chatId) {
      queueChatDeepLink(chatId);
      setActiveMap('chats', { force: true, chatId, keepChatSession: true });
      return;
    }
    const clientUid = u.searchParams.get('client')?.trim();
    if (tab === 'clients' && clientUid) {
      navigateToClient(clientUid);
      return;
    }
    const bookingUid = u.searchParams.get('booking')?.trim();
    if ((tab === 'schedule' || !tab) && bookingUid) {
      openScheduleTab({ uid: bookingUid, view: 'week' });
      return;
    }
    const moduleFeature = u.searchParams.get('module')?.trim();
    if ((tab === 'modules' || !tab) && moduleFeature) {
      setActiveMap('modules', { force: true, moduleFeature });
      return;
    }
    if (tab && MAPS[tab]) setActiveMap(tab, { force: true });
  } catch {}
}

function isEmailProject(ev) {
  const category = String(ev.category || '').toLowerCase();
  if (category === 'project') return true;
  // Legacy rows linked before the Projects category existed.
  return Boolean(ev.jobSlug) && String(ev.action || '').toLowerCase() === 'matched';
}

function isEmailRouted(ev) {
  if (isEmailProject(ev)) return false;
  const action = String(ev.action || '').toLowerCase();
  return action === 'filed' || action === 'matched';
}

function isEmailBookable(ev) {
  return isEmailSchedulingRequest(ev);
}

function isEmailSchedulingRequest(ev) {
  if (String(ev.category || '').toLowerCase() === 'junk') return false;
  if (ev.proposedMeetingStart || ev.schedulingNote) return true;
  const blob = [ev.summary, ev.subject, ev.bodySnippet, ev.routeNote].join(' ').toLowerCase();
  const mentionsMeeting = /\b(meeting|meet\b|schedule|get together|calendar|appointment)\b/.test(blob);
  const mentionsTime =
    /\b(\d{1,2}(:\d{2})?\s*(am|pm|a\.m|p\.m)|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(
      blob,
    );
  return mentionsMeeting && mentionsTime;
}

function isEmailBooked(ev) {
  return Boolean(ev.bookingUid);
}

function inboxTabCounts() {
  const all = emailState.allEvents;
  const active = (e) =>
    !isHiddenInboxEmail(e) && e.category !== 'receipt' && !isEmailProject(e) && !isEmailRouted(e);
  return {
    all: all.filter(active).length,
    alert: all.filter((e) => e.category === 'alert' && !isEmailRouted(e)).length,
    review: all.filter(
      (e) =>
        (e.category === 'review' || e.category === 'otp' || e.category === 'auth_link') &&
        !isEmailRouted(e),
    ).length,
    book: all.filter((e) => isEmailBookable(e) && !isEmailRouted(e)).length,
    project: all.filter(isEmailProject).length,
    routed: all.filter(isEmailRouted).length,
    receipt: all.filter((e) => e.category === 'receipt' && !isEmailRouted(e)).length,
    junk: all.filter((e) => e.category === 'junk').length,
    auto_deleted: all.filter(isAutoDeletedEmail).length,
    draft: (emailState.draftEvents || []).length,
    sent: (emailState.sentEvents || []).length,
  };
}

function inboxEventsForFilter() {
  const all = emailState.allEvents;
  const f = emailState.inboxFilter;
  if (f === 'junk') return all.filter((e) => e.category === 'junk');
  if (f === 'auto_deleted') return all.filter(isAutoDeletedEmail);
  if (f === 'receipt') return all.filter((e) => e.category === 'receipt' && !isEmailRouted(e));
  if (f === 'alert') return all.filter((e) => e.category === 'alert' && !isEmailRouted(e));
  if (f === 'review') {
    return all.filter(
      (e) =>
        (e.category === 'review' || e.category === 'otp' || e.category === 'auth_link') &&
        !isEmailRouted(e),
    );
  }
  if (f === 'book') return all.filter((e) => isEmailBookable(e) && !isEmailRouted(e));
  if (f === 'project') return all.filter(isEmailProject);
  if (f === 'routed') return all.filter(isEmailRouted);
  return all.filter(
    (e) =>
      !isHiddenInboxEmail(e) && e.category !== 'receipt' && !isEmailProject(e) && !isEmailRouted(e),
  );
}

function filteredInboxEvents() {
  const q = emailState.search.trim();
  let events = inboxEventsForFilter();
  if (!q) return events;
  return events.filter((ev) =>
    matchesListSearch(
      q,
      ev.subject,
      ev.from,
      ev.summary,
      ev.bodySnippet,
      ev.contactName,
      ev.jobTitle,
      ev.category,
      ev.routeNote,
    ),
  );
}

function formatSentSourceLabel(source) {
  const key = String(source || '').trim();
  const labels = {
    admin_compose: 'Compose',
    admin_reply: 'Reply',
    share_sheet: 'Share',
    agent: 'Agent',
    client_portal: 'Portal',
    unknown: 'Sent',
  };
  return labels[key] || key.replace(/_/g, ' ') || 'Sent';
}

function filteredDraftEvents() {
  const q = emailState.search.trim();
  let events = emailState.draftEvents || [];
  if (!q) return events;
  return events.filter((ev) => {
    const recipients = (ev.to || []).flatMap((r) => [r.email, r.name]).filter(Boolean);
    return matchesListSearch(q, ev.subject, ev.body, ...recipients);
  });
}

function filteredSentEvents() {
  const q = emailState.search.trim();
  let events = emailState.sentEvents || [];
  if (!q) return events;
  return events.filter((ev) =>
    matchesListSearch(
      q,
      ev.subject,
      ev.toEmail,
      ev.jobTitle,
      ev.jobSlug,
      ev.source,
      ev.resendId,
      ev.bodyText,
    ),
  );
}

export function clearTopbarPanelContext() {
  const slot = document.getElementById('topbar-panel-context');
  const topbar = document.getElementById('topbar');
  document.querySelector('.topbar-end .topbar-panel-actions')?.remove();
  if (slot) {
    slot.innerHTML = '';
    slot.hidden = true;
  }
  topbar?.classList.remove('topbar-has-panel-context');
}

function shouldShowChatTopbarTitle(title) {
  const t = (title || '').trim();
  return t.length > 0 && !isDefaultSessionTitle(t);
}

function closeActiveChat() {
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  const id = chatState.activeId;
  void finalizeChatTitleIfNeeded(id).then(() => abandonDisposableChat(id)).then(async () => {
    chatState.activeId = null;
    clearChatLastActiveId();
    setChatComposeFocused(false);
    getChatPanel()?.classList.remove('ch-pane-active');
    renderChatPanel();
  });
}

function chatTranscriptText() {
  return chatState.messages
    .map((m) => `${m.role === 'user' ? 'You' : 'Assistant'}:\n${chatMsgPlainText(m.content)}`)
    .join('\n\n');
}

export function chatHasConversation() {
  return chatState.messages.length > 0 || chatState.sending;
}

function activeChatThread() {
  const id = chatState.activeId;
  if (!id) return null;
  const found = chatState.threads.find((t) => t.id === id);
  if (found) return found;
  return { id, title: displaySessionTitle(chatState.title) || 'Session', archived: false };
}

function buildChatPaneNavHeader() {
  const header = document.createElement('div');
  header.className = 'de-header ch-pane-header ch-pane-header--nav-only';
  header.appendChild(createPanelBackBtn({
    label: 'Back to sessions',
    onClick: () => closeActiveChat(),
  }));
  return header;
}

export function buildChatPaneHeader() {
  const main = document.createElement('div');
  main.className = 'ch-pane-header-main';
  main.appendChild(createHeaderChatTitle(chatState.activeId, chatState.title));
  if (chatState.linkedJobs?.length) {
    const links = document.createElement('div');
    links.className = 'ch-pane-project-links';
    for (const job of chatState.linkedJobs) {
      links.appendChild(
        createProjectLinkChip(job.title || job.slug, () =>
          navigateToWork(job.slug, { fromChatId: chatState.activeId }),
        ),
      );
    }
    main.appendChild(links);
  }

  const transcript = chatTranscriptText();
  const thread = activeChatThread();
  const isArchived = !!thread?.archived;

  return createPaneHeader({
    className: 'ch-pane-header',
    back: { label: 'Back to sessions', onClick: () => closeActiveChat() },
    titleNode: main,
    // Agent model select lives in the action cluster (chat-only — other panes'
    // agent buttons triage/send-to-agent and do not open this picker).
    beforeIcons: [createChatModelSwitcher()],
    icons: [
      createCopyIconBtn({
        label: 'Copy entire conversation',
        className: 'ios-icon-btn ch-copy-chat-btn',
        getText: () => transcript,
        onError: () => showChatToast('Copy failed — check browser permissions'),
      }),
      paneShareIcon({
        label: 'Share entire conversation',
        onClick: (btn) => shareChatText(transcript, 'assistant', btn),
      }),
      createIosIconBtn({
        iconKey: 'archive',
        label: isArchived ? 'Unarchive session' : 'Archive session',
        className: 'ios-icon-btn ch-archive-chat-btn',
        onClick: () => {
          const t = activeChatThread();
          if (t) void archiveChat(t);
        },
      }),
      paneDeleteIcon({
        label: 'Delete session',
        onClick: () => deleteChat(chatState.activeId),
      }),
    ],
  }).root;
}

function syncTopbarPanelContext() {
  clearTopbarPanelContext();
}

function isProjectMatchSuggested(ev) {
  if (!ev || ev.automationAckAt) return false;
  if (!ev.jobSlug) return false;
  const action = String(ev.action || '').toLowerCase();
  if (action === 'filed' || action === 'project_reply') return false;
  if (ev.automationKind === 'project_created') return false;
  if (action === 'matched') return true;
  return action === 'review' && ev.category === 'client';
}

function isPendingReviewNotification(ev) {
  if (!ev || ev.automationAckAt) return false;
  const action = String(ev.action || '').toLowerCase();
  if (action === 'booked' && ev.bookingUid && ev.automationKind !== 'meeting_followup') return true;
  if (ev.automationKind === 'meeting_followup' && ev.bookingUid) return true;
  if (
    (ev.automationKind === 'meeting_request' || ev.automationKind === 'meeting_conflict') &&
    !ev.bookingUid
  ) {
    return true;
  }
  if (!ev.bookingUid && !ev.automationKind && !isHiddenInboxEmail(ev)) {
    const blob = [ev.summary, ev.subject, ev.schedulingNote, ev.bodySnippet].join(' ').toLowerCase();
    const mentionsMeeting = /\b(meet(ing)?|schedule|appointment|call|get together)\b/.test(blob);
    const mentionsTime =
      ev.proposedMeetingStart ||
      ev.schedulingNote ||
      /\b(\d{1,2}(:\d{2})?\s*(am|pm|a\.m|p\.m)|monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december)\b/i.test(
        blob,
      );
    if (mentionsMeeting && mentionsTime) return true;
  }
  if (ev.automationKind === 'project_created' && ev.jobSlug) return true;
  if (isProjectMatchSuggested(ev)) return true;
  return false;
}

function isEmailAwaitingTriage(ev) {
  return isPendingReviewNotification(ev) && !ev.automationTriageAt && !ev.automationAckAt;
}

/** Map an inbox row to the dashboard review notification type (for triage). */
function reviewNotificationTypeFromEmail(ev) {
  if (!isPendingReviewNotification(ev)) return null;
  const action = String(ev.action || '').toLowerCase();
  if (action === 'booked' && ev.bookingUid && ev.automationKind !== 'meeting_followup') return 'meeting';
  if (ev.automationKind === 'meeting_followup' && ev.bookingUid) return 'meeting_followup';
  if (
    (ev.automationKind === 'meeting_request' || ev.automationKind === 'meeting_conflict') &&
    !ev.bookingUid
  ) {
    return ev.automationKind === 'meeting_conflict' ? 'meeting_conflict' : 'meeting_request';
  }
  if (!ev.bookingUid && !ev.automationKind && !isHiddenInboxEmail(ev)) {
    const blob = [ev.summary, ev.subject, ev.schedulingNote, ev.bodySnippet].join(' ').toLowerCase();
    const mentionsMeeting = /\b(meet(ing)?|schedule|appointment|call|get together)\b/.test(blob);
    const mentionsTime =
      ev.proposedMeetingStart ||
      ev.schedulingNote ||
      /\b(\d{1,2}(:\d{2})?\s*(am|pm|a\.m|p\.m)|monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december)\b/i.test(
        blob,
      );
    if (mentionsMeeting && mentionsTime) return 'meeting_request';
  }
  if (ev.automationKind === 'project_created' && ev.jobSlug) return 'project';
  if (isProjectMatchSuggested(ev)) return 'project_match';
  return null;
}

function reviewNotificationItemFromEmail(ev) {
  const type = reviewNotificationTypeFromEmail(ev);
  if (!type || !EMAIL_AUTOMATION_REVIEW_TYPES.has(type)) return null;
  return {
    type,
    emailId: ev.id,
    awaitingTriage: isEmailAwaitingTriage(ev),
    title: ev.subject || '(no subject)',
    detail: ev.summary || ev.bodySnippet || ev.jobTitle || '',
    subject: ev.subject || '(no subject)',
    from: ev.from || '',
    jobSlug: ev.jobSlug || null,
    jobTitle: ev.jobTitle || ev.jobSlug || null,
    contactName: ev.contactName || null,
    proposedMeetingStart: ev.proposedMeetingStart || null,
  };
}

function pendingReviewCount(events) {
  const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
  return (events || []).filter((ev) => {
    if (!isPendingReviewNotification(ev)) return false;
    const t = new Date(ev.receivedAt).getTime();
    return Number.isFinite(t) && t >= cutoff;
  }).length;
}

function updateInboxBadgesFromState() {
  syncReviewBadge(pendingReviewCount(emailState.allEvents));
}

async function clearCachedBadgeCount() {
  try {
    const cache = await caches.open(BADGE_CACHE);
    await cache.delete(BADGE_URL);
  } catch {}
}

async function writeCachedBadgeCount(n) {
  try {
    const cache = await caches.open(BADGE_CACHE);
    if (n <= 0) {
      await cache.delete(BADGE_URL);
      return;
    }
    await cache.put(BADGE_URL, new Response(String(n)));
  } catch {}
}

async function setAppIconBadge(n) {
  const count = Math.max(0, Number(n) || 0);
  await writeCachedBadgeCount(count);
  // Always update from the page context (iOS is more reliable here) and mirror
  // into the service worker so background restore stays correct.
  try {
    const reg = await navigator.serviceWorker?.getRegistration('/admin/');
    if (reg?.active) {
      reg.active.postMessage({ type: 'reave-badge-sync', count });
    }
  } catch {}
  if (!('setAppBadge' in navigator)) return;
  try {
    if (count > 0) await navigator.setAppBadge(count);
    else if ('clearAppBadge' in navigator) await navigator.clearAppBadge();
  } catch (e) {
    console.warn('[badge]', e);
  }
}

/** Close matching OS / tray notifications when a dashboard banner goes away. */
async function closeOsNotificationsForReview(item) {
  try {
    const reg = await navigator.serviceWorker?.getRegistration('/admin/');
    if (!reg?.active) return;
    reg.active.postMessage({
      type: 'reave-close-notifications',
      alertId: item?.alertId ? String(item.alertId) : '',
      emailId: item?.emailId ? String(item.emailId) : '',
      tag: item?.tag ? String(item.tag) : '',
    });
  } catch {}
}

function applyServerBadgeCount(data) {
  if (data?.badgeCount == null) return false;
  syncReviewBadge(Math.max(0, Number(data.badgeCount) || 0));
  return true;
}

async function syncInboxAppBadge(events, reviewsPending) {
  const n =
    reviewsPending != null
      ? Math.max(0, Number(reviewsPending) || 0)
      : pendingReviewCount(events);
  syncReviewBadge(n);
}

async function refreshFooterBadgesQuiet() {
  try {
    const [badgeRes, inboxRes] = await Promise.all([
      adminFetch('/api/admin/badges'),
      adminFetch('/api/email/inbox?limit=100'),
    ]);

    const inboxOk = inboxRes.ok;
    let dashStats = null;

    if (badgeRes.ok) {
      const badges = await badgeRes.json();
      if (badges.ok) {
        dashStats = badges.stats;
        syncDashboardFooterBadgesWithoutReview(badges.stats);
      }
    }

    if (inboxOk) {
      const inboxData = await inboxRes.json();
      const events = inboxData.events || [];
      if (MAP.type === 'email' && emailState.allEvents.length) {
        mergeEmailSeenFromServer(events);
      }
      const badgeCount =
        dashStats?.reviewsPending ??
        dashStats?.automationPending ??
        inboxData.digest?.reviewsPending;
      await syncInboxAppBadge(events, badgeCount);
      return;
    }

    if (dashStats) syncReviewBadge(dashStats.reviewsPending ?? dashStats.automationPending ?? 0);
    else await setAppIconBadge(reviewsPendingCount);
  } catch {}
}

async function refreshInboxBadgeQuiet(forceHome = false) {
  const prevCount = reviewsPendingCount;
  await refreshFooterBadgesQuiet();
  if (MAP.type !== 'dashboard') return;
  if (forceHome || reviewsPendingCount !== prevCount) {
    await refreshDashboardReviewBannersQuiet();
  }
}

function stopInboxBadgePoll() {
  if (inboxBadgeTimer) {
    clearInterval(inboxBadgeTimer);
    inboxBadgeTimer = null;
  }
}

function syncInboxBadgePoll() {
  stopInboxBadgePoll();
  if (!userId || document.hidden) return;
  refreshInboxBadgeQuiet();
  inboxBadgeTimer = setInterval(refreshInboxBadgeQuiet, 60000);
}

function emailCategoryClass(cat) {
  const key = String(cat || 'review').toLowerCase();
  const known = new Set([
    'junk',
    'auto_deleted',
    'client',
    'alert',
    'internal',
    'review',
    'receipt',
    'project',
    'otp',
    'auth_link',
  ]);
  if (key === 'auto_deleted') return 'em-cat-auto-deleted';
  return known.has(key) ? `em-cat-${key === 'auth_link' ? 'otp' : key}` : 'em-cat-review';
}

function formatEmailCategoryLabel(ev) {
  if (isVerificationCodeEmail(ev)) return 'Verification code';
  if (String(ev.category || '').toLowerCase() === 'auth_link' || ev.actionUrl) {
    return 'Activation link';
  }
  if (isProjectReplyEmail(ev)) return 'Contact reply';
  if (isEmailProject(ev)) return postTitle(2);
  const cat = String(ev.category || 'review').toLowerCase();
  if (cat === 'project') return postTitle(2);
  if (cat === 'auto_deleted') return 'Auto deleted';
  return ev.category || 'review';
}

function emailMonetaryAmount(ev) {
  const n = Number(ev.monetaryAmount);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function formatEmailUsd(amount) {
  return Number(amount).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function emailShowsReceiptAction(ev) {
  if (isVerificationCodeEmail(ev)) return false;
  if (isAuthLinkEmailRecord(ev)) return false;
  if (ev.category === 'receipt') return false;
  return emailMonetaryAmount(ev) != null;
}

function isVerificationCodeEmail(ev) {
  if (!ev) return false;
  if (Boolean(ev.verificationCode)) return true;
  if (String(ev.category || '').toLowerCase() === 'otp') return true;
  if (String(ev.action || '').toLowerCase() === 'verification_code') return true;
  return String(ev.status || '').toUpperCase() === 'VERIFICATION_CODE';
}

function isAuthLinkEmailRecord(ev) {
  if (!ev) return false;
  if (isVerificationCodeEmail(ev)) return false;
  if (Boolean(ev.actionUrl)) return true;
  if (String(ev.category || '').toLowerCase() === 'auth_link') return true;
  if (String(ev.action || '').toLowerCase() === 'activation_link') return true;
  return String(ev.status || '').toUpperCase() === 'AUTH_LINK';
}

function closeEmailDetail() {
  emailState.activeId = null;
  emailState.composing = false;
  getEmailPanel()?.classList.remove('em-pane-active');
  renderEmailPanel();
  if (MAP?.type === 'email') syncAdminTabUrl('email', { emailId: null });
}

function emailHasFullBody(ev) {
  return Boolean(String(ev.bodyHtml || '').trim() || String(ev.bodyText || '').trim());
}

function emailDetailSummaryText(ev) {
  // Title already is the subject; the message body is below. Only use the
  // triage summary as a stand-in before the full mail has loaded.
  if (emailHasFullBody(ev)) return '';
  const summary = String(ev.summary || ev.bodySnippet || '').trim();
  const subject = String(ev.subject || '').trim();
  if (!summary || summary === subject) return '';
  return summary;
}

async function unsubscribeEmail(ev, btn) {
  const from = parseSenderEmail(ev.from) || ev.from || 'this sender';
  const confirmed = await osConfirm({
    title: 'Unsubscribe?',
    bodyHtml:
      `Send an unsubscribe request for mail from <strong>${escHtml(from)}</strong>? ` +
      `This uses the List-Unsubscribe header in the message — the same mechanism Gmail uses.`,
    confirmLabel: 'Unsubscribe',
    cancelLabel: 'Cancel',
  });
  if (!confirmed) return;

  const prevLabel = btn?.getAttribute('aria-label');
  if (btn) {
    btn.disabled = true;
    btn.setAttribute('aria-label', 'Unsubscribing…');
  }
  try {
    const res = await fetch(`/api/email/inbox/${encodeURIComponent(ev.id)}/unsubscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const data = await readApiJson(res);
    if (!data.ok) {
      osAlert({
        title: 'Unsubscribe failed',
        bodyHtml: escHtml(data.error || 'The sender did not accept the unsubscribe request.'),
      });
      return;
    }
    osAlert({
      title: 'Unsubscribed',
      bodyHtml: `Unsubscribe request sent for mail from ${escHtml(from)}.`,
    });
  } catch (e) {
    osAlert({ title: 'Unsubscribe failed', bodyHtml: escHtml(e.message) });
  } finally {
    if (btn) {
      btn.disabled = false;
      if (prevLabel) btn.setAttribute('aria-label', prevLabel);
    }
  }
}

function buildEmailDetailHeaderIcons(ev) {
  if (isVerificationCodeEmail(ev)) {
    const icons = [];
    if (ev.verificationCode) {
      icons.push(
        createIosIconBtn({
          iconKey: 'copy',
          label: 'Copy code',
          className: 'ios-icon-btn em-copy-code-btn',
          onClick: (btn) => void copyEmailVerificationCode(ev.verificationCode, btn),
        }),
      );
    }
    icons.push(
      paneDeleteIcon({
        label: 'Delete message',
        onClick: () => deleteEmail(ev),
      }),
      createIosIconBtn({
        iconKey: 'x',
        label: 'Close',
        className: 'ios-icon-btn em-close-detail-btn',
        onClick: () => closeEmailDetail(),
      }),
    );
    return icons;
  }
  if (isAuthLinkEmailRecord(ev)) {
    const icons = [];
    if (ev.actionUrl) {
      icons.push(
        createIosIconBtn({
          iconKey: 'link',
          label: 'Activate',
          className: 'ios-icon-btn em-activate-link-btn',
          onClick: (btn) => {
            if (btn) btn.disabled = true;
            try {
              window.open(String(ev.actionUrl), '_blank', 'noopener,noreferrer');
            } catch {
              /* ignore */
            }
            void deleteEmail(ev).finally(() => {
              if (btn) btn.disabled = false;
            });
          },
        }),
      );
    }
    icons.push(
      paneDeleteIcon({
        label: 'Delete message',
        onClick: () => deleteEmail(ev),
      }),
      createIosIconBtn({
        iconKey: 'x',
        label: 'Close',
        className: 'ios-icon-btn em-close-detail-btn',
        onClick: () => closeEmailDetail(),
      }),
    );
    return icons;
  }
  const icons = [
    createIosIconBtn({
      iconKey: 'reply',
      label: 'Reply',
      className: 'ios-icon-btn em-reply-btn',
      onClick: () => void startReplyEmail(ev, 'reply'),
    }),
  ];
  if (ev.unsubscribe?.available) {
    icons.push(
      createIosIconBtn({
        iconKey: 'bell-off',
        label: 'Unsubscribe',
        className: 'ios-icon-btn em-unsubscribe-btn',
        onClick: (btn) => void unsubscribeEmail(ev, btn),
      }),
    );
  }
  icons.push(
    paneShareIcon({
      label: 'Share message',
      onClick: (btn) => shareChatText(emailShareText(ev), 'assistant', btn),
    }),
  );
  // Archive sits between share and delete on ≥640px; swipe covers it on small screens.
  if (!isHiddenInboxEmail(ev)) {
    const routed = isEmailRouted(ev);
    icons.push(
      createIosIconBtn({
        iconKey: 'archive',
        label: routed ? 'Unarchive message' : 'Archive message',
        className: 'ios-icon-btn em-archive-btn',
        onClick: () => void (routed ? unarchiveEmail(ev) : archiveEmail(ev)),
      }),
    );
  }
  if (isAutoDeletedEmail(ev)) {
    icons.push(
      createIosIconBtn({
        iconKey: 'undo',
        label: 'Keep this message',
        className: 'ios-icon-btn em-keep-btn',
        onClick: () => void restoreAutoDeletedEmail(ev),
      }),
    );
  }
  icons.push(
    paneDeleteIcon({
      label: 'Delete message',
      onClick: () => deleteEmail(ev),
    }),
  );
  return icons;
}

function parseSenderEmail(from) {
  const raw = String(from || '').trim();
  const angle = raw.match(/<([^>]+)>/);
  if (angle?.[1]) return angle[1].trim();
  if (/^[^\s@]+@[^\s@]+$/.test(raw)) return raw;
  return raw || '';
}

function formatEmailCardFrom(ev) {
  return parseSenderEmail(ev.from) || '(unknown)';
}

function findClientByEmailLocal(email) {
  const needle = String(email || '').trim().toLowerCase();
  if (!needle) return null;
  return (
    (clientState.clients || []).find(
      (c) => String(c.email || '').trim().toLowerCase() === needle,
    ) || null
  );
}

function pickResolvedClientMatch(data) {
  if (data?.match === 'exact' && data.contact?.uid) {
    return { uid: data.contact.uid, name: data.contact.name || '' };
  }
  return null;
}

function clientEmails(client) {
  const extras = Array.isArray(client?.emails) ? client.emails : [];
  return [client?.email, ...extras]
    .map((e) => String(e || '').trim().toLowerCase())
    .filter(Boolean);
}

function contactEmailMatchesSender(ev, client) {
  const from = parseSenderEmail(ev.from).toLowerCase();
  return Boolean(from && clientEmails(client).includes(from));
}

async function resolveClientForEmailAddress(email) {
  const needle = String(email || '').trim().toLowerCase();
  if (!needle) return null;
  const local = findClientByEmailLocal(needle);
  if (local?.uid) return { uid: local.uid, name: local.name || '' };
  try {
    const res = await fetch('/api/clients/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: needle }),
    });
    const data = await res.json();
    if (!res.ok) return null;
    return pickResolvedClientMatch(data);
  } catch {
    return null;
  }
}

function senderAddressForContact(ev) {
  const email = parseSenderEmail(ev.from);
  return email && /^[^\s@]+@[^\s@]+$/.test(email) ? email : '';
}

function emailDetailFromHtml(ev) {
  const fromDisplay = ev.from || '(unknown)';
  const canAdd = Boolean(senderAddressForContact(ev));
  return (
    `<span class="em-from-client">` +
      `<strong>From</strong> ` +
      `<span class="em-from-value">${escHtml(fromDisplay)}</span>` +
      (canAdd
        ? `<span class="em-from-unknown"><button type="button" class="em-from-add" data-em-add-contact>Add to contacts</button></span>`
        : '') +
    `</span>`
  );
}

function openNewContactFromEmail(ev) {
  const email = senderAddressForContact(ev);
  if (!email) return;
  navigateToNewClient({
    email,
    name: parseSenderDisplayName(ev.from) || '',
  });
}

function applyEmailFromClientMatch(host, ev, match) {
  const valueEl = host.querySelector('.em-from-value');
  if (!valueEl || !host.isConnected) return;
  valueEl.textContent = ev.from || parseSenderEmail(ev.from) || '(unknown)';
  host.querySelector('.em-from-contact')?.remove();

  if (match?.uid) {
    host.querySelector('.em-from-unknown')?.remove();
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'project-link-chip em-from-contact';
    chip.title = match.name ? `Open ${match.name}` : 'Open contact profile';
    const icon = document.createElement('span');
    icon.className = 'em-from-contact-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = iosIcon('user', 12);
    const label = document.createElement('span');
    label.textContent = match.name || 'Contact';
    chip.append(icon, label);
    chip.addEventListener('click', (e) => {
      e.stopPropagation();
      navigateToClient(match.uid);
    });
    host.appendChild(chip);
    return;
  }

  if (host.querySelector('[data-em-add-contact]')) return;
  const email = senderAddressForContact(ev);
  if (!email) return;
  const wrap = document.createElement('span');
  wrap.className = 'em-from-unknown';
  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'em-from-add';
  addBtn.dataset.emAddContact = '';
  addBtn.textContent = 'Add to contacts';
  addBtn.title = 'Create a contact from this sender';
  addBtn.addEventListener('click', () => openNewContactFromEmail(ev));
  wrap.appendChild(addBtn);
  host.appendChild(wrap);
}

async function hydrateEmailFromClient(detail, ev) {
  const host = detail.querySelector('.em-from-client');
  if (!host) return;

  const email = senderAddressForContact(ev);
  const local = email ? findClientByEmailLocal(email) : null;
  if (local?.uid) {
    applyEmailFromClientMatch(host, ev, { uid: local.uid, name: local.name || '' });
    return;
  }

  const knownUid = String(ev.contactUid || '').trim();
  if (knownUid) {
    const known = (clientState.clients || []).find((c) => c.uid === knownUid);
    if (known && contactEmailMatchesSender(ev, known)) {
      applyEmailFromClientMatch(host, ev, {
        uid: known.uid,
        name: known.name || ev.contactName || '',
      });
      return;
    }
  }

  if (!email) return;
  const match = await resolveClientForEmailAddress(email);
  applyEmailFromClientMatch(host, ev, match);
}

function formatEmailAction(ev) {
  const bits = [];
  if (ev.action === 'project_reply' || ev.status === 'PROJECT_REPLY') {
    bits.push('🚨 contact reply');
  } else if (ev.bookingUid) bits.push('booked');
  else if (ev.action) bits.push(ev.action);
  if (ev.jobTitle) bits.push(ev.jobTitle);
  return bits.join(' · ');
}

function emailDetailClassificationHtml(ev) {
  const action = formatEmailAction(ev);
  const route = String(ev.routeNote || '').trim();
  const steps = [];
  const ruleId = String(ev.matchedRuleId || '').trim();
  const ruleTitle = String(ev.matchedRuleTitle || '').trim();
  if (ruleId) {
    steps.push({
      step: 'rule',
      decision: 'Rule',
      detail: ruleTitle || 'Edit rule',
      ruleId,
      ruleTitle,
    });
  }
  if (action) {
    const status = String(ev.status || '').toUpperCase();
    const actionLabel =
      status === 'AUTO_ARCHIVED' || (action.toLowerCase() === 'filed' && ev.category !== 'client' && ev.category !== 'receipt')
        ? 'archive'
        : action;
    steps.push({ decision: 'Action', detail: actionLabel });
  }
  if (route) {
    steps.push({
      decision: 'Route',
      detail: route,
      ...(ruleId ? { ruleId, ruleTitle } : {}),
    });
  }
  const existing = Array.isArray(ev.classificationAudit) ? ev.classificationAudit : [];
  for (const step of existing) {
    const copy = { ...step };
    if (!ruleId && String(step.step || '') === 'agent') copy.openLab = true;
    steps.push(copy);
  }
  if (!steps.length) return '';
  return classificationAuditTrailHtml({
    type: ev.category === 'receipt' ? 'receipt_expense' : 'classification',
    auditTrail: steps,
  });
}

function inboxToAddresses(ev) {
  if (Array.isArray(ev?.toDisplay) && ev.toDisplay.length) return ev.toDisplay;
  if (Array.isArray(ev?.to) && ev.to.length) return ev.to;
  return [];
}

async function openClassificationRule(ruleId, ev, opts = {}) {
  const id = String(ruleId || '').trim();
  const full = ev?._fullLoaded ? ev : ev?.id ? await fetchFullEmailRecord(ev) : ev;
  if (id) {
    await openRulesLabWithRule(id, { email: full, run: true });
    return;
  }
  if (opts.lab && full) await openRulesLabWithEmail(full, { run: true });
}

function bindClassificationAuditLinks(root, ev) {
  if (!root) return;
  root.querySelectorAll('[data-em-open-rule], [data-em-open-lab]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const ruleId = el.getAttribute('data-em-open-rule') || '';
      const openLab = el.hasAttribute('data-em-open-lab');
      void openClassificationRule(ruleId, ev, { lab: openLab });
    });
  });
}

function isProjectReplyEmail(ev) {
  return ev.action === 'project_reply' || ev.status === 'PROJECT_REPLY';
}

const QUEUED_AGENT_OPENS_KEY = 'reave:queued-agent-opens';
const DEPLOY_CHAT_DRAFT_KEY = 'reave:deploy-chat-draft';

function isDeployChatLocked() {
  try {
    return Boolean(
      window.__reaveLastDeployIndicatorReady && window.__reaveLastDeployIndicator?.chatLocked,
    );
  } catch {
    return false;
  }
}

function readQueuedAgentOpens() {
  try {
    const raw = sessionStorage.getItem(QUEUED_AGENT_OPENS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeQueuedAgentOpens(list) {
  try {
    if (!list.length) sessionStorage.removeItem(QUEUED_AGENT_OPENS_KEY);
    else sessionStorage.setItem(QUEUED_AGENT_OPENS_KEY, JSON.stringify(list));
  } catch {
    /* private mode */
  }
}

function enqueueAgentOpen(prompt, opts = {}) {
  const list = readQueuedAgentOpens();
  list.push({
    prompt,
    sourceEmailId: opts.sourceEmailId?.trim?.() || opts.sourceEmailId || null,
    sourceJobSlug: opts.sourceJobSlug || null,
  });
  writeQueuedAgentOpens(list);
}

/** Keep a per-thread auto-send so multiple Send-to-Agent taps during one deploy all flush. */
function persistThreadAutoSend(threadId, text) {
  if (!threadId || !String(text || '').trim()) return;
  try {
    const raw = sessionStorage.getItem(DEPLOY_CHAT_DRAFT_KEY);
    let map = {};
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.threadId === 'string' && typeof parsed.text === 'string') {
        map = {
          [parsed.threadId]: {
            text: parsed.text,
            ...(parsed.autoSend ? { autoSend: true } : {}),
          },
        };
      } else if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        map = parsed;
      }
    }
    map[threadId] = { text, autoSend: true };
    sessionStorage.setItem(DEPLOY_CHAT_DRAFT_KEY, JSON.stringify(map));
  } catch {
    /* private mode */
  }
}

function threadHasNoMessages(thread) {
  return !thread?.last_role;
}

async function askAgentWithPrompt(prompt, opts = {}) {
  closeOpenSwipeRow();
  try {
    const emailId = opts.sourceEmailId?.trim?.() || null;

    if (emailId) {
      let existing = chatState.threads.find((t) => t.source_email_id === emailId);
      if (!existing) {
        chatState.threads = await fetchChatThreads();
        existing = chatState.threads.find((t) => t.source_email_id === emailId);
      }
      if (existing) {
        const queueSend = threadHasNoMessages(existing);
        chatState.pendingDraft = queueSend ? prompt : null;
        chatState.pendingAutoSend = queueSend;
        if (queueSend) persistThreadAutoSend(existing.id, prompt);
        if (activeKey === 'chats' && chatState.activeId === existing.id && !queueSend) return;
        await openChat(existing.id, { force: true });
        return;
      }
    }

    const payload = {};
    if (emailId) payload.sourceEmailId = emailId;
    if (opts.sourceJobSlug) payload.sourceJobSlug = opts.sourceJobSlug;
    const res = await fetch('/api/chats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await readApiJson(res);
    const thread = data.thread;
    chatState.threads.unshift(thread);
    chatState.activeId = thread.id;
    chatState.title = thread.title;
    chatState.linkedJobs = thread.linked_jobs || [];
    chatState.messages = [];
    chatState.pendingDraft = prompt;
    chatState.pendingAutoSend = true;
    chatState.disposableChatId = null;
    persistThreadAutoSend(thread.id, prompt);

    if (activeKey === 'chats') {
      renderChatPanel();
    } else {
      setActiveMap('chats', { force: true, keepChatSession: true });
    }
  } catch (e) {
    if (!opts.skipQueueOnFail && isDeployChatLocked()) {
      enqueueAgentOpen(prompt, opts);
      showChatToast('Queued — will send when the new version is live');
      return;
    }
    if (opts.skipQueueOnFail) throw e;
    osAlert({ title: 'Could not open agent', bodyHtml: escHtml(e.message) });
  }
}

async function flushQueuedAgentOpens() {
  if (flushQueuedAgentOpens.running) return;
  if (isDeployChatLocked()) return;
  const list = readQueuedAgentOpens();
  if (!list.length) return;
  flushQueuedAgentOpens.running = true;
  writeQueuedAgentOpens([]);
  const leftover = [];
  try {
    for (const item of list) {
      try {
        await askAgentWithPrompt(item.prompt, {
          sourceEmailId: item.sourceEmailId,
          sourceJobSlug: item.sourceJobSlug,
          skipQueueOnFail: true,
        });
      } catch {
        leftover.push(item);
      }
    }
  } finally {
    if (leftover.length) writeQueuedAgentOpens([...leftover, ...readQueuedAgentOpens()]);
    flushQueuedAgentOpens.running = false;
  }
}

function bindQueuedAgentOpens() {
  if (document.documentElement.dataset.queuedAgentOpensBound) return;
  document.documentElement.dataset.queuedAgentOpensBound = '1';
  window.addEventListener('reave:deploy-indicator', (ev) => {
    const deploy = ev.detail;
    if (deploy?.chatLocked) return;
    void flushQueuedAgentOpens();
  });
  window.addEventListener('pageshow', () => {
    if (!isDeployChatLocked()) void flushQueuedAgentOpens();
  });
}

initCreateDrawer({
  setFormFieldState,
});

initInsightsPanels({
  navIcon,
  setActiveMap,
  companyBrand,
  osAlert,
  getMap: () => MAP,
  appendEmptyDetailPane,
});

initRulesPanel({
  captureSidebarListScroll,
  finishSidebarListScroll,
  scrollSidebarListItemIntoView,
  mountCreateDrawerChrome,
  clearEditorFooterSave,
  appendEmptyDetailPane,
  isCreateDrawerOpen,
  getCreateDrawerPane,
  navIcon,
  formatChatDate,
  setFormFieldState,
  flashFormFieldSaved,
  FORM_FIELD_SAVED,
  FORM_FIELD_INVALID,
  AUTOSAVE_DEBOUNCE_MS,
  beginCreateDrawer,
  finishCreateDrawer,
  companyBrand,
  setActiveMap,
});

initNewsletterPanel({});

initOnlineReviewsPanel({});
initMediaPanel({});
initModulesPanel({ getMap: () => MAP, MAP });
initAddonsPanel({
  getMap: () => MAP,
  MAP,
  prependSettingsBackHeader,
  setActiveMap,
});
initCatalogPanel({
  getMap: () => MAP,
  MAP,
  prependSettingsBackHeader,
  setActiveMap,
  flushSettingsAutosave,
});

initTodoPanel({
  setActiveMap,
  osAlert,
  syncFooterNav,
  beginCreateDrawer,
  finishCreateDrawer,
  flagCreateDrawerTitleMissing,
  isCreateDrawerOpen,
  mountCreateDrawerChrome,
  captureSidebarListScroll,
  finishSidebarListScroll,
  scrollSidebarListItemIntoView,
  appendEmptyDetailPane,
  askAgentWithPrompt,
  createPortalShareBtn,
  attachAutosuggestKeyboardNav,
  SIDEBAR_LIST_GRIP,
  KNOWLEDGE_API,
});

initDocumentsPanel({
  setActiveMap,
  osAlert,
  syncFooterNav,
  beginCreateDrawer,
  finishCreateDrawer,
  flagCreateDrawerTitleMissing,
  isCreateDrawerOpen,
  getCreateDrawerPane,
  mountCreateDrawerChrome,
  captureSidebarListScroll,
  finishSidebarListScroll,
  scrollSidebarListItemIntoView,
  appendEmptyDetailPane,
  clearEditorFooterSave,
  setEditorFooterSave,
  setFormFieldState,
  flashFormFieldSaved,
  askAgentWithPrompt,
  buildAgentContentPrompt,
  MAP,
  activeKey,
});

initKnowledgePanel({
  setActiveMap,
  osAlert,
  syncFooterNav,
  beginCreateDrawer,
  finishCreateDrawer,
  flagCreateDrawerTitleMissing,
  isCreateDrawerOpen,
  getCreateDrawerPane,
  mountCreateDrawerChrome,
  captureSidebarListScroll,
  finishSidebarListScroll,
  captureFilterTabsScroll,
  mountFilterTabsScroll,
  appendEmptyDetailPane,
  clearEditorFooterSave,
  setEditorFooterSave,
  setFormFieldState,
  flashFormFieldSaved,
  askAgentWithPrompt,
  titleFromKnowledgeMarkdown,
  SIDEBAR_LIST_GRIP,
  KNOWLEDGE_API,
  MAP,
  activeKey,
  navIcon,
  AUTOSAVE_DEBOUNCE_MS,
  userId,
});

initSchedulePanel({
  setActiveMap,
  osAlert,
  syncFooterNav,
  navigateToClient,
  appendEmptyDetailPane,
  MAP,
  activeKey,
});

initClientsPanel({
  setActiveMap,
  osAlert,
  syncFooterNav,
  beginCreateDrawer,
  finishCreateDrawer,
  flagCreateDrawerTitleMissing,
  isCreateDrawerOpen,
  getCreateDrawerPane,
  mountCreateDrawerChrome,
  captureSidebarListScroll,
  finishSidebarListScroll,
  captureFilterTabsScroll,
  mountFilterTabsScroll,
  scrollSidebarListItemIntoView,
  appendEmptyDetailPane,
  clearEditorFooterSave,
  setEditorFooterSave,
  setFormFieldState,
  flashFormFieldSaved,
  createPortalShareBtn,
  askAgentWithPrompt,
  isMobileTabs,
  isAdminPaneMobile,
  scanPanelSidebars,
  MAP,
  activeKey,
  navIcon,
  FORM_FIELD_INVALID,
  FORM_FIELD_SAVED,
});

initChatPanel({
  setActiveMap,
  osAlert,
  syncFooterNav,
  appendEmptyDetailPane,
  captureSidebarListScroll,
  finishSidebarListScroll,
  captureFilterTabsScroll,
  mountFilterTabsScroll,
  askAgentWithPrompt,
  setChatComposeFocused,
  syncTopbarPanelContext,
  syncAdminSplitView,
  scanPanelSidebars,
  SIDEBAR_LIST_GRIP,
  MAP,
  activeKey,
  navIcon,
  placeholderHtml,
  scrollSidebarListItemIntoView,
  agentModelState,
  createChatReaveKeyFlag,
  chatHasConversation,
  buildChatPaneHeader,
  clearTopbarPanelContext,
});

initWorkPanel({
  setActiveMap,
  navigateToEmail,
  navigateToChat,
  navigateToTodo,
  navigateToClient,
  navigateToNewTodoForProject,
  askAgentWithPrompt,
  createPortalShareBtn,
  renderLinkTrackStatus,
  renderShareSendLog,
  formatChatDate,
  formatTodoDueDate,
  sharePortalLink,
  loadAdminDashboard,
  reviewsPendingCount,
  clearEditorFooterSave,
  mountCreateDrawerChrome,
  appendEmptyDetailPane,
  captureSidebarListScroll,
  finishSidebarListScroll,
  captureFilterTabsScroll,
  mountFilterTabsScroll,
  scrollSidebarListItemIntoView,
  beginCreateDrawer,
  finishCreateDrawer,
  flagCreateDrawerTitleMissing,
  getCreateDrawerPane,
  armTitleFocus,
  flushTitleFocus,
  mapPaneTitle,
  osAlert,
  todoState,
  normalizeTodoItemDates,
  todoSubline,
  attachAutosuggestKeyboardNav,
  flushTodoAutosave,
  saveActiveTodoDraft,
  cancelTitleFocus,
  setFormFieldState,
  flashFormFieldSaved,
  isCreateDrawerOpen,
  showChatToast,
  copyChatText,
  isMobileTabs,
  isAdminPaneMobile,
  scanPanelSidebars,
});

function buildAgentContentPrompt(intro, metaLines, body) {
  const lines = [intro, '', ...metaLines];
  const trimmed = (body || '').trim();
  if (trimmed) lines.push('', '---', trimmed.slice(0, 12000));
  return lines.join('\n');
}


async function askAgentAboutRule(rule) {
  try {
    const lines = [
      'Help me understand and improve this email triage rule:',
      '',
      `Title: ${rule.title || rule.status}`,
      `Status tag: ${rule.status}`,
    ];
    if (rule.description) lines.push(`Description: ${rule.description}`);
    lines.push(`Match mode: ${rule.matchMode === 'all' ? 'All phrases must match' : 'Any phrase matches'}`);
    lines.push(`Search in: ${(rule.fields || ['subject', 'body']).join(', ')}`);
    if (rule.phrases && rule.phrases.length > 0) {
      lines.push('', 'Keywords / phrases:');
      for (const phrase of rule.phrases) {
        lines.push(`  - ${phrase}`);
      }
    }
    lines.push('', `Enabled: ${rule.enabled !== false ? 'Yes' : 'No'}`);
    lines.push(`Send alert: ${rule.notify ? 'Yes' : 'No'}`);
    lines.push(
      `Expires: ${
        rule.expiresAt
          ? `${formatRuleExpiresLabel(rule.expiresAt)}${isRuleExpired(rule) ? ' (expired)' : ''}`
          : 'Indefinite'
      }`,
    );
    lines.push('', 'Please suggest improvements or explain how this rule works.');
    await askAgentWithPrompt(lines.join('\n'));
  } catch (e) {
    osAlert({ title: 'Could not open agent', bodyHtml: escHtml(e.message) });
  }
}





async function confirmEmailBooking(ev, startIso, address) {
  const res = await fetch(`/api/email/inbox/${encodeURIComponent(ev.id)}/schedule`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      start: startIso,
      ...(address ? { address } : {}),
    }),
  });
  const data = await readApiJson(res);
  if (!res.ok) {
    const err = new Error(data.error || `HTTP ${res.status}`);
    err.check = data.check;
    throw err;
  }
  const idx = emailState.allEvents.findIndex((e) => e.id === ev.id);
  if (idx !== -1 && data.event) emailState.allEvents[idx] = data.event;
  renderEmailPanel();
  return data;
}

function showEmailScheduleDialog(ev, check) {
  const backdrop = document.getElementById('os-dialog-backdrop');
  const titleEl = document.getElementById('os-dialog-title');
  const bodyEl = document.getElementById('os-dialog-body');
  const actionsEl = document.getElementById('os-dialog-actions');
  if (!backdrop || !titleEl || !bodyEl || !actionsEl) return Promise.resolve(false);

  return new Promise((resolve) => {
    let settled = false;
    let destroyAddressAutocomplete = () => {};
    const finish = (value) => {
      if (settled) return;
      settled = true;
      destroyAddressAutocomplete();
      releaseOsDialogKeyboardLayout();
      closeOsDialogBackdrop();
      document.removeEventListener('keydown', onKey);
      resolve(value);
    };
    const onKey = (evKey) => {
      if (evKey.key === 'Escape' && !isAddressPickerSheetOpen()) finish(false);
    };

    titleEl.textContent = check.available ? 'Schedule meeting' : 'Time conflict';
    const parts = [
      `<p class="em-book-dialog-lead">${escHtml(ev.subject || '(no subject)')}</p>`,
      `<p><strong>Requested:</strong> ${escHtml(check.proposedLabel)}</p>`,
      `<p><strong>With:</strong> ${escHtml(check.attendeeName)} &lt;${escHtml(check.attendeeEmail)}&gt;</p>`,
    ];
    if (!check.available && check.conflictReason) {
      parts.push(`<p class="em-book-conflict">${escHtml(check.conflictReason)}</p>`);
    }
    if (!check.available && check.alternatives?.length) {
      parts.push('<p class="em-book-alt-label">Pick an open slot:</p>');
      parts.push('<div class="em-book-alt-slots">');
      for (const slot of check.alternatives) {
        parts.push(
          `<button type="button" class="em-book-alt-slot" data-start="${escHtml(slot.iso)}">${escHtml(slot.label || formatScheduleWhen(slot.iso))}</button>`,
        );
      }
      parts.push('</div>');
    } else if (!check.available) {
      parts.push('<p class="em-book-conflict">No nearby open slots found. Try Cal.com directly.</p>');
    }
    parts.push(
      '<label class="de-label sched-create-field em-book-address-field">' +
        '<span>Meeting address</span>' +
        '<div class="control-field">' +
          `<input id="em-book-address" type="text" autocomplete="street-address" autocapitalize="words" placeholder="Business or street address" value="${escHtml(readScheduleLastAddress())}">` +
        '</div>' +
      '</label>',
    );
    bodyEl.innerHTML = parts.join('');
    actionsEl.innerHTML = '';
    const addressInput = bodyEl.querySelector('#em-book-address');

    const mkBtn = (label, cls, value) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `os-dialog-btn ${cls}`.trim();
      btn.textContent = label;
      btn.addEventListener('click', () => finish(value));
      actionsEl.appendChild(btn);
      return btn;
    };

    mkBtn('Cancel', 'os-dialog-btn--ghost', false);

    if (check.available) {
      const bookBtn = document.createElement('button');
      bookBtn.type = 'button';
      bookBtn.className = 'os-dialog-btn os-dialog-btn--primary';
      bookBtn.textContent = 'Book meeting';
      bookBtn.addEventListener('click', async () => {
        const address = addressInput?.value.trim() || '';
        bookBtn.disabled = true;
        bookBtn.textContent = 'Booking…';
        try {
          await confirmEmailBooking(ev, check.proposedStart, address);
          if (address) rememberScheduleAddress(address);
          finish(true);
          await osAlert({
            title: 'Meeting scheduled',
            bodyHtml: `<p>Booked for <strong>${escHtml(check.proposedLabel)}</strong> with ${escHtml(check.attendeeName)}.</p>`,
          });
        } catch (err) {
          bookBtn.disabled = false;
          bookBtn.textContent = 'Book meeting';
          if (err.check) {
            finish(false);
            await showEmailScheduleDialog(ev, err.check);
          } else {
            await osAlert({ title: 'Booking failed', bodyHtml: escHtml(err.message) });
          }
        }
      });
      actionsEl.appendChild(bookBtn);
    }

    bodyEl.querySelectorAll('.em-book-alt-slot').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const start = btn.getAttribute('data-start');
        if (!start) return;
        const address = addressInput?.value.trim() || '';
        btn.disabled = true;
        try {
          await confirmEmailBooking(ev, start, address);
          if (address) rememberScheduleAddress(address);
          finish(true);
          await osAlert({
            title: 'Meeting scheduled',
            bodyHtml: `<p>Booked for <strong>${escHtml(btn.textContent || formatScheduleWhen(start))}</strong>.</p>`,
          });
        } catch (err) {
          btn.disabled = false;
          if (err.check) {
            await showEmailScheduleDialog(ev, err.check);
          } else {
            await osAlert({ title: 'Booking failed', bodyHtml: escHtml(err.message) });
          }
        }
      });
    });

    openOsDialogBackdrop();
    bindOsDialogDismiss(backdrop, finish, true);
    document.addEventListener('keydown', onKey);
    bindOsDialogKeyboardLayout();
    if (addressInput) {
      destroyAddressAutocomplete = mountScheduleAddressAutocomplete(addressInput);
    }
  });
}

async function startEmailScheduleFlow(ev) {
  if (isEmailBooked(ev)) {
    await osAlert({
      title: 'Already scheduled',
      bodyHtml:
        `<p>Meeting booked for <strong>${escHtml(formatScheduleWhen(ev.bookingStart || ev.proposedMeetingStart))}</strong>.</p>` +
        (ev.bookingUid ? `<p class="em-hint">Booking ID: ${escHtml(ev.bookingUid.slice(0, 8))}…</p>` : ''),
    });
    return;
  }
  let data;
  try {
    const res = await fetch(`/api/email/inbox/${encodeURIComponent(ev.id)}/schedule`, {
      cache: 'no-store',
    });
    data = await readApiJson(res);
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  } catch (e) {
    await osAlert({ title: 'Could not check calendar', bodyHtml: escHtml(e.message) });
    return;
  }
  await showEmailScheduleDialog(ev, data.check);
}

function attendeeFromEmailEvent(ev) {
  const email = parseSenderEmail(ev.from);
  const raw = String(ev.from || '').trim();
  const nameMatch = raw.match(/^([^<]+)</);
  const parsedName = nameMatch?.[1]?.replace(/"/g, '').trim();
  const name = (ev.contactName || parsedName || email.split('@')[0] || 'Guest').trim();
  return { name, email: email.includes('@') ? email : '' };
}

async function runEmailScheduleAction(ev, action, btn) {
  const prevLabel = btn.textContent;
  const needsBooking = (action === 'accept-notify' && !ev.bookingUid) || action === 'book';
  let address = needsBooking ? readScheduleLastAddress() : '';

  async function postScheduleAction(addr) {
    btn.disabled = true;
    btn.textContent = action === 'accept-notify' ? 'Booking…' : 'Sending…';
    const res = await fetch(`/api/email/inbox/${encodeURIComponent(ev.id)}/schedule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action,
        ...(addr ? { address: addr } : {}),
      }),
    });
    const data = await readApiJson(res);
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }

  try {
    let data;
    try {
      data = await postScheduleAction(address);
    } catch (err) {
      if (needsBooking && isScheduleAddressError(err.message)) {
        btn.disabled = false;
        btn.textContent = prevLabel;
        const prompted = await ensureScheduleAddress({ forcePrompt: true, initial: address });
        if (!prompted) return;
        address = prompted;
        data = await postScheduleAction(address);
      } else {
        throw err;
      }
    }

    if (address) rememberScheduleAddress(address);
    if (data.event) {
      const idx = emailState.allEvents.findIndex((e) => e.id === ev.id);
      if (idx !== -1) emailState.allEvents[idx] = data.event;
    }

    // Meeting accept: Confirm → Booking… → Booked on the button — no sheet,
    // and no client email (inbound requests are often no-reply).
    if (action === 'accept-notify') {
      btn.disabled = true;
      btn.textContent = 'Booked';
      await sleepMs(700);
      if (data.event?.automationAckAt) {
        removeReviewAlertBanner(ev.id);
        updateInboxBadgesFromState();
        syncReviewBadge(Math.max(0, reviewsPendingCount - 1));
      }
      renderEmailPanel();
      return;
    }

    if (data.event?.automationAckAt) {
      removeReviewAlertBanner(ev.id);
      updateInboxBadgesFromState();
    }
    renderEmailPanel();
    await osAlert({
      title: 'Notification sent',
      bodyHtml: `<p>Let ${escHtml(attendeeFromEmailEvent(ev).name || 'the sender')} know that time is booked.</p>`,
    });
  } catch (err) {
    btn.disabled = false;
    btn.textContent = prevLabel;
    await osAlert({ title: 'Could not complete action', bodyHtml: escHtml(err.message) });
  }
}

function openScheduleFromEmail(ev) {
  const attendee = attendeeFromEmailEvent(ev);
  const notes = [
    ev.subject ? `Re: ${ev.subject}` : '',
    ev.schedulingNote ? `Requested: ${ev.schedulingNote}` : '',
    ev.summary ? ev.summary.slice(0, 200) : '',
  ]
    .filter(Boolean)
    .join('\n');

  const iso = ev.bookingStart || ev.proposedMeetingStart;
  let dateKey;
  let hour;
  let minute;
  if (iso) {
    const d = new Date(iso);
    dateKey = scheduleDateKey(d);
    hour = d.getHours();
    minute = d.getMinutes();
  }

  openScheduleTab({ date: dateKey, view: 'week' });
  void openScheduleCreateDialog({
    dateKey,
    hour,
    minute,
    name: attendee.name,
    email: attendee.email,
    notes,
  });
}

function isMeetingPendingConfirm(ev) {
  return isEmailBooked(ev) && !ev.automationAckAt;
}

async function mountEmailScheduleActions(container, ev) {
  if (!container) return;

  const primaryBtn = container.querySelector('.em-schedule-action-primary');
  const altBtn = container.querySelector('.em-schedule-action-secondary');

  if (container.querySelector('.em-project-match-add')) {
    primaryBtn?.addEventListener('click', () => {
      void confirmSuggestedProjectMatch(
        {
          emailId: ev.id,
          jobSlug: ev.jobSlug,
          jobTitle: ev.jobTitle,
          type: 'project_match',
        },
        primaryBtn,
      );
    });
    altBtn?.addEventListener('click', () => {
      void rejectSuggestedProjectMatch(
        {
          emailId: ev.id,
          type: 'project_match',
        },
        altBtn,
      );
    });
    return;
  }

  if (container.classList.contains('em-schedule-actions-confirm')) {
    primaryBtn?.addEventListener('click', () => {
      const attendee = attendeeFromEmailEvent(ev);
      void confirmScheduledMeeting(
        {
          emailId: ev.id,
          bookingUid: ev.bookingUid,
          bookingStart: ev.bookingStart,
          whenLabel: formatScheduleWhen(ev.bookingStart || ev.proposedMeetingStart),
          attendeeName: attendee.name,
          attendeeEmail: attendee.email,
          from: ev.from,
        },
        primaryBtn,
      );
    });
    altBtn?.addEventListener('click', () => {
      if (ev.bookingUid) openScheduleTab({ uid: ev.bookingUid, view: 'week' });
      else openScheduleFromEmail(ev);
    });
    return;
  }

  if (isEmailBooked(ev)) return;

  altBtn?.addEventListener('click', () => openScheduleFromEmail(ev));

  try {
    const res = await fetch(`/api/email/inbox/${encodeURIComponent(ev.id)}/schedule`, {
      cache: 'no-store',
    });
    const data = await readApiJson(res);
    if (emailState.activeId !== ev.id) return;

    if (!res.ok || !data.check) {
      if (primaryBtn) {
        primaryBtn.hidden = true;
      }
      return;
    }

    if (primaryBtn) {
      primaryBtn.hidden = false;
      primaryBtn.disabled = false;
      const action = data.check.available ? 'accept-notify' : 'notify-conflict';
      primaryBtn.textContent = data.check.available ? 'Confirm' : 'Time slot is booked';
      primaryBtn.dataset.action = action;
      primaryBtn.addEventListener('click', () => {
        void runEmailScheduleAction(ev, action, primaryBtn);
      });
    }
  } catch {
    if (emailState.activeId === ev.id && primaryBtn) primaryBtn.hidden = true;
  }
}

function shouldShowEmailProjectActions(ev) {
  return !ev.jobSlug;
}

function applyEmailEventUpdate(event) {
  const idx = emailState.allEvents.findIndex((e) => e.id === event.id);
  if (idx !== -1) emailState.allEvents[idx] = event;
  if (isEmailProject(event)) emailState.inboxFilter = 'project';
  if (emailState.activeId === event.id && !filteredInboxEvents().some((e) => e.id === event.id)) {
    emailState.activeId = null;
  }
  renderEmailPanel();
  syncInboxAppBadge(emailState.allEvents);
}

async function postEmailProject(ev, payload, opts = {}) {
  const res = await fetch(`/api/email/inbox/${encodeURIComponent(ev.id)}/project`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await readApiJson(res);
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  applyEmailEventUpdate(data.event);
  if (data.slug) {
    if (data.title && !workState.jobs.some((j) => j.slug === data.slug)) {
      workState.jobs.unshift({
        slug: data.slug,
        title: data.title,
        status: 'inquiry',
        client: data.event?.contactName || '',
        contact_name: data.event?.contactName || '',
        contact_uid: data.event?.contactUid || '',
      });
    }
    if (!opts.skipNavigate) {
      navigateToWork(data.slug, { fromEmailId: ev.id });
    }
  }
  return data;
}

async function fetchOpenJobsForEmail(ev) {
  const qs = ev.contactUid ? `?contact_uid=${encodeURIComponent(ev.contactUid)}` : '';
  const res = await fetch(`/api/work${qs}`, { cache: 'no-store' });
  const data = await readApiJson(res);
  return (data.jobs || []).filter(
    (j) => j.status === 'inquiry' || j.status === 'audit' || j.status === 'active',
  );
}

async function runEmailProjectAction(ev, payload, errorTitle) {
  closeEmailHeaderMenus();
  try {
    await postEmailProject(ev, payload);
  } catch (e) {
    await osAlert({ title: errorTitle, bodyHtml: escHtml(e.message) });
  }
}

async function confirmSuggestedProjectMatch(item, btn) {
  const emailId = item?.emailId;
  const slug = item?.jobSlug;
  if (!emailId || !slug) return;
  let ev = emailState.allEvents.find((e) => e.id === emailId);
  if (!ev) {
    setActiveMap('email', { force: true, emailId });
    return;
  }
  const prevLabel = btn?.textContent;
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Adding…';
  }
  try {
    await postEmailProject(ev, { mode: 'link', slug }, { skipNavigate: true });
    removeReviewAlertBanner(emailId);
    updateInboxBadgesFromState();
    if (emailState.activeId === emailId) renderEmailPanel();
  } catch (e) {
    await osAlert({ title: 'Could not add to project', bodyHtml: escHtml(e.message) });
  } finally {
    if (btn) {
      btn.disabled = false;
      if (prevLabel) btn.textContent = prevLabel;
    }
  }
}

async function rejectSuggestedProjectMatch(item, btn) {
  const emailId = item?.emailId;
  if (!emailId) return;
  const prevLabel = btn?.textContent;
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Updating…';
  }
  try {
    const res = await fetch(`/api/email/inbox/${encodeURIComponent(emailId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rejectProjectMatch: true }),
    });
    const data = await readApiJson(res);
    if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
    if (data.event) {
      const idx = emailState.allEvents.findIndex((e) => e.id === emailId);
      if (idx !== -1) emailState.allEvents[idx] = data.event;
    }
    removeReviewAlertBanner(emailId);
    updateInboxBadgesFromState();
    if (emailState.activeId === emailId) renderEmailPanel();
  } catch (e) {
    await osAlert({ title: 'Could not dismiss match', bodyHtml: escHtml(e.message) });
  } finally {
    if (btn) {
      btn.disabled = false;
      if (prevLabel) btn.textContent = prevLabel;
    }
  }
}

async function handleEmailProjectAddNew(ev, triggerEl) {
  closeEmailHeaderMenus();
  if (triggerEl) {
    triggerEl.disabled = true;
    triggerEl.textContent = 'Creating…';
  }
  try {
    await postEmailProject(ev, {
      mode: 'create',
    });
  } catch (e) {
    if (triggerEl) {
      triggerEl.disabled = false;
      triggerEl.textContent = 'Add New';
    }
    await osAlert({ title: 'Could not create project', bodyHtml: escHtml(e.message) });
  }
}

let openEmailProjectMenu = null;

function closeEmailProjectMenu() {
  if (openEmailProjectMenu) {
    openEmailProjectMenu.classList.remove('open');
    openEmailProjectMenu = null;
  }
}

async function populateEmailProjectMenu(ev, menu) {
  menu.innerHTML = '<div class="em-project-menu-empty">Loading…</div>';

  const addNew = document.createElement('button');
  addNew.type = 'button';
  addNew.className = 'em-project-menu-item em-project-menu-item--new';
  addNew.textContent = 'Add New';
  addNew.addEventListener('click', () => handleEmailProjectAddNew(ev, addNew));

  menu.innerHTML = '';
  menu.appendChild(addNew);

  const divider = document.createElement('div');
  divider.className = 'em-project-menu-divider';
  menu.appendChild(divider);

  try {
    const jobs = await fetchOpenJobsForEmail(ev);
    if (!jobs.length) {
      const empty = document.createElement('div');
      empty.className = 'em-project-menu-empty';
      empty.textContent = ev.contactUid
        ? `No open ${postLower(2)} for this contact`
        : `No open ${postLower(2)} yet`;
      menu.appendChild(empty);
      return;
    }
    for (const job of jobs) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'em-project-menu-item';
      item.innerHTML =
        `<span class="em-project-menu-title">${escHtml(job.title)}</span>` +
        `<span class="em-project-menu-meta">${escHtml(workStatusLabel(job.status))}</span>`;
      item.addEventListener('click', async () => {
        item.disabled = true;
        item.querySelector('.em-project-menu-title').textContent = 'Merging…';
        await runEmailProjectAction(
          ev,
          { mode: 'link', slug: job.slug },
          'Could not update project',
        );
      });
      menu.appendChild(item);
    }
  } catch {
    menu.appendChild(Object.assign(document.createElement('div'), {
      className: 'em-project-menu-empty',
      textContent: 'Could not load projects',
    }));
  }
}

function createEmailProjectDropdown(ev) {
  const wrap = document.createElement('div');
  wrap.className = 'em-project-dropdown';

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'em-btn-group-segment em-project-trigger de-btn-secondary';
  trigger.setAttribute('aria-label', 'Project');
  trigger.setAttribute('aria-haspopup', 'menu');
  trigger.innerHTML =
    `<span class="em-project-trigger-icon" aria-hidden="true">${navIcon('briefcase', 16)}</span>` +
    '<span class="em-project-trigger-label">Project</span>' +
    '<span class="em-project-trigger-caret" aria-hidden="true">▾</span>';

  const menu = document.createElement('div');
  menu.className = 'em-project-menu';
  menu.setAttribute('role', 'menu');

  trigger.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (openEmailProjectMenu && openEmailProjectMenu !== wrap) closeEmailProjectMenu();
    if (openEmailAgentMenu) closeEmailAgentMenu();
    const opening = !wrap.classList.contains('open');
    if (opening) await populateEmailProjectMenu(ev, menu);
    wrap.classList.toggle('open', opening);
    openEmailProjectMenu = opening ? wrap : null;
  });

  wrap.appendChild(trigger);
  wrap.appendChild(menu);
  return wrap;
}

document.addEventListener('click', (e) => {
  if (!openEmailProjectMenu && !openEmailAgentMenu) return;
  if (openEmailProjectMenu?.contains(e.target)) return;
  if (openEmailAgentMenu?.contains(e.target)) return;
  closeEmailHeaderMenus();
});

function emailChatExcerpt(ev, max = 500) {
  const snippet = String(ev.bodySnippet || '').trim();
  if (snippet) return snippet.length > max ? `${snippet.slice(0, max)}…` : snippet;
  const text = String(ev.bodyText || '').trim();
  if (text) return text.length > max ? `${text.slice(0, max)}…` : text;
  const summary = String(ev.summary || '').trim();
  if (summary) return summary.length > max ? `${summary.slice(0, max)}…` : summary;
  return '';
}

function buildEmailAgentPrompt(ev) {
  const received = formatEmailWhen(ev.receivedAt) || ev.receivedAt || 'unknown';
  const lines = [
    `From: ${ev.from || '(unknown)'}`,
    `Subject: ${ev.subject || '(no subject)'}`,
    `Received: ${received}`,
  ];
  const excerpt = emailChatExcerpt(ev);
  if (excerpt) lines.push('', excerpt);
  lines.push('', 'Please wait for instructions on how to deal with this email.');
  return lines.join('\n');
}

async function fetchFullEmailRecord(ev) {
  if (!ev?.id) return ev;
  if (ev._fullLoaded && (ev.bodyText || ev.bodyHtml)) return ev;
  try {
    const res = await fetch(`/api/email/inbox/${encodeURIComponent(ev.id)}`, { cache: 'no-store' });
    const data = await readApiJson(res);
    if (!data.event) return ev;
    const full = { ...data.event, _fullLoaded: true };
    const idx = emailState.allEvents.findIndex((e) => e.id === ev.id);
    if (idx !== -1) emailState.allEvents[idx] = full;
    return full;
  } catch {
    return ev;
  }
}

async function askAgentAboutEmail(ev) {
  const full = await fetchFullEmailRecord(ev);
  await askAgentWithPrompt(buildEmailAgentPrompt(full), {
    sourceEmailId: full.id || ev.id,
    sourceJobSlug: full.jobSlug || ev.jobSlug || null,
  });
}

async function createSenderEmailFilterRule(sender, status) {
  const normalized = sender.trim().toLowerCase();
  const statusTag = status === 'DELETE' ? 'DELETE' : 'AUTO_ARCHIVED';
  const verb = statusTag === 'DELETE' ? 'Delete' : 'Archive';
  const res = await fetch('/api/email/rules', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: `${verb}: ${normalized}`,
      status: statusTag,
      description: `Auto-${verb.toLowerCase()} — owner chose from inbox agent menu`,
      phrases: [normalized],
      matchMode: 'any',
      fields: ['from'],
      notify: false,
      enabled: true,
      expiresAt: null,
    }),
  });
  const data = await readApiJson(res);
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data.rule;
}

async function clearEmailTriageLimboIfNeeded(ev, mode) {
  const triageItem = reviewNotificationItemFromEmail(ev);
  if (!triageItem?.awaitingTriage) return ev;
  const res = await fetch(`/api/email/inbox/${encodeURIComponent(ev.id)}/triage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: mode === 'delete' ? 'ignore' : 'expected' }),
  });
  const data = await readApiJson(res);
  if (!res.ok && !data.alreadyResolved) throw new Error(data.error || `HTTP ${res.status}`);
  if (data.event) {
    const idx = emailState.allEvents.findIndex((e) => e.id === ev.id);
    if (idx !== -1) emailState.allEvents[idx] = data.event;
    return data.event;
  }
  return ev;
}

async function runEmailAutoArchive(ev) {
  const sender = parseSenderEmail(ev.from);
  if (!sender || !sender.includes('@')) {
    await osAlert({ title: 'No sender', bodyHtml: 'Could not parse a sender address for this message.' });
    return;
  }
  closeEmailAgentMenu();
  try {
    await createSenderEmailFilterRule(sender, 'AUTO_ARCHIVED');
    const current = await clearEmailTriageLimboIfNeeded(ev, 'archive');
    const res = await fetch(`/api/email/inbox/${encodeURIComponent(current.id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: 'junk', action: 'junk', status: 'JUNK' }),
    });
    const data = await readApiJson(res);
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    applyEmailPatchResult(current.id, data.event);
    showChatToast(`Future mail from ${sender} will auto-archive`);
  } catch (e) {
    await osAlert({ title: 'Could not auto-archive', bodyHtml: escHtml(e.message) });
  }
}

async function runEmailAutoDelete(ev) {
  const sender = parseSenderEmail(ev.from);
  if (!sender || !sender.includes('@')) {
    await osAlert({ title: 'No sender', bodyHtml: 'Could not parse a sender address for this message.' });
    return;
  }
  closeEmailAgentMenu();
  try {
    await createSenderEmailFilterRule(sender, 'DELETE');
    await clearEmailTriageLimboIfNeeded(ev, 'delete');
    await deleteEmail(ev);
    showChatToast(`Future mail from ${sender} will auto-delete`);
  } catch (e) {
    await osAlert({ title: 'Could not auto-delete', bodyHtml: escHtml(e.message) });
  }
}

async function runEmailAgentMenuAction(ev, actionId, itemEl) {
  if (itemEl) itemEl.disabled = true;
  try {
    const full = await fetchFullEmailRecord(ev);
    switch (actionId) {
      case 'auto_archive':
        await runEmailAutoArchive(full);
        break;
      case 'auto_delete':
        await runEmailAutoDelete(full);
        break;
      case 'unsubscribe':
        closeEmailAgentMenu();
        await unsubscribeEmail(full, itemEl);
        break;
      case 'explain':
        closeEmailAgentMenu();
        await askAgentAboutEmail(full);
        break;
      case 'create_project':
        await handleEmailProjectAddNew(full, itemEl);
        break;
      default:
        break;
    }
  } finally {
    if (itemEl) itemEl.disabled = false;
  }
}

let openEmailAgentMenu = null;

function closeEmailAgentMenu() {
  if (openEmailAgentMenu) {
    openEmailAgentMenu.classList.remove('open');
    openEmailAgentMenu = null;
  }
}

function closeEmailHeaderMenus() {
  closeEmailProjectMenu();
  closeEmailAgentMenu();
}

async function populateEmailAgentMenu(ev, menu) {
  menu.innerHTML = '<div class="em-project-menu-empty">Loading…</div>';
  const full = await fetchFullEmailRecord(ev);
  const sender = formatEmailCardFrom(full);
  const senderOk = sender !== '(unknown)' && sender.includes('@');

  menu.innerHTML = '';
  const entries = [
    {
      id: 'auto_archive',
      label: `Auto Archive messages from ${sender}`,
      disabled: !senderOk,
    },
    {
      id: 'auto_delete',
      label: `Auto Delete messages from ${sender}`,
      disabled: !senderOk,
    },
    {
      id: 'unsubscribe',
      label: `Attempt unsubscribe from ${sender}`,
      disabled: !senderOk || !full.unsubscribe?.available,
      hint: !full.unsubscribe?.available ? 'No List-Unsubscribe header' : '',
    },
    { id: 'explain', label: 'Explain to the agent' },
  ];
  if (!full.jobSlug) {
    entries.push({
      id: 'create_project',
      label: `Create new project from ${sender}`,
      disabled: !senderOk,
    });
  }

  for (const entry of entries) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'em-project-menu-item em-agent-menu-item';
    item.setAttribute('role', 'menuitem');
    item.disabled = Boolean(entry.disabled);
    item.title = entry.hint || entry.label;
    item.textContent = entry.label;
    item.addEventListener('click', () => void runEmailAgentMenuAction(full, entry.id, item));
    menu.appendChild(item);
  }
}

function createEmailAgentDropdown(ev, opts = {}) {
  const emailAwaitingTriage = isEmailAwaitingTriage(ev) && reviewNotificationTypeFromEmail(ev);
  const wrap = document.createElement('div');
  wrap.className = 'em-project-dropdown em-agent-dropdown';
  if (opts.standalone) wrap.classList.add('em-agent-dropdown--solo');

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = opts.inGroup
    ? 'em-btn-group-segment em-agent-btn em-agent-trigger de-btn-primary'
    : 'agent-btn em-header-action-btn em-agent-trigger';
  trigger.setAttribute('aria-label', emailAwaitingTriage ? 'Agent triage' : 'Agent');
  trigger.setAttribute('aria-haspopup', 'menu');
  trigger.title = emailAwaitingTriage
    ? 'Agent — triage or explain this message'
    : 'Agent — triage actions for this sender';
  if (emailAwaitingTriage) trigger.classList.add('em-agent-btn--triage');
  trigger.innerHTML =
    `<span class="em-agent-trigger-icon" aria-hidden="true">${navIcon('agent', 16)}</span>` +
    '<span class="em-agent-trigger-caret" aria-hidden="true">▾</span>';

  const menu = document.createElement('div');
  menu.className = 'em-project-menu em-agent-menu';
  menu.setAttribute('role', 'menu');

  trigger.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (openEmailAgentMenu && openEmailAgentMenu !== wrap) closeEmailAgentMenu();
    if (openEmailProjectMenu) closeEmailProjectMenu();
    const opening = !wrap.classList.contains('open');
    if (opening) await populateEmailAgentMenu(ev, menu);
    wrap.classList.toggle('open', opening);
    openEmailAgentMenu = opening ? wrap : null;
  });

  wrap.appendChild(trigger);
  wrap.appendChild(menu);
  return wrap;
}

async function markEmailJunk(ev) {
  closeOpenSwipeRow();
  try {
    const res = await fetch(`/api/email/inbox/${encodeURIComponent(ev.id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: 'junk', action: 'junk', status: 'JUNK' }),
    });
    const data = await readApiJson(res);
    applyEmailPatchResult(ev.id, data.event);
  } catch (e) {
    osAlert({ title: 'Could not mark junk', bodyHtml: escHtml(e.message) });
  }
}

async function requestBulkDeleteEmails(ids) {
  const res = await fetch('/api/email/inbox/bulk-delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  });
  return readApiJson(res);
}

function snapshotEmailsById(ids) {
  return ids
    .map((id) => {
      const idx = emailState.allEvents.findIndex((e) => e.id === id);
      return idx === -1 ? null : { idx, ev: emailState.allEvents[idx] };
    })
    .filter(Boolean);
}

function removeEmailsLocally(events, { pickAdjacent = false } = {}) {
  const idSet = new Set(events.map((ev) => ev.id));
  const wasActive = emailState.activeId && idSet.has(emailState.activeId);
  const nextId =
    pickAdjacent && wasActive && events.length === 1
      ? adjacentEmailIdAfterRemove(events[0].id)
      : null;
  emailState.allEvents = emailState.allEvents.filter((e) => !idSet.has(e.id));
  for (const ev of events) removeEmailRelatedAlertBanners(ev.id);
  if (wasActive) {
    if (nextId && emailState.allEvents.some((e) => e.id === nextId)) {
      emailState.activeId = nextId;
      queueEmailSeen(nextId);
    } else {
      emailState.activeId = null;
    }
  }
  renderEmailPanel();
  syncInboxAppBadge(emailState.allEvents);
}

function restoreEmailsLocally(snapshots, { restoreActiveId = null } = {}) {
  const have = new Set(emailState.allEvents.map((e) => e.id));
  const next = emailState.allEvents.slice();
  for (const snap of snapshots) {
    if (have.has(snap.ev.id)) continue;
    next.splice(Math.min(snap.idx, next.length), 0, snap.ev);
    have.add(snap.ev.id);
  }
  emailState.allEvents = next;
  if (restoreActiveId && emailState.allEvents.some((e) => e.id === restoreActiveId)) {
    emailState.activeId = restoreActiveId;
  }
  renderEmailPanel();
  syncInboxAppBadge(emailState.allEvents);
}

async function bulkDeleteEmails(ids) {
  if (!ids.length) return;
  closeOpenSwipeRow();
  const unique = [...new Set(ids.filter(Boolean))];
  const snapshots = snapshotEmailsById(unique);
  if (!snapshots.length) return;
  const events = snapshots.map((s) => s.ev);
  const wasActive = emailState.activeId && unique.includes(emailState.activeId) ? emailState.activeId : null;
  await queueUndoableDelete({
    key: `delete:emails:${unique.join(',')}`,
    ids: unique.map((id) => `email:${id}`),
    hide: () => removeEmailsLocally(events),
    restore: () => restoreEmailsLocally(snapshots, { restoreActiveId: wasActive }),
    commit: async () => {
      const data = await requestBulkDeleteEmails(unique);
      if (data.deleted < unique.length) {
        osAlert({
          title: 'Partial delete',
          bodyHtml: `<p>Removed ${data.deleted} of ${unique.length} messages. Reload to sync.</p>`,
        });
      }
    },
    onCommitError: (e) => {
      osAlert({ title: 'Delete failed', bodyHtml: escHtml(e.message) });
    },
  });
}

async function bulkArchiveEmails(ids) {
  if (!ids.length) return;
  closeOpenSwipeRow();
  for (const id of ids) {
    const ev = emailState.allEvents.find((e) => e.id === id);
    if (!ev || isEmailRouted(ev)) continue;
    try {
      const patch = { action: 'filed', status: 'FILED' };
      if (ev.category === 'review') patch.category = 'internal';
      const res = await fetch(`/api/email/inbox/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const data = await readApiJson(res);
      if (data.event) {
        const idx = emailState.allEvents.findIndex((e) => e.id === id);
        if (idx !== -1) emailState.allEvents[idx] = data.event;
      }
    } catch {
      /* continue */
    }
  }
  if (emailState.activeId && !filteredInboxEvents().some((e) => e.id === emailState.activeId)) {
    emailState.activeId = null;
  }
  renderEmailPanel();
  syncInboxAppBadge(emailState.allEvents);
}

async function archiveEmail(ev) {
  closeOpenSwipeRow();
  try {
    const patch = { action: 'filed', status: 'FILED' };
    // Leave triage/junk buckets so the message lands in Archive only.
    if (ev.category === 'review' || ev.category === 'junk') patch.category = 'internal';
    const res = await fetch(`/api/email/inbox/${encodeURIComponent(ev.id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const data = await readApiJson(res);
    applyEmailPatchResult(ev.id, data.event);
  } catch (e) {
    osAlert({ title: 'Could not archive', bodyHtml: escHtml(e.message) });
  }
}

async function unarchiveEmail(ev) {
  closeOpenSwipeRow();
  try {
    const res = await fetch(`/api/email/inbox/${encodeURIComponent(ev.id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: 'review', action: 'review', status: 'UNMATCHED' }),
    });
    const data = await readApiJson(res);
    applyEmailPatchResult(ev.id, data.event);
  } catch (e) {
    osAlert({ title: 'Could not unarchive', bodyHtml: escHtml(e.message) });
  }
}

async function restoreAutoDeletedEmail(ev) {
  closeOpenSwipeRow();
  try {
    const res = await fetch(`/api/email/inbox/${encodeURIComponent(ev.id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: 'review', action: 'review', status: 'UNMATCHED' }),
    });
    const data = await readApiJson(res);
    applyEmailPatchResult(ev.id, data.event);
  } catch (e) {
    osAlert({ title: 'Could not keep message', bodyHtml: escHtml(e.message) });
  }
}

function applyEmailPatchResult(id, event) {
  if (!event) return;
  const idx = emailState.allEvents.findIndex((e) => e.id === id);
  if (idx !== -1) emailState.allEvents[idx] = event;
  if (emailState.activeId === id && !filteredInboxEvents().some((e) => e.id === id)) {
    emailState.activeId = null;
  }
  const action = String(event.action || '').toLowerCase();
  if (
    event.category === 'junk' ||
    event.category === 'auto_deleted' ||
    action === 'filed' ||
    action === 'junk' ||
    action === 'deleted'
  ) {
    removeEmailRelatedAlertBanners(id);
  }
  renderEmailPanel();
  syncInboxAppBadge(emailState.allEvents);
}

async function markEmailReceipt(ev) {
  closeOpenSwipeRow();
  const amount = emailMonetaryAmount(ev);
  const routeNote = amount != null ? `Tax receipt — ${formatEmailUsd(amount)}` : 'Tax receipt';
  const classificationAudit = [
    {
      step: 'source',
      decision: 'Manually marked as receipt',
      detail: 'Owner swipe / Receipt action in Email tab',
    },
    amount != null
      ? { step: 'amount', decision: `Extracted ${formatEmailUsd(amount)}` }
      : { step: 'amount', decision: 'No dollar amount detected' },
    {
      step: 'title',
      decision: `Dashboard label: ${routeNote}`,
      detail:
        'Expense-side receipts use the Tax receipt banner for Crater logging — not “Payment of $… from …” income',
    },
    {
      step: 'auto_file',
      decision: 'Filed as receipt',
      detail: 'category=receipt · status=RECEIPT',
    },
  ];
  try {
    const res = await fetch(`/api/email/inbox/${encodeURIComponent(ev.id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category: 'receipt',
        action: 'receipt',
        status: 'RECEIPT',
        routeNote,
        classificationAudit,
      }),
    });
    const data = await readApiJson(res);
    applyEmailPatchResult(ev.id, data.event);
  } catch (e) {
    osAlert({ title: 'Could not file receipt', bodyHtml: escHtml(e.message) });
  }
}

async function unmarkEmailReceipt(ev) {
  closeOpenSwipeRow();
  try {
    const res = await fetch(`/api/email/inbox/${encodeURIComponent(ev.id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category: 'review',
        action: 'review',
        status: 'UNMATCHED',
        routeNote: '',
        classificationAudit: [],
      }),
    });
    const data = await readApiJson(res);
    applyEmailPatchResult(ev.id, data.event);
  } catch (e) {
    osAlert({ title: 'Update failed', bodyHtml: escHtml(e.message) });
  }
}

function renderFindMissingReceiptsBar() {
  const bar = document.createElement('div');
  bar.className = 'em-find-receipts-bar';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'em-find-receipts-btn';
  btn.textContent = 'Find missing receipts';
  btn.title = 'Scan Review and other tabs for tax receipts that were unmarked or mis-filed';
  btn.addEventListener('click', () => void findMissingReceipts());
  bar.appendChild(btn);
  return bar;
}

function showMissingReceiptsDialog(candidates) {
  const backdrop = document.getElementById('os-dialog-backdrop');
  const titleEl = document.getElementById('os-dialog-title');
  const bodyEl = document.getElementById('os-dialog-body');
  const actionsEl = document.getElementById('os-dialog-actions');
  if (!backdrop || !titleEl || !bodyEl || !actionsEl) {
    return Promise.resolve([]);
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      releaseOsDialogKeyboardLayout();
      closeOsDialogBackdrop();
      document.removeEventListener('keydown', onKey);
      resolve(value);
    };

    const onKey = (ev) => {
      if (ev.key === 'Escape') finish([]);
    };

    titleEl.textContent = 'Restore missing receipts';
    bodyEl.innerHTML =
      `<p class="em-receipt-recover-intro">` +
      `${candidates.length} message${candidates.length === 1 ? '' : 's'} look like tax receipts but ${candidates.length === 1 ? 'is' : 'are'} not filed under Receipts. ` +
      `Messages deleted from the inbox log cannot be recovered here — check Proton/Gmail for those.` +
      `</p>` +
      `<div class="em-receipt-pick-list" role="list">` +
      candidates
        .map(
          (c) =>
            `<label class="em-receipt-pick" role="listitem">` +
            `<input type="checkbox" checked data-id="${escHtml(c.id)}" />` +
            `<span class="em-receipt-pick-copy">` +
            `<strong>${escHtml(c.amountLabel)}</strong>` +
            `<span class="em-receipt-pick-meta">${escHtml(formatChatDate(c.receivedAt))} · ${escHtml(parseSenderEmail(c.from) || c.from)}</span>` +
            `<span class="em-receipt-pick-summary">${escHtml(c.summary || c.subject || '(no summary)')}</span>` +
            `<span class="em-receipt-pick-reason">${escHtml(c.reason)}</span>` +
            `</span>` +
            `</label>`,
        )
        .join('') +
      `</div>`;

    actionsEl.innerHTML = '';
    const mkBtn = (label, cls, onClick) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `os-dialog-btn ${cls}`.trim();
      btn.textContent = label;
      btn.addEventListener('click', onClick);
      actionsEl.appendChild(btn);
      return btn;
    };

    mkBtn('Cancel', 'os-dialog-btn--ghost', () => finish([]));
    mkBtn('File selected', 'os-dialog-btn--primary', () => {
      const ids = [...bodyEl.querySelectorAll('input[type="checkbox"]:checked')]
        .map((el) => el.getAttribute('data-id'))
        .filter(Boolean);
      finish(ids);
    });

    openOsDialogBackdrop();
    bindOsDialogDismiss(backdrop, () => finish([]), true);
    document.addEventListener('keydown', onKey);
    bindOsDialogKeyboardLayout();
  });
}

async function findMissingReceipts() {
  closeOpenSwipeRow();
  try {
    const res = await fetch('/api/email/inbox/suggest-receipts?days=30', { cache: 'no-store' });
    const data = await readApiJson(res);
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

    if (!data.candidates?.length) {
      await osAlert({
        title: 'No missing receipts found',
        bodyHtml:
          '<p>No messages in the last 30 days look like tax receipts.</p>' +
          '<p class="em-hint">If you deleted messages from the Receipts tab, they are gone from the inbox log — the originals should still be in Proton/Gmail.</p>',
      });
      return;
    }

    const ids = await showMissingReceiptsDialog(data.candidates);
    if (!ids.length) return;

    const fileRes = await fetch('/api/email/inbox/suggest-receipts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    });
    const fileData = await readApiJson(fileRes);
    if (!fileRes.ok) throw new Error(fileData.error || `HTTP ${fileRes.status}`);

    emailState.inboxFilter = 'receipt';
    emailState.activeId = null;
    emailState.composing = false;
    getEmailPanel()?.classList.remove('em-pane-active');
    await loadEmailTab(true);

    const filedCount = fileData.filed?.length ?? 0;
    await osAlert({
      title: filedCount ? 'Receipts restored' : 'Nothing filed',
      bodyHtml:
        filedCount > 0
          ? `<p>Filed ${filedCount} message${filedCount === 1 ? '' : 's'} under Receipts.</p>`
          : '<p>No messages were updated.</p>',
    });
  } catch (e) {
    await osAlert({ title: 'Receipt scan failed', bodyHtml: escHtml(e.message) });
  }
}

/** Prefer the next (older) message in the current filter; else the previous (newer). */
function adjacentEmailIdAfterRemove(id) {
  const list = filteredInboxEvents();
  const idx = list.findIndex((e) => e.id === id);
  if (idx === -1) return null;
  return list[idx + 1]?.id ?? list[idx - 1]?.id ?? null;
}

async function deleteEmail(ev) {
  if (!ev?.id) return;
  closeOpenSwipeRow();
  const snapshots = snapshotEmailsById([ev.id]);
  const snapshot = snapshots[0] || { idx: emailState.allEvents.length, ev };
  const wasActive = emailState.activeId === ev.id ? ev.id : null;
  await queueUndoableDelete({
    key: `delete:email:${ev.id}`,
    ids: [`email:${ev.id}`],
    hide: () => removeEmailsLocally([snapshot.ev], { pickAdjacent: true }),
    restore: () => restoreEmailsLocally([snapshot], { restoreActiveId: wasActive }),
    commit: async () => {
      const res = await fetch(`/api/email/inbox/${encodeURIComponent(ev.id)}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      await readApiJson(res);
    },
    onCommitError: (e) => {
      osAlert({ title: 'Delete failed', bodyHtml: escHtml(e.message) });
    },
  });
}

async function bulkDeleteInboxCategory(tab) {
  closeOpenSwipeRow();
  const events = inboxEventsForFilter();
  const count = events.length;
  if (count === 0 || tab.id === 'all') return;
  await bulkDeleteEmails(events.map((ev) => ev.id));
}

function isEmailUnseen(ev) {
  return !isHiddenInboxEmail(ev) && !ev.seenAt;
}

/** Dot ids for the current inbox visit — cleared when leaving the email tab. */
let inboxSessionDotIds = new Set();
let emailSeenObserver = null;
let pendingSeenIds = new Set();
let flushSeenTimer = null;

function seedInboxSessionDots() {
  for (const ev of emailState.allEvents) {
    if (isEmailUnseen(ev)) inboxSessionDotIds.add(ev.id);
  }
}

function showEmailNewDot(ev) {
  return inboxSessionDotIds.has(ev.id);
}

function clearInboxSessionDots() {
  void flushPendingEmailSeen();
  inboxSessionDotIds.clear();
  emailSeenObserver?.disconnect();
  emailSeenObserver = null;
}

function mergeEmailSeenFromServer(serverEvents) {
  const byId = new Map((serverEvents || []).map((ev) => [ev.id, ev]));
  for (const local of emailState.allEvents) {
    const remote = byId.get(local.id);
    if (remote?.seenAt) local.seenAt = remote.seenAt;
  }
}

function markEmailSeenLocal(id) {
  const ev = emailState.allEvents.find((e) => e.id === id);
  if (!ev || !isEmailUnseen(ev)) return false;
  ev.seenAt = new Date().toISOString();
  return true;
}

async function flushPendingEmailSeen() {
  flushSeenTimer = null;
  const ids = [...pendingSeenIds];
  pendingSeenIds.clear();
  if (!ids.length) return;
  try {
    await fetch('/api/email/inbox/mark-seen', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    });
  } catch {}
}

function queueEmailSeen(id) {
  if (!id || !markEmailSeenLocal(id)) return;
  pendingSeenIds.add(id);
  updateInboxBadgesFromState();
  clearTimeout(flushSeenTimer);
  flushSeenTimer = setTimeout(() => { void flushPendingEmailSeen(); }, 400);
}

function bindEmailListSeenObserver(listEl) {
  emailSeenObserver?.disconnect();
  emailSeenObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const id = entry.target.dataset.id;
        if (id) queueEmailSeen(id);
      }
    },
    { root: listEl, threshold: 0.55 },
  );
  listEl.querySelectorAll('.em-list-item').forEach((el) => {
    if (el.querySelector('.em-unseen-dot')) emailSeenObserver.observe(el);
  });
}

function createEmailListItem(ev) {
  const summary = ev.summary || ev.bodySnippet || ev.subject || '(no summary)';
  const item = document.createElement('button');
  item.type = 'button';
  item.className =
    'em-list-item' +
    (ev.id === emailState.activeId ? ' active' : '') +
    (isProjectReplyEmail(ev) ? ' em-list-item-urgent' : '');
  item.dataset.id = ev.id;
  item.innerHTML =
    emailListAuthorIconHtml(ev) +
    `<span class="ch-list-content">` +
    `<span class="em-item-row em-item-header">` +
      (showEmailNewDot(ev) ? '<span class="em-unseen-dot" aria-hidden="true"></span>' : '') +
      (isProjectReplyEmail(ev)
        ? '<span class="em-status em-project-reply">Contact reply</span>'
        : `<span class="em-status ${isVerificationCodeEmail(ev) || isAuthLinkEmailRecord(ev) ? 'em-cat-otp' : emailCategoryClass(isEmailProject(ev) ? 'project' : ev.category)}">${escHtml(formatEmailCategoryLabel(ev))}</span>`) +
      (emailMonetaryAmount(ev) && ev.category !== 'receipt'
        ? `<span class="em-status em-money-hint">${escHtml(formatEmailUsd(emailMonetaryAmount(ev)))}</span>`
        : '') +
      (isEmailBooked(ev)
        ? '<span class="em-status em-book-scheduled">Scheduled ✓</span>'
        : isEmailBookable(ev)
          ? '<span class="em-status em-book-pending">Schedule pending</span>'
          : '') +
      (ev.verificationCode
        ? `<span class="em-status em-otp-hint">${escHtml(ev.verificationCode)}</span>`
        : ev.actionUrl
          ? '<span class="em-status em-otp-hint">Activate</span>'
          : '') +
      (Array.isArray(ev.attachments) && ev.attachments.length
        ? `<span class="em-status em-attach-hint" title="${escHtml(
            ev.attachments.map((a) => a.filename || 'file').join(', '),
          )}">${ev.attachments.length} file${ev.attachments.length === 1 ? '' : 's'}</span>`
        : '') +
      `<span class="em-item-date">${escHtml(formatChatDate(ev.receivedAt))}</span>` +
      `<span class="em-item-from">${escHtml(formatEmailCardFrom(ev))}</span>` +
    `</span>` +
    `<span class="em-item-summary">${escHtml(summary)}</span>` +
    `</span>`;
  item.addEventListener('click', (e) => {
    if (e.target.closest('.sidebar-list-author-icon, .list-select-icon')) return;
    const list = item.closest('.ch-list');
    if (list && isListInSelectionMode(list)) return;
    openEmailEvent(ev.id);
  });
  return item;
}

function buildEmailSwipeActions(ev) {
  if (isVerificationCodeEmail(ev)) {
    const actions = [];
    actions.push(swipeAgentAction(() => askAgentAboutEmail(ev)));
    if (ev.verificationCode) {
      actions.push(
        swipeCopyAction({
          onClick: () => void copyEmailVerificationCode(ev.verificationCode, null),
        }),
      );
    }
    actions.push(
      swipeDeleteAction({
        label: 'Delete',
        onClick: () => deleteEmail(ev),
      }),
    );
    return actions;
  }

  if (isAuthLinkEmailRecord(ev)) {
    const actions = [];
    actions.push(swipeAgentAction(() => askAgentAboutEmail(ev)));
    if (ev.actionUrl) {
      actions.push(
        swipeCopyAction({
          label: 'Activate',
          onClick: () => {
            try {
              window.open(String(ev.actionUrl), '_blank', 'noopener,noreferrer');
            } catch {
              /* ignore */
            }
            void deleteEmail(ev);
          },
        }),
      );
    }
    actions.push(
      swipeDeleteAction({
        label: 'Delete',
        onClick: () => deleteEmail(ev),
      }),
    );
    return actions;
  }

  if (isAutoDeletedEmail(ev)) {
    return [
      swipeAgentAction(() => askAgentAboutEmail(ev)),
      swipeClearAction({
        label: 'Keep',
        onClick: () => restoreAutoDeletedEmail(ev),
      }),
      swipeDeleteAction({
        label: 'Delete',
        onClick: () => deleteEmail(ev),
      }),
    ];
  }

  if (isEmailRouted(ev)) {
    return [
      swipeAgentAction(() => askAgentAboutEmail(ev)),
      swipeArchiveAction({
        label: 'Unarchive',
        onClick: () => unarchiveEmail(ev),
      }),
      swipeDeleteAction({
        label: 'Delete',
        onClick: () => deleteEmail(ev),
      }),
    ];
  }

  const actions = [
    swipeAgentAction(() => askAgentAboutEmail(ev)),
    swipeArchiveAction({
      label: 'Archive',
      onClick: () => archiveEmail(ev),
    }),
    swipeDeleteAction({
      label: 'Delete',
      onClick: () => deleteEmail(ev),
    }),
  ];

  if (ev.category === 'receipt') {
    actions.push(
      swipeClearAction({
        label: 'Not receipt',
        onClick: () => unmarkEmailReceipt(ev),
      }),
    );
  }

  actions.push(
    swipeJunkAction({
      label: ev.category === 'junk' ? 'Not junk' : 'Junk',
      onClick: () => {
        if (ev.category === 'junk') {
          fetch(`/api/email/inbox/${encodeURIComponent(ev.id)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ category: 'review', action: 'review', status: 'UNMATCHED' }),
          })
            .then(readApiJson)
            .then((data) => applyEmailPatchResult(ev.id, data.event))
            .catch((err) => osAlert({ title: 'Update failed', bodyHtml: escHtml(err.message) }));
        } else {
          markEmailJunk(ev);
        }
      },
    }),
  );

  if (emailShowsReceiptAction(ev)) {
    actions.push(
      swipeReceiptAction({
        onClick: () => markEmailReceipt(ev),
      }),
    );
  }

  return actions;
}

function createEmailSwipeRow(ev) {
  return createSwipeRow(createEmailListItem(ev), buildEmailSwipeActions(ev), {
    contextMenuTitle: 'This message only',
  });
}

function stopEmailPoll() {
  if (emailPollTimer) {
    clearInterval(emailPollTimer);
    emailPollTimer = null;
  }
}

function emailPanelHasList() {
  return Boolean(getEmailPanel()?.querySelector('.ch-sidebar .ch-list'));
}

/** In-place data refresh — never remount the current view. */
function pollActiveViewQuiet() {
  if (document.hidden || !MAP) return;
  if (MAP.type === 'email' && emailPanelHasList() && !emailState.composing) {
    void loadEmailTab(true);
  }
  if (MAP.type === 'dashboard' && dashboardPanelHasContent()) void refreshInboxBadgeQuiet(true);
}

function syncEmailPoll() {
  stopEmailPoll();
  if (MAP.type === 'email' && !document.hidden) {
    emailPollTimer = setInterval(() => loadEmailTab(true), 45000);
  }
}

async function loadEmailSentEvents(quiet) {
  try {
    const res = await adminFetch('/api/email/sent?limit=200');
    const data = await readAdminJson(res, 'Sent mail');
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    const prev = emailState.sentEvents || [];
    emailState.sentEvents = (data.events || []).map((ev) => {
      const old = prev.find((p) => p.id === ev.id);
      if (!old) return ev;
      return {
        ...ev,
        bodyHtml: old.bodyHtml || ev.bodyHtml,
        bodyText: old.bodyText || ev.bodyText,
        _fullLoaded: old._fullLoaded,
        _bodyLoadFailed: old._bodyLoadFailed,
      };
    });
  } catch (e) {
    if (e.message === 'Session expired') throw e;
    if (!quiet) console.warn('[email] sent fetch failed', e);
  }
}

async function loadEmailDraftEvents(quiet) {
  const activeId = emailState.activeDraftId;
  const activeLocal = activeId
    ? (emailState.draftEvents || []).find((d) => d.id === activeId)
    : null;
  try {
    const res = await adminFetch('/api/email/drafts?limit=200');
    const data = await readAdminJson(res, 'Draft mail');
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    emailState.draftEvents = data.events || [];
    if (activeLocal && emailState.composing) {
      upsertDraftEvent(activeLocal);
    }
  } catch (e) {
    if (e.message === 'Session expired') throw e;
    if (!quiet) console.warn('[email] drafts fetch failed', e);
  }
}

async function switchEmailInboxFilter(nextFilter) {
  await leaveEmailCompose();
  if (emailState.inboxFilter === nextFilter) return;
  emailState.inboxFilter = nextFilter;
  emailState.centerInboxFilterTab = shouldCenterEmailFilterTab(nextFilter);
  emailState.activeId = null;
  getEmailPanel()?.classList.remove('em-pane-active');
  if (nextFilter === 'sent') await loadEmailSentEvents(true);
  if (nextFilter === 'draft') await loadEmailDraftEvents(true);
  if (MAP?.type === 'email') syncAdminTabUrl('email', { emailId: null });
  renderEmailPanel();
}

async function loadEmailTab(quiet) {
  const root = getEmailPanel();
  if (!root) return;
  if (!quiet) mountPanelSkeleton(root, 'list', 'Loading inbox…', { contentSelector: '.em-sidebar' });
  try {
    const [inboxRes] = await Promise.all([
      adminFetch('/api/email/inbox?junk=1&limit=500'),
      loadEmailSentEvents(true),
      loadEmailDraftEvents(true),
      ensureContactAuthorIconsReady(),
    ]);
    const data = await readAdminJson(inboxRes, 'Inbox');
    if (!inboxRes.ok) throw new Error(data.error || `HTTP ${inboxRes.status}`);
    emailState.allEvents = filterHiddenUntilCommit(data.events || [], (e) => `email:${e.id}`);
    for (const id of pendingSeenIds) {
      const ev = emailState.allEvents.find((e) => e.id === id);
      if (ev && !ev.seenAt) ev.seenAt = new Date().toISOString();
    }
    emailState.storage = data.storage || 'files';
    emailState.digest = data.digest || null;
    emailState.pushConfigured = !!data.pushConfigured;
  } catch (e) {
    if (e.message === 'Session expired') return;
    if (!quiet) root.innerHTML = `<div class="de-loading de-error">${escHtml(e.message)}</div>`;
    return;
  }
  if (!quiet) inboxSessionDotIds.clear();
  seedInboxSessionDots();
  const explicitDeepLink = pendingEmailDeepLinkId;
  pendingEmailDeepLinkId = null;
  const deepLinkId =
    explicitDeepLink ||
    (!quiet ? parseEmailDeepLinkFromUrl() || rememberedOpenEmailDraft() : null);
  let openedFromDeepLink = false;
  if (deepLinkId) {
    openedFromDeepLink = await openEmailFromDeepLink(deepLinkId);
  } else if (
    emailState.activeId &&
    !emailState.composing &&
    (emailState.inboxFilter === 'sent'
      ? !filteredSentEvents().some((ev) => ev.id === emailState.activeId)
      : emailState.inboxFilter === 'draft'
        ? !filteredDraftEvents().some((ev) => ev.id === emailState.activeId)
        : !filteredInboxEvents().some((ev) => ev.id === emailState.activeId))
  ) {
    emailState.activeId = null;
  }
  if (!openedFromDeepLink && !emailState.activeId && !emailState.composing) {
    getEmailPanel()?.classList.remove('em-pane-active');
  }
  if (quiet && root.querySelector('.ch-sidebar .ch-list')) {
    refreshEmailSidebarList();
    if (emailState.composing) {
      ensureEmailMobilePaneOpen();
      syncInboxAppBadge(emailState.allEvents);
      return;
    }
    const stillVisible =
      !emailState.activeId ||
      (emailState.inboxFilter === 'sent'
        ? filteredSentEvents().some((ev) => ev.id === emailState.activeId)
        : emailState.inboxFilter === 'draft'
          ? filteredDraftEvents().some((ev) => ev.id === emailState.activeId)
          : filteredInboxEvents().some((ev) => ev.id === emailState.activeId));
    if (stillVisible) {
      renderEmailPanel({ preserveSidebar: true, preservePane: true });
    } else {
      renderEmailPanel({ preserveSidebar: true });
    }
  } else if (emailState.composing && quiet) {
    refreshEmailSidebarList();
  } else {
    renderEmailPanel();
  }
  ensureEmailMobilePaneOpen();
  syncInboxAppBadge(emailState.allEvents);
}

function renderEmailFilterTabs(savedScrollLeft = 0) {
  const counts = inboxTabCounts();
  return mountListFilterTabsWrap({
    scrollTabs: [
      { id: 'all', label: 'All', count: counts.all },
      { id: 'alert', label: 'Alerts', count: counts.alert },
      { id: 'review', label: 'Review', count: counts.review },
      { id: 'book', label: 'Book', count: counts.book },
      { id: 'project', label: postTitle(2), count: counts.project },
      { id: 'routed', label: 'Archive', count: counts.routed },
      { id: 'receipt', label: 'Receipts', count: counts.receipt },
      { id: 'junk', label: 'Junk', count: counts.junk },
      { id: 'auto_deleted', label: 'Auto deleted', count: counts.auto_deleted },
    ],
    fixedTabs: [
      { id: 'draft', label: 'Draft', count: counts.draft, variant: 'draft' },
      { id: 'sent', label: 'Sent', count: counts.sent, variant: 'sent' },
    ],
    activeId: emailState.inboxFilter,
    savedScrollLeft,
    onSelect: (id) => {
      void switchEmailInboxFilter(id);
    },
    activeTabVariant(tab, active) {
      if (!active) return null;
      const canBulkDelete = tab.id !== 'all' && (tab.count ?? 0) > 0;
      const isAllRefresh = tab.id === 'all';
      if (canBulkDelete) {
        return {
          variant: 'purge',
          ariaLabel: `Delete all ${tab.label.toLowerCase()} messages`,
          title: `Delete all ${tab.label.toLowerCase()} messages`,
          onConfirmDelete: () => bulkDeleteInboxCategory(tab),
        };
      }
      if (isAllRefresh) {
        return {
          variant: 'refresh',
          refreshing: emailState.inboxRefreshing,
          ariaLabel: 'Refresh inbox',
          title: 'Check for new mail',
          onClick: () => {
            void refreshEmailInbox();
          },
        };
      }
      return null;
    },
  });
}

function emailCountForActiveTab() {
  const counts = inboxTabCounts();
  return counts[emailState.inboxFilter] ?? counts.all;
}

function emailSidebarEmptyInnerHtml() {
  if (emailState.search.trim()) return 'No matches.';
  if (emailState.inboxFilter === 'sent') {
    return (
      'No outbound emails logged yet.<br><span class="em-hint">Messages you send from Compose or Reply appear here with a delivery reference.</span>'
    );
  }
  if (emailState.inboxFilter === 'draft') {
    return 'No drafts yet.<br><span class="em-hint">Unsent compose messages will appear here.</span>';
  }
  if (emailState.inboxFilter === 'junk') return 'No junk messages.';
  if (emailState.inboxFilter === 'auto_deleted') {
    return 'No automatically deleted messages.<br><span class="em-hint">Mail removed by DELETE rules is kept here so you can confirm nothing was filtered by mistake.</span>';
  }
  if (emailState.inboxFilter === 'alert') return 'No alerts.';
  if (emailState.inboxFilter === 'review') return 'No messages need review.';
  if (emailState.inboxFilter === 'book') return 'No emails with a proposed meeting time.';
  if (emailState.inboxFilter === 'project') {
    return 'No project emails yet. Create or link a project from an inbound message.';
  }
  if (emailState.inboxFilter === 'routed') return 'No archived messages yet.';
  if (emailState.inboxFilter === 'receipt') {
    return 'No tax receipts filed yet. Swipe a message with a dollar amount and tap Receipt.';
  }
  return (
    'No inbound email yet.<br><span class="em-hint">Forward or BCC copies to your Resend address (e.g. ' +
    escHtml(companyBrand().inboundEmailExample || 'inbox@mail.example.com') +
    ').</span>'
  );
}

function fillEmailSidebarList(list) {
  const target = pullRefreshContentRoot(list);
  const isSent = emailState.inboxFilter === 'sent';
  const isDraft = emailState.inboxFilter === 'draft';
  const events = isSent
    ? filteredSentEvents()
    : isDraft
      ? filteredDraftEvents()
      : filteredInboxEvents();
  target.replaceChildren();
  for (const ev of events) {
    target.appendChild(
      isSent ? createSentListItem(ev) : isDraft ? createDraftListItem(ev) : createEmailSwipeRow(ev),
    );
  }
  if (events.length === 0) {
    target.appendChild(createCenteredListEmpty({ innerHtml: emailSidebarEmptyInnerHtml() }));
  }
  if (!isSent && !isDraft) bindEmailListSeenObserver(list);
  resyncListMultiSelect(list);
}

function updateEmailFilterTabCounts(root) {
  const counts = inboxTabCounts();
  root.querySelectorAll('.em-filter-tab[data-filter]').forEach((btn) => {
    const id = btn.dataset.filter;
    if (!id) return;
    if (id === 'all' && emailState.inboxFilter === 'all') return;
    const countEl = btn.querySelector('.em-filter-count');
    if (!countEl) return;
    const count = counts[id] ?? counts.all;
    countEl.textContent = String(count);
  });
}

function refreshEmailSidebarList() {
  const root = getEmailPanel();
  const list = root?.querySelector('.ch-sidebar .ch-list');
  if (!list) {
    renderEmailPanel();
    return;
  }
  const countForTab = emailCountForActiveTab();
  const searchInput = root.querySelector('.panel-list-search');
  if (searchInput instanceof HTMLInputElement) {
    searchInput.placeholder = `Search ${countForTab} ${countForTab === 1 ? 'Email' : 'Emails'}`;
  }
  fillEmailSidebarList(list);
  updateEmailFilterTabCounts(root);
}

function renderEmailSidebar(savedFilterScroll = 0) {
  const sidebar = document.createElement('div');
  sidebar.className = 'ch-sidebar';

  const countForTab = emailCountForActiveTab();
  const subheader = listSearchSubheader({
    itemCount: countForTab,
    search: {
      value: emailState.search,
      placeholder: `Search ${countForTab} ${countForTab === 1 ? 'Email' : 'Emails'}`,
      onInput: (value) => {
        emailState.search = value;
        const visible =
          emailState.inboxFilter === 'sent'
            ? filteredSentEvents()
            : emailState.inboxFilter === 'draft'
              ? filteredDraftEvents()
              : filteredInboxEvents();
        const clearedActive =
          emailState.activeId && !visible.some((ev) => ev.id === emailState.activeId);
        if (clearedActive) {
          emailState.activeId = null;
          emailState.composing = false;
          emailState.activeDraftId = null;
          getEmailPanel()?.classList.remove('em-pane-active');
        }
        renderEmailPanel({ preserveSidebar: true, preservePane: !clearedActive });
      },
    },
    below: renderEmailFilterTabs(savedFilterScroll),
  });

  const isSent = emailState.inboxFilter === 'sent';
  const isDraft = emailState.inboxFilter === 'draft';
  if (subheader) {
    sidebar.appendChild(subheader.el);
    applyEmailFilterTabsScroll(
      subheader.el.querySelector('.em-filter-tabs-wrap'),
      savedFilterScroll,
      emailState.inboxFilter,
      emailState.centerInboxFilterTab,
    );
    emailState.centerInboxFilterTab = false;
  }

  const list = document.createElement('div');
  list.className = 'ch-list';
  bindSwipeListScroll(list);
  if (!isSent && !isDraft) {
    bindListMultiSelect(list, {
      onBulkArchive: bulkArchiveEmails,
      onBulkDelete: bulkDeleteEmails,
    });
  }
  fillEmailSidebarList(list);
  attachIosPullToRefresh(list, () => {
    if (MAP.type !== 'email') return;
    return refreshEmailInbox();
  });
  sidebar.appendChild(list);
  return sidebar;
}

/** Shared inbox reload for pull-to-refresh and the All-tab refresh control. */
async function refreshEmailInbox() {
  if (emailState.inboxRefreshing) return;
  emailState.inboxRefreshing = true;
  const root = getEmailPanel();
  root?.querySelector('.em-filter-tab--refresh')?.classList.add('em-filter-tab--refreshing');
  try {
    await Promise.race([
      loadEmailTab(true),
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Inbox refresh timed out')), 12000);
      }),
    ]);
  } catch (err) {
    console.warn('[email] refresh failed', err);
  } finally {
    emailState.inboxRefreshing = false;
    // loadEmailTab may have rebuilt list rows; clear the All-tab spinner in place.
    const nextRoot = getEmailPanel();
    const allTab = nextRoot?.querySelector('.em-filter-tab--refresh');
    if (allTab) allTab.classList.remove('em-filter-tab--refreshing');
    else renderEmailPanel({ preserveSidebar: true, preservePane: true });
  }
}

function createSentListItem(ev) {
  const item = document.createElement('button');
  item.type = 'button';
  item.className = 'em-list-item em-list-item--sent' + (ev.id === emailState.activeId ? ' active' : '');
  item.dataset.id = ev.id;
  item.innerHTML =
    emailListAuthorIconHtml(ev) +
    `<span class="ch-list-content">` +
    `<span class="em-item-row em-item-header">` +
      `<span class="em-status em-status-sent">${escHtml(formatSentSourceLabel(ev.source))}</span>` +
      `<span class="em-item-date">${escHtml(formatChatDate(ev.sentAt))}</span>` +
      `<span class="em-item-from">${escHtml(ev.toEmail || '(unknown)')}</span>` +
    `</span>` +
    `<span class="em-item-summary">${escHtml(ev.subject || '(no subject)')}</span>` +
    `</span>`;
  item.addEventListener('click', () => openSentEvent(ev.id));
  return item;
}

function openSentEvent(id) {
  emailState.activeId = id;
  emailState.composing = false;
  clearEmailReplyContext();
  syncEmailSidebarActiveState({ scroll: true });
  renderEmailPane();
  ensureEmailMobilePaneOpen();
}

function sentShareText(ev) {
  return [
    ev.subject,
    ev.toEmail,
    ev.resendId ? `Resend ID: ${ev.resendId}` : '',
    ev.sentAt ? `Sent: ${new Date(ev.sentAt).toLocaleString()}` : '',
    ev.bodyText || '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

async function fetchFullSentRecord(ev) {
  if (!ev?.id) return ev;
  if (ev._fullLoaded && (ev.bodyText || ev.bodyHtml)) return ev;
  try {
    const res = await adminFetch(`/api/email/sent/${encodeURIComponent(ev.id)}`);
    const data = await readAdminJson(res, 'Sent mail');
    if (!res.ok || !data.event) {
      return { ...ev, _fullLoaded: true, _bodyLoadFailed: true };
    }
    const full = { ...ev, ...data.event, _fullLoaded: true };
    const idx = (emailState.sentEvents || []).findIndex((e) => e.id === ev.id);
    if (idx !== -1) emailState.sentEvents[idx] = { ...emailState.sentEvents[idx], ...full };
    return full;
  } catch {
    return { ...ev, _fullLoaded: true, _bodyLoadFailed: true };
  }
}

function normalizeEmailRecipient(raw) {
  if (typeof raw === 'string') {
    const email = raw.trim().toLowerCase();
    return email ? { email, name: '', uid: null } : null;
  }
  if (raw && typeof raw === 'object' && raw.email) {
    const email = String(raw.email).trim().toLowerCase();
    if (!email) return null;
    return {
      email,
      name: String(raw.name || '').trim(),
      uid: raw.uid ? String(raw.uid) : null,
    };
  }
  return null;
}

function emailRecipientLabel(r) {
  return r.name || r.email;
}

function draftRecipientSummary(ev) {
  const recipients = (ev.to || []).map(normalizeEmailRecipient).filter(Boolean);
  if (!recipients.length) return '(no recipients)';
  if (recipients.length === 1) return emailRecipientLabel(recipients[0]);
  return `${emailRecipientLabel(recipients[0])} +${recipients.length - 1}`;
}

function createDraftListItem(ev) {
  const item = document.createElement('button');
  item.type = 'button';
  item.className = 'em-list-item em-list-item--sent' + (ev.id === emailState.activeId ? ' active' : '');
  item.dataset.id = ev.id;
  item.innerHTML =
    emailListAuthorIconHtml(ev) +
    `<span class="ch-list-content">` +
    `<span class="em-item-row em-item-header">` +
      `<span class="em-status em-status-sent">Draft</span>` +
      `<span class="em-item-date">${escHtml(formatChatDate(ev.updatedAt || ev.createdAt))}</span>` +
      `<span class="em-item-from">${escHtml(draftRecipientSummary(ev))}</span>` +
    `</span>` +
    `<span class="em-item-summary">${escHtml(ev.subject || '(no subject)')}</span>` +
    `</span>`;
  item.addEventListener('click', () => void openDraftEvent(ev.id));
  return item;
}

function upsertDraftEvent(event) {
  if (!event?.id) return;
  const next = {
    ...event,
    to: (event.to || []).map(normalizeEmailRecipient).filter(Boolean),
    cc: (event.cc || []).map(normalizeEmailRecipient).filter(Boolean),
  };
  const idx = (emailState.draftEvents || []).findIndex((d) => d.id === next.id);
  if (idx !== -1) {
    const current = emailState.draftEvents[idx];
    const currentTs = new Date(current.updatedAt || current.createdAt || 0).getTime();
    const nextTs = new Date(next.updatedAt || next.createdAt || 0).getTime();
    if (nextTs < currentTs) return;
    emailState.draftEvents[idx] = { ...current, ...next };
  } else {
    emailState.draftEvents.unshift(next);
  }
  emailState.draftEvents.sort(
    (a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime(),
  );
}

const EMAIL_DRAFT_RESUME_KEY = 'reave-email-draft';

function rememberOpenEmailDraft(id) {
  try {
    if (id) sessionStorage.setItem(EMAIL_DRAFT_RESUME_KEY, id);
    else sessionStorage.removeItem(EMAIL_DRAFT_RESUME_KEY);
  } catch {}
}

function rememberedOpenEmailDraft() {
  try {
    return sessionStorage.getItem(EMAIL_DRAFT_RESUME_KEY)?.trim() || null;
  } catch {
    return null;
  }
}

function applyDraftToCompose(draft, opts = {}) {
  emailState.activeId = draft.id;
  emailState.activeDraftId = draft.id;
  emailState.composing = true;
  emailState.replyToId = draft.inReplyToEmailId || null;
  emailState.replyMode = opts.replyMode || (draft.inReplyToEmailId ? emailState.replyMode || 'reply' : null);
  emailState.sending = false;
  emailState.compose = {
    to: (draft.to || []).map(normalizeEmailRecipient).filter(Boolean),
    cc: (draft.cc || []).map(normalizeEmailRecipient).filter(Boolean),
    subject: draft.subject || '',
    body: draft.body || '',
  };
}

async function fetchEmailDraftById(id) {
  const local = (emailState.draftEvents || []).find((d) => d.id === id) || null;
  try {
    const res = await adminFetch(`/api/email/drafts/${encodeURIComponent(id)}`);
    const data = await readAdminJson(res, 'Draft');
    if (res.ok && data.event) {
      upsertDraftEvent(data.event);
      return data.event;
    }
  } catch (e) {
    if (e.message === 'Session expired') throw e;
  }
  return local;
}

async function openDraftEvent(id, opts = {}) {
  if (!id) return false;
  if (emailState.composing && emailState.activeDraftId === id) return true;
  if (emailState.composing) await saveActiveEmailDraft(true);
  const draft = await fetchEmailDraftById(id);
  if (!draft) return false;
  emailState.search = '';
  const filterChanged = emailState.inboxFilter !== 'draft';
  emailState.inboxFilter = 'draft';
  emailState.replySourceFull = null;
  applyDraftToCompose(draft, opts);
  if (opts.replyMode === 'reply-all') emailState.replyMode = 'reply-all';
  rememberOpenEmailDraft(id);
  getEmailPanel()?.classList.add('em-pane-active');
  if (MAP?.type === 'email') syncAdminTabUrl('email', { emailId: id });
  if (filterChanged) {
    renderEmailPanel();
  } else {
    syncEmailSidebarActiveState({ scroll: true });
    renderEmailPane();
  }
  syncFooterNav();
  requestAnimationFrame(() => {
    const bodyEl = getEmailPanel()?.querySelector('.em-compose-textarea');
    if (bodyEl) {
      bodyEl.focus();
      bodyEl.setSelectionRange(0, 0);
      bodyEl.scrollTop = 0;
    }
  });
  if (draft.inReplyToEmailId) {
    void fetchFullEmailRecord({ id: draft.inReplyToEmailId }).then((full) => {
      if (emailState.activeDraftId !== id || !emailState.composing || !full?.id) return;
      emailState.replySourceFull = full;
      if (opts.replyMode === 'reply-all') {
        const { to, cc } = buildReplyRecipients(full, 'reply-all');
        emailState.compose.to = to;
        emailState.compose.cc = cc;
        emailState.replyMode = 'reply-all';
      }
      renderEmailPane();
    });
  }
  return true;
}

function isValidEmailAddress(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

let emailToSearchTimer = null;

/** Prevent double-fire from pointerdown + click; select before input blur on touch. */
function bindEmailComposeToOption(btn, handler) {
  let picked = false;
  const run = () => {
    if (picked) return;
    picked = true;
    handler();
    setTimeout(() => {
      picked = false;
    }, 300);
  };
  btn.addEventListener('pointerdown', (ev) => {
    if (ev.pointerType === 'mouse' && ev.button !== 0) return;
    ev.preventDefault();
    run();
  });
  btn.addEventListener('mousedown', (ev) => ev.preventDefault());
  btn.addEventListener('click', (ev) => {
    ev.preventDefault();
    run();
  });
}

/**
 * Multi-recipient To field: client autocomplete + removable chips.
 * Returns { getRecipients, focus }.
 */
function mountEmailToRecipientsPicker(parent, initial, onChange, opts = {}) {
  const disabled = opts.disabled === true;
  let recipients = (Array.isArray(initial) ? initial : [])
    .map(normalizeEmailRecipient)
    .filter(Boolean);
  let highlightIdx = -1;

  const wrap = document.createElement('div');
  wrap.className = 'em-compose-to-wrap';

  const chipsEl = document.createElement('div');
  chipsEl.className = 'em-compose-to-chips';

  const input = document.createElement('input');
  input.id = opts.inputId || 'em-compose-to';
  input.type = 'text';
  input.className = 'em-compose-to-input';
  input.placeholder = 'Search Contacts Or Type An Email…';
  input.autocomplete = 'off';
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-expanded', 'false');
  input.disabled = disabled;

  const dropdown = document.createElement('div');
  dropdown.className = 'em-compose-to-dropdown';
  dropdown.style.display = 'none';
  dropdown.setAttribute('role', 'listbox');

  chipsEl.appendChild(input);
  wrap.appendChild(chipsEl);
  wrap.appendChild(dropdown);
  parent.appendChild(wrap);

  let toHintEl = null;
  let dropdownPointerDown = false;

  dropdown.addEventListener('pointerdown', () => {
    dropdownPointerDown = true;
  });
  dropdown.addEventListener('pointerup', () => {
    dropdownPointerDown = false;
  });
  dropdown.addEventListener('pointercancel', () => {
    dropdownPointerDown = false;
  });

  function syncPlaceholder() {
    input.placeholder = recipients.length ? 'Add Another…' : 'Search Contacts Or Type An Email…';
  }

  function hasRecipient(email) {
    const key = String(email || '').trim().toLowerCase();
    return recipients.some((r) => r.email === key);
  }

  function emitChange() {
    onChange?.(recipients.map((r) => ({ ...r })));
  }

  function addRecipient(recipient) {
    const next = normalizeEmailRecipient(recipient);
    if (!next || hasRecipient(next.email)) return false;
    recipients.push(next);
    renderChips();
    emitChange();
    return true;
  }

  function removeRecipient(email) {
    const key = String(email || '').trim().toLowerCase();
    const before = recipients.length;
    recipients = recipients.filter((r) => r.email !== key);
    if (recipients.length === before) return;
    renderChips();
    emitChange();
  }

  function renderChips() {
    chipsEl.querySelectorAll('.em-compose-to-chip').forEach((el) => el.remove());
    for (const r of recipients) {
      const chip = document.createElement('span');
      chip.className = 'em-compose-to-chip';
      const label = document.createElement('span');
      label.className = 'em-compose-to-chip-label';
      label.textContent = emailRecipientLabel(r);
      label.title = r.email;
      chip.appendChild(label);
      if (!disabled) {
        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'em-compose-to-chip-remove';
        removeBtn.setAttribute('aria-label', `Remove ${emailRecipientLabel(r)}`);
        removeBtn.textContent = '×';
        removeBtn.addEventListener('click', () => {
          removeRecipient(r.email);
          input.focus();
        });
        chip.appendChild(removeBtn);
      }
      chipsEl.insertBefore(chip, input);
    }
    syncPlaceholder();
  }

  function setDropdownOpen(open) {
    dropdown.style.display = open ? 'block' : 'none';
    wrap.classList.toggle('em-compose-to-wrap--open', open);
    input.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (!open) highlightIdx = -1;
  }

  function showToHint(message, warn = false) {
    if (!message) {
      toHintEl?.remove();
      toHintEl = null;
      return;
    }
    if (!toHintEl) {
      toHintEl = document.createElement('p');
      toHintEl.className = 'em-compose-to-hint';
      wrap.insertAdjacentElement('afterend', toHintEl);
    }
    toHintEl.classList.toggle('em-compose-to-hint--warn', warn);
    toHintEl.textContent = message;
  }

  function pickClient(client) {
    const email = String(client?.email || '').trim().toLowerCase();
    if (!email) {
      showToHint(
        `${client?.name || 'This client'} has no email on file. Add one in Contacts, or type an address.`,
        true,
      );
      input.focus();
      return;
    }
    showToHint('');
    addRecipient({
      email,
      name: client.name || '',
      uid: client.uid || null,
    });
    input.value = '';
    setDropdownOpen(false);
    dropdown.innerHTML = '';
    input.focus();
  }

  function renderDropdown(clients, query) {
    showToHint('');
    dropdown.innerHTML = '';
    highlightIdx = -1;
    const q = query.trim();
    if (!clients.length && !q) {
      setDropdownOpen(false);
      return;
    }
    if (!clients.length) {
      const empty = document.createElement('div');
      empty.className = 'em-compose-to-empty';
      empty.textContent = q ? 'No matching contacts.' : 'No contacts yet.';
      dropdown.appendChild(empty);
      if (isValidEmailAddress(q) && !hasRecipient(q)) {
        const addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.className = 'em-compose-to-option em-compose-to-option-add';
        addBtn.textContent = `Use ${q}`;
        bindEmailComposeToOption(addBtn, () => {
          addRecipient({ email: q.toLowerCase(), name: '', uid: null });
          input.value = '';
          showToHint('');
          setDropdownOpen(false);
          dropdown.innerHTML = '';
          input.focus();
        });
        dropdown.appendChild(addBtn);
      }
      setDropdownOpen(true);
      return;
    }
    clients.forEach((c, idx) => {
      const email = String(c.email || '').trim().toLowerCase();
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'em-compose-to-option';
      btn.dataset.idx = String(idx);
      const subline = email
        ? workClientSubline(c)
        : `${workClientSubline(c) || 'No contact details'} · No email on file`;
      btn.innerHTML =
        `${escHtml(c.name || 'Contact')}` +
        `<span class="sub">${escHtml(subline)}</span>`;
      if (!email) {
        btn.classList.add('em-compose-to-option--no-email');
        bindEmailComposeToOption(btn, () => pickClient(c));
      } else if (hasRecipient(email)) {
        btn.disabled = true;
        btn.classList.add('em-compose-to-option--disabled');
      } else {
        bindEmailComposeToOption(btn, () => pickClient(c));
      }
      dropdown.appendChild(btn);
    });
    if (isValidEmailAddress(q) && !hasRecipient(q)) {
      const addBtn = document.createElement('button');
      addBtn.type = 'button';
      addBtn.className = 'em-compose-to-option em-compose-to-option-add';
      addBtn.textContent = `Use ${q}`;
      bindEmailComposeToOption(addBtn, () => {
        addRecipient({ email: q.toLowerCase(), name: '', uid: null });
        input.value = '';
        showToHint('');
        setDropdownOpen(false);
        dropdown.innerHTML = '';
        input.focus();
      });
      dropdown.appendChild(addBtn);
    }
    setDropdownOpen(true);
  }

  async function runSearch() {
    const q = input.value.trim();
    if (!q) {
      try {
        const res = await adminFetch('/api/clients?limit=20');
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        renderDropdown(data.clients || [], '');
        return;
      } catch (e) {
        if (e.message === 'Session expired') return;
        dropdown.innerHTML = `<div class="em-compose-to-empty">${escHtml(e.message)}</div>`;
        setDropdownOpen(true);
      }
      return;
    }
    try {
      const params = new URLSearchParams({ q, limit: '20' });
      const res = await adminFetch(`/api/clients?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      renderDropdown(data.clients || [], q);
    } catch (e) {
      if (e.message === 'Session expired') return;
      dropdown.innerHTML = `<div class="em-compose-to-empty">${escHtml(e.message)}</div>`;
      setDropdownOpen(true);
    }
  }

  function scheduleSearch() {
    clearTimeout(emailToSearchTimer);
    emailToSearchTimer = setTimeout(runSearch, 250);
  }

  function commitTypedRecipient() {
    const raw = input.value.trim().replace(/[,;]+$/, '').trim();
    if (!raw) return false;
    if (!isValidEmailAddress(raw)) return false;
    const added = addRecipient({ email: raw.toLowerCase(), name: '', uid: null });
    if (added) {
      input.value = '';
      setDropdownOpen(false);
      dropdown.innerHTML = '';
    }
    return added;
  }

  function highlightOption(nextIdx) {
    const options = [...dropdown.querySelectorAll('.em-compose-to-option:not(:disabled)')];
    if (!options.length) {
      highlightIdx = -1;
      return;
    }
    highlightIdx = ((nextIdx % options.length) + options.length) % options.length;
    options.forEach((btn, i) => btn.classList.toggle('active', i === highlightIdx));
    options[highlightIdx]?.scrollIntoView({ block: 'nearest' });
  }

  input.addEventListener('focus', () => scheduleSearch());
  input.addEventListener('input', () => scheduleSearch());
  input.addEventListener('blur', () => {
    setTimeout(() => {
      if (dropdownPointerDown) return;
      if (!wrap.contains(document.activeElement)) setDropdownOpen(false);
    }, 150);
  });
  input.addEventListener('keydown', (ev) => {
    const options = [...dropdown.querySelectorAll('.em-compose-to-option:not(:disabled)')];
    if (ev.key === 'ArrowDown') {
      if (dropdown.style.display !== 'none' && options.length) {
        ev.preventDefault();
        highlightOption(highlightIdx + 1);
      }
      return;
    }
    if (ev.key === 'ArrowUp') {
      if (dropdown.style.display !== 'none' && options.length) {
        ev.preventDefault();
        highlightOption(highlightIdx <= 0 ? options.length - 1 : highlightIdx - 1);
      }
      return;
    }
    if (ev.key === 'Enter' || ev.key === 'Tab' || ev.key === ',') {
      if (dropdown.style.display !== 'none' && highlightIdx >= 0 && options[highlightIdx]) {
        ev.preventDefault();
        options[highlightIdx].click();
        return;
      }
      if (ev.key === 'Enter' || ev.key === ',') {
        if (commitTypedRecipient()) ev.preventDefault();
      }
      return;
    }
    if (ev.key === 'Backspace' && !input.value && recipients.length) {
      removeRecipient(recipients[recipients.length - 1].email);
    }
  });

  renderChips();

  return {
    getRecipients: () => recipients.map((r) => ({ ...r })),
    focus: () => input.focus(),
  };
}

function parseEmailAddress(from) {
  const raw = String(from || '').trim();
  const angle = raw.match(/<([^>]+)>/);
  if (angle?.[1]) return angle[1].trim().toLowerCase();
  if (/^[^\s@]+@[^\s@]+$/.test(raw)) return raw.toLowerCase();
  return raw.toLowerCase();
}

function getOwnEmailAddresses() {
  const own = new Set();
  const fromEmail = String(companyBrand().fromEmail || '').trim();
  if (fromEmail) own.add(parseEmailAddress(fromEmail));
  const inbound = String(companyBrand().inboundEmailExample || '').trim();
  if (inbound) own.add(parseEmailAddress(inbound));
  return own;
}

function parseEmailAddressList(addrs) {
  return (Array.isArray(addrs) ? addrs : [])
    .map((addr) => parseEmailAddress(addr))
    .filter(Boolean);
}

function emailRecipientFromAddress(email) {
  const addr = parseEmailAddress(email);
  if (!addr) return null;
  return { email: addr, name: '', uid: null };
}

function buildReplyRecipients(full, mode = 'reply') {
  const own = getOwnEmailAddresses();
  const sender = parseEmailAddress(
    (Array.isArray(full?.replyTo) && full.replyTo[0]) || full?.from || '',
  );
  if (mode !== 'reply-all') {
    return {
      to: sender ? [emailRecipientFromAddress(sender)].filter(Boolean) : [],
      cc: [],
    };
  }

  const toSet = new Set();
  const ccSet = new Set();
  if (sender && !own.has(sender)) toSet.add(sender);
  for (const addr of parseEmailAddressList(full?.to)) {
    if (!own.has(addr)) toSet.add(addr);
  }
  for (const addr of parseEmailAddressList(full?.cc)) {
    if (!own.has(addr) && !toSet.has(addr)) ccSet.add(addr);
  }

  return {
    to: [...toSet].map((email) => emailRecipientFromAddress(email)).filter(Boolean),
    cc: [...ccSet].map((email) => emailRecipientFromAddress(email)).filter(Boolean),
  };
}

function emailHasReplyAllTargets(full) {
  const { to, cc } = buildReplyRecipients(full, 'reply-all');
  return to.length > 1 || cc.length > 0;
}

function setEmailReplyMode(mode) {
  if (!emailState.replyToId || !emailState.replySourceFull) return;
  const nextMode = mode === 'reply-all' ? 'reply-all' : 'reply';
  if (emailState.replyMode === nextMode) return;
  emailState.replyMode = nextMode;
  const { to, cc } = buildReplyRecipients(emailState.replySourceFull, nextMode);
  emailState.compose.to = to;
  emailState.compose.cc = cc;
  renderEmailPanel();
  requestAnimationFrame(() => {
    getEmailPanel()?.querySelector('.em-compose-textarea')?.focus();
  });
}

function clearEmailReplyContext() {
  emailState.replyToId = null;
  emailState.replyMode = null;
  emailState.replySourceFull = null;
}

function buildReplySubjectClient(subject) {
  const s = String(subject || '').trim();
  if (/^re:\s/i.test(s)) return s;
  return `Re: ${s || '(no subject)'}`;
}

function buildReplyQuoteClient(ev) {
  const body = String(ev.bodyText || ev.bodySnippet || '').trim();
  if (!body) return '';
  const when = new Date(ev.receivedAt).toLocaleString();
  const from = ev.from || 'sender';
  const quoted = body.split('\n').map((line) => `> ${line}`).join('\n');
  return `\n\n---\nOn ${when}, ${from} wrote:\n${quoted}`;
}

function isEmailComposeDirty() {
  const { to, cc, subject, body } = emailState.compose;
  return (
    (Array.isArray(to) && to.length > 0) ||
    (Array.isArray(cc) && cc.length > 0) ||
    String(subject || '').trim() ||
    String(body || '').trim()
  );
}

function commitPendingComposeRecipient(input, field) {
  if (!(input instanceof HTMLInputElement)) return;
  const raw = input.value.trim();
  if (!isValidEmailAddress(raw)) return;
  const next = normalizeEmailRecipient(raw);
  if (!next) return;
  const list = Array.isArray(emailState.compose[field]) ? emailState.compose[field] : [];
  if (list.some((r) => r.email === next.email)) return;
  emailState.compose[field] = [...list, next];
  input.value = '';
}

function syncComposeFromDom() {
  const root = getEmailPanel();
  if (!root) return;
  const subjectEl = root.querySelector('#em-compose-subject');
  const bodyEl = root.querySelector('#em-compose-body, .em-compose-textarea');
  const toInput = root.querySelector('#em-compose-to');
  const ccInput = root.querySelector('#em-compose-cc');
  if (subjectEl instanceof HTMLInputElement) emailState.compose.subject = subjectEl.value;
  if (bodyEl instanceof HTMLTextAreaElement) emailState.compose.body = bodyEl.value;
  commitPendingComposeRecipient(toInput, 'to');
  commitPendingComposeRecipient(ccInput, 'cc');
}

let emailDraftSaveTimer = 0;
let emailDraftSaveInFlight = null;

function emailDraftPayload() {
  const { to, cc, subject, body } = emailState.compose;
  return {
    to: (Array.isArray(to) ? to : []).map(normalizeEmailRecipient).filter(Boolean),
    cc: (Array.isArray(cc) ? cc : []).map(normalizeEmailRecipient).filter(Boolean),
    subject: String(subject || '').trim(),
    body: String(body || ''),
    inReplyToEmailId: emailState.replyToId || null,
  };
}

function persistEmailDraftKeepAlive() {
  if (!emailState.composing) return;
  syncComposeFromDom();
  if (!isEmailComposeDirty() && !emailState.activeDraftId) return;
  const payload = JSON.stringify(emailDraftPayload());
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
  const url = emailState.activeDraftId
    ? `/api/email/drafts/${encodeURIComponent(emailState.activeDraftId)}`
    : '/api/email/drafts';
  void fetch(url, {
    method: emailState.activeDraftId ? 'PATCH' : 'POST',
    headers,
    body: payload,
    credentials: 'same-origin',
    keepalive: true,
  }).catch(() => undefined);
}

function scheduleEmailDraftSave() {
  if (emailDraftSaveTimer) window.clearTimeout(emailDraftSaveTimer);
  emailDraftSaveTimer = window.setTimeout(() => {
    emailDraftSaveTimer = 0;
    void saveActiveEmailDraft(true);
  }, 500);
}

function flushScheduledEmailDraftSave() {
  if (emailDraftSaveTimer) {
    window.clearTimeout(emailDraftSaveTimer);
    emailDraftSaveTimer = 0;
  }
}

async function saveActiveEmailDraft(silent = true) {
  if (emailDraftSaveInFlight) await emailDraftSaveInFlight;
  if (!emailState.composing) return true;
  flushScheduledEmailDraftSave();
  syncComposeFromDom();
  if (!isEmailComposeDirty() && !emailState.activeDraftId) return true;
  const payload = emailDraftPayload();
  const pending = (async () => {
    try {
      if (emailState.activeDraftId) {
        const res = await adminFetch(
          `/api/email/drafts/${encodeURIComponent(emailState.activeDraftId)}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          },
        );
        const data = await readAdminJson(res, 'Save draft');
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        upsertDraftEvent(data.event);
      } else {
        const res = await adminFetch('/api/email/drafts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await readAdminJson(res, 'Save draft');
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        emailState.activeDraftId = data.event.id;
        emailState.activeId = data.event.id;
        upsertDraftEvent(data.event);
      }
      if (emailState.composing && MAP?.type === 'email') {
        syncAdminTabUrl('email', { emailId: emailState.activeDraftId });
      }
      if (emailState.composing) rememberOpenEmailDraft(emailState.activeDraftId);
      if (!silent) showChatToast('Draft saved');
      return true;
    } catch (e) {
      if (e.message === 'Session expired') throw e;
      if (!silent) osAlert({ title: 'Could not save draft', bodyHtml: escHtml(e.message) });
      return false;
    }
  })();
  emailDraftSaveInFlight = pending;
  try {
    return await pending;
  } finally {
    if (emailDraftSaveInFlight === pending) emailDraftSaveInFlight = null;
  }
}

async function deleteEmailDraftById(id) {
  if (!id) return;
  try {
    const res = await adminFetch(`/api/email/drafts/${encodeURIComponent(id)}`, { method: 'DELETE' });
    const data = await readAdminJson(res, 'Delete draft');
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    emailState.draftEvents = (emailState.draftEvents || []).filter((d) => d.id !== id);
  } catch (e) {
    if (e.message === 'Session expired') throw e;
    console.warn('[email] draft delete failed', e);
  }
}

async function leaveEmailCompose() {
  if (!emailState.composing) return;
  await saveActiveEmailDraft(true);
  emailState.composing = false;
  clearEmailReplyContext();
  emailState.activeDraftId = null;
  emailState.compose = { to: [], cc: [], subject: '', body: '' };
  emailState.sending = false;
  rememberOpenEmailDraft(null);
}

async function closeEmailCompose(opts = { saveDraft: true }) {
  if (opts.saveDraft) {
    await saveActiveEmailDraft(true);
  } else {
    flushScheduledEmailDraftSave();
  }
  emailState.composing = false;
  clearEmailReplyContext();
  emailState.activeDraftId = null;
  emailState.activeId = null;
  emailState.compose = { to: [], cc: [], subject: '', body: '' };
  emailState.sending = false;
  rememberOpenEmailDraft(null);
  getEmailPanel()?.classList.remove('em-pane-active');
  renderEmailPanel();
  syncFooterNav();
  if (MAP?.type === 'email') syncAdminTabUrl('email', { emailId: null });
}

async function startNewEmail() {
  if (emailState.composing) await saveActiveEmailDraft(true);
  emailState.activeId = null;
  emailState.composing = true;
  clearEmailReplyContext();
  emailState.activeDraftId = null;
  emailState.compose = { to: [], cc: [], subject: '', body: '' };
  emailState.sending = false;
  rememberOpenEmailDraft(null);
  getEmailPanel()?.classList.add('em-pane-active');
  if (MAP?.type === 'email') syncAdminTabUrl('email', { emailId: null });
  renderEmailPanel();
  syncFooterNav();
  requestAnimationFrame(() => {
    getEmailPanel()?.querySelector('.em-compose-to-input')?.focus();
  });
}

async function startReplyEmail(ev, mode = 'reply') {
  if (!ev?.id) return;
  const replyMode = mode === 'reply-all' ? 'reply-all' : 'reply';
  if (emailState.composing) await saveActiveEmailDraft(true);
  if (!(emailState.draftEvents || []).length) await loadEmailDraftEvents(true);
  const existing = (emailState.draftEvents || []).find((d) => d.inReplyToEmailId === ev.id);
  if (existing) {
    await openDraftEvent(existing.id, { replyMode });
    return;
  }
  emailState.activeId = ev.id;
  emailState.composing = true;
  emailState.replyToId = ev.id;
  emailState.replyMode = replyMode;
  emailState.replySourceFull = null;
  emailState.activeDraftId = null;
  emailState.sending = false;
  emailState.compose = { to: [], cc: [], subject: '', body: '' };
  getEmailPanel()?.classList.add('em-pane-active');
  if (MAP?.type === 'email') syncAdminTabUrl('email', { emailId: null });
  renderEmailPanel();
  syncFooterNav();

  const full = await fetchFullEmailRecord(ev);
  if (!emailState.composing || emailState.replyToId !== ev.id) return;
  emailState.replySourceFull = full;
  const { to, cc } = buildReplyRecipients(full, replyMode);
  if (!emailState.compose.to.length) emailState.compose.to = to;
  if (!emailState.compose.cc.length) emailState.compose.cc = cc;
  if (!String(emailState.compose.subject || '').trim()) {
    emailState.compose.subject = buildReplySubjectClient(full.subject);
  }
  if (!String(emailState.compose.body || '').trim()) {
    emailState.compose.body = buildReplyQuoteClient(full);
  }
  renderEmailPanel();
  void saveActiveEmailDraft(true);
  requestAnimationFrame(() => {
    const bodyEl = getEmailPanel()?.querySelector('.em-compose-textarea');
    if (bodyEl) {
      bodyEl.focus();
      bodyEl.setSelectionRange(0, 0);
      bodyEl.scrollTop = 0;
    }
  });
}

async function sendEmailCompose() {
  const { to, cc, subject, body } = emailState.compose;
  const recipients = (Array.isArray(to) ? to : [])
    .map(normalizeEmailRecipient)
    .filter(Boolean);
  const ccRecipients = (Array.isArray(cc) ? cc : [])
    .map(normalizeEmailRecipient)
    .filter(Boolean);
  const toEmails = recipients.map((r) => r.email);
  const ccEmails = ccRecipients.map((r) => r.email);
  const subjectTrim = subject.trim();
  const bodyTrim = body.trim();
  if (!toEmails.length || !subjectTrim || !bodyTrim || emailState.sending) return;

  emailState.sending = true;
  renderEmailPanel();

  try {
    const payload = {
      to: toEmails.length === 1 ? toEmails[0] : toEmails,
      subject: subjectTrim,
      text: bodyTrim,
    };
    if (ccEmails.length) payload.cc = ccEmails.length === 1 ? ccEmails[0] : ccEmails;
    if (emailState.replyToId) payload.inReplyToEmailId = emailState.replyToId;
    const res = await fetch('/api/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await readApiJson(res);
    if (!data.ok) throw new Error(data.error || `HTTP ${res.status}`);
    const replyId = emailState.replyToId;
    const draftId = emailState.activeDraftId;
    emailState.activeDraftId = null;
    emailState.compose = { to: [], cc: [], subject: '', body: '' };
    if (draftId) void deleteEmailDraftById(draftId);
    await closeEmailCompose({ saveDraft: false });
    await loadEmailSentEvents(true);
    if (replyId) {
      try {
        const refresh = await fetch(`/api/email/inbox/${encodeURIComponent(replyId)}`, { cache: 'no-store' });
        const refreshed = await readApiJson(refresh);
        if (refreshed.event) {
          emailState.activeId = replyId;
          applyEmailPatchResult(replyId, refreshed.event);
        }
      } catch {
        await loadEmailTab();
        emailState.activeId = replyId;
        renderEmailPanel();
      }
      showChatToast('Reply sent');
    } else {
      showChatToast('Email sent');
      renderEmailPanel();
    }
  } catch (e) {
    emailState.sending = false;
    renderEmailPanel();
    osAlert({ title: 'Could not send email', bodyHtml: escHtml(e.message) });
  }
}

function emailShareText(ev) {
  return [ev.subject, ev.from, ev.summary || ev.bodySnippet].filter(Boolean).join('\n\n');
}

function emailComposeToLabel() {
  return (Array.isArray(emailState.compose.to) ? emailState.compose.to : [])
    .map(normalizeEmailRecipient)
    .filter(Boolean)
    .map((r) => (r.name ? `${r.name} <${r.email}>` : r.email))
    .join(', ');
}

function splitEmailComposeQuote(body) {
  const text = String(body || '');
  const match = text.match(/\n\n---\nOn .+ wrote:\n/) || text.match(/\n\nOn .+ wrote:\n/);
  if (!match || match.index == null) return { draft: text, quote: '' };
  return { draft: text.slice(0, match.index), quote: text.slice(match.index) };
}

function emailComposeAgentLabelHtml() {
  return `${IOS_ICONS.agent || ''} Write with agent`;
}

function setEmailComposeAgentBusy(btn, busy) {
  if (!btn) return;
  btn.disabled = busy;
  btn.setAttribute('aria-busy', busy ? 'true' : 'false');
  btn.innerHTML = busy ? 'Writing…' : emailComposeAgentLabelHtml();
}

async function writeEmailComposeWithAgent(btn) {
  if (emailState.sending) return;
  const root = getEmailPanel();
  const subjectEl = root?.querySelector('#em-compose-subject');
  const bodyEl = root?.querySelector('.em-compose-textarea');
  if (subjectEl instanceof HTMLInputElement) emailState.compose.subject = subjectEl.value;
  if (bodyEl instanceof HTMLTextAreaElement) emailState.compose.body = bodyEl.value;
  const source = emailState.replySourceFull;
  const { draft, quote } = splitEmailComposeQuote(emailState.compose.body);
  setEmailComposeAgentBusy(btn, true);
  try {
    const res = await adminFetch('/api/admin/compose-draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: 'email',
        to: emailComposeToLabel(),
        subject: emailState.compose.subject,
        currentBody: draft.trim(),
        incoming: source
          ? {
              from: source.from || source.fromName || '',
              subject: source.subject || '',
              body: source.bodyText || source.bodySnippet || '',
            }
          : undefined,
      }),
    });
    const data = await readAdminJson(res, 'compose-draft');
    if (!data.ok) throw new Error(data.error || `HTTP ${res.status}`);
    const nextBody = String(data.draft?.body || '').trim();
    if (!nextBody) throw new Error('The agent did not return any copy.');
    if (data.draft?.subject && !emailState.replyToId) {
      emailState.compose.subject = String(data.draft.subject);
      if (subjectEl instanceof HTMLInputElement) subjectEl.value = emailState.compose.subject;
    }
    emailState.compose.body = quote ? `${nextBody}${quote}` : nextBody;
    if (bodyEl instanceof HTMLTextAreaElement) {
      bodyEl.value = emailState.compose.body;
      bodyEl.focus();
      bodyEl.setSelectionRange(0, nextBody.length);
    }
    void saveActiveEmailDraft(true);
    showChatToast('Draft ready — review before sending');
  } catch (e) {
    if (e instanceof Error && e.message === 'Session expired') return;
    await osAlert({ title: 'Could not write draft', bodyHtml: escHtml(e.message) });
  } finally {
    setEmailComposeAgentBusy(btn, false);
  }
}

function renderEmailComposePane(pane) {
  const composeTitle = emailState.replyToId
    ? emailState.replyMode === 'reply-all'
      ? 'Reply all'
      : 'Reply'
    : 'New message';
  pane.appendChild(
    createPaneHeader({
      back: { label: 'Back to inbox', onClick: () => void closeEmailCompose() },
      title: composeTitle,
    }).root,
  );

  const form = document.createElement('div');
  form.className = 'em-compose';

  const toField = document.createElement('div');
  toField.className = 'em-compose-field';
  const toHead = document.createElement('div');
  toHead.className = 'em-compose-field-head';
  const toLabel = document.createElement('label');
  toLabel.className = 'em-compose-label';
  toLabel.setAttribute('for', 'em-compose-to');
  toLabel.textContent = 'To';
  toHead.appendChild(toLabel);
  if (
    emailState.replyToId &&
    emailState.replySourceFull &&
    emailHasReplyAllTargets(emailState.replySourceFull)
  ) {
    const isReplyAll = emailState.replyMode === 'reply-all';
    const nextMode = isReplyAll ? 'reply' : 'reply-all';
    const nextLabel = isReplyAll ? 'Reply' : 'Reply all';
    const modeToggle = document.createElement('button');
    modeToggle.type = 'button';
    modeToggle.className = 'em-reply-mode-pill';
    modeToggle.setAttribute('aria-label', `Switch to ${nextLabel.toLowerCase()}`);
    modeToggle.innerHTML = `<span class="em-reply-mode-pill-icon" aria-hidden="true">${
      IOS_ICONS[nextMode === 'reply-all' ? 'reply-all' : 'reply'] || ''
    }</span><span class="em-reply-mode-pill-label">${nextLabel}</span>`;
    modeToggle.addEventListener('click', () => {
      setEmailReplyMode(nextMode);
    });
    toHead.appendChild(modeToggle);
  }
  toField.appendChild(toHead);
  mountEmailToRecipientsPicker(
    toField,
    emailState.compose.to,
    (next) => {
      emailState.compose.to = next;
      scheduleEmailDraftSave();
    },
    { disabled: emailState.sending },
  );

  const ccField = document.createElement('div');
  ccField.className = 'em-compose-field';
  ccField.innerHTML = '<label class="em-compose-label" for="em-compose-cc">Cc</label>';
  mountEmailToRecipientsPicker(
    ccField,
    emailState.compose.cc,
    (next) => {
      emailState.compose.cc = next;
      scheduleEmailDraftSave();
    },
    { disabled: emailState.sending, inputId: 'em-compose-cc' },
  );

  const subjectField = document.createElement('div');
  subjectField.className = 'em-compose-field';
  subjectField.innerHTML = '<label class="em-compose-label" for="em-compose-subject">Subject</label>';
  const subjectInput = document.createElement('input');
  subjectInput.id = 'em-compose-subject';
  subjectInput.type = 'text';
  subjectInput.className = 'em-compose-input';
  subjectInput.placeholder = 'Subject';
  subjectInput.value = emailState.compose.subject;
  subjectInput.disabled = emailState.sending;
  subjectInput.addEventListener('input', () => {
    emailState.compose.subject = subjectInput.value;
    scheduleEmailDraftSave();
  });
  subjectField.appendChild(subjectInput);

  const bodyField = document.createElement('div');
  bodyField.className = 'em-compose-field';
  const bodyHead = document.createElement('div');
  bodyHead.className = 'em-compose-field-head';
  const bodyLabel = document.createElement('label');
  bodyLabel.className = 'em-compose-label';
  bodyLabel.setAttribute('for', 'em-compose-body');
  bodyLabel.textContent = 'Message';
  const writeBtn = document.createElement('button');
  writeBtn.type = 'button';
  writeBtn.className = 'em-compose-agent';
  writeBtn.disabled = emailState.sending;
  writeBtn.innerHTML = emailComposeAgentLabelHtml();
  writeBtn.addEventListener('click', () => void writeEmailComposeWithAgent(writeBtn));
  bodyHead.appendChild(bodyLabel);
  bodyHead.appendChild(writeBtn);
  bodyField.appendChild(bodyHead);
  const bodyInput = document.createElement('textarea');
  bodyInput.id = 'em-compose-body';
  bodyInput.className = 'em-compose-textarea';
  bodyInput.placeholder = 'Write your message…';
  bodyInput.value = emailState.compose.body;
  bodyInput.disabled = emailState.sending;
  bodyInput.addEventListener('input', () => {
    emailState.compose.body = bodyInput.value;
    scheduleEmailDraftSave();
  });
  bodyField.appendChild(bodyInput);

  const hint = document.createElement('p');
  hint.className = 'em-compose-hint';
  hint.textContent = emailState.replyToId
    ? emailState.replyMode === 'reply-all'
      ? 'Reply all includes everyone on the original message except your own addresses. The message is marked handled after send.'
      : 'Reply is sent in the same thread when the original message ID is available. The message is marked handled after send.'
    : 'Sent via Resend using your configured outbound address.';

  const actions = document.createElement('div');
  actions.className = 'em-compose-actions';
  const sendBtn = document.createElement('button');
  sendBtn.type = 'button';
  sendBtn.className = 'em-compose-send';
  sendBtn.setAttribute('aria-label', emailState.sending ? 'Sending…' : 'Send');
  sendBtn.title = emailState.sending ? 'Sending…' : 'Send';
  sendBtn.innerHTML = IOS_ICONS.send || '';
  sendBtn.disabled = emailState.sending;
  sendBtn.addEventListener('click', () => void sendEmailCompose());

  actions.appendChild(sendBtn);
  form.appendChild(toField);
  form.appendChild(ccField);
  form.appendChild(subjectField);
  form.appendChild(bodyField);
  form.appendChild(hint);
  form.appendChild(actions);
  pane.appendChild(form);
}

function fallbackCopyText(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  ta.setSelectionRange(0, text.length);
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  ta.remove();
  return ok;
}

async function clipboardLooksLike(text) {
  if (!navigator.clipboard?.readText) return null;
  try {
    return (await navigator.clipboard.readText()) === text;
  } catch {
    return null;
  }
}

function hideOtpCopyOverlay() {
  const root = document.getElementById('admin-otp-copy-overlay');
  if (root) root.hidden = true;
}

function ensureOtpCopyOverlay() {
  let root = document.getElementById('admin-otp-copy-overlay');
  if (root) return root;
  root = document.createElement('div');
  root.id = 'admin-otp-copy-overlay';
  root.className = 'admin-otp-copy-overlay';
  root.hidden = true;
  root.innerHTML =
    `<div class="admin-otp-copy-card" role="dialog" aria-modal="true" aria-labelledby="admin-otp-copy-title">` +
    `<p class="admin-otp-copy-kicker">Verification code</p>` +
    `<h2 id="admin-otp-copy-title">Tap Copy code</h2>` +
    `<p class="admin-otp-copy-code" id="admin-otp-copy-code"></p>` +
    `<p class="admin-otp-copy-status" id="admin-otp-copy-status">Tap Copy code to put it on the clipboard.</p>` +
    `<button type="button" class="admin-otp-copy-btn" id="admin-otp-copy-btn">Copy code</button>` +
    `<p class="admin-otp-copy-hint">Then paste on this phone or your laptop.</p>` +
    `</div>`;
  const closeBtn = createIosIconBtn({
    iconKey: 'x',
    label: 'Close',
    className: 'admin-otp-copy-close',
    onClick: () => hideOtpCopyOverlay(),
  });
  root.querySelector('.admin-otp-copy-card')?.prepend(closeBtn);
  root.querySelector('#admin-otp-copy-btn')?.addEventListener('click', async () => {
    const code = String(root.dataset.code || '').trim();
    if (!code) return;
    const ok = await copyEmailVerificationCode(code, null, { fromPrompt: true });
    const status = root.querySelector('#admin-otp-copy-status');
    const btn = root.querySelector('#admin-otp-copy-btn');
    if (status) {
      status.textContent = ok
        ? 'Copied — paste on this phone or your laptop'
        : 'Copy failed — long-press the code instead';
    }
    if (btn) btn.textContent = ok ? 'Copied' : 'Copy code';
  });
  document.body.appendChild(root);
  return root;
}

/** Always show the code + a real tap target. Silent clipboard writes fail on iOS. */
function showOtpCopyOverlay(code) {
  const text = String(code || '').trim();
  if (!text) return;
  const root = ensureOtpCopyOverlay();
  root.dataset.code = text;
  const codeEl = root.querySelector('#admin-otp-copy-code');
  const status = root.querySelector('#admin-otp-copy-status');
  const btn = root.querySelector('#admin-otp-copy-btn');
  if (codeEl) codeEl.textContent = text;
  if (status) {
    status.textContent = 'Tap Copy code to put it on the clipboard.';
  }
  if (btn) btn.textContent = 'Copy code';
  root.hidden = false;
}

/** One-tap fallback when iOS blocks clipboard writes without a fresh gesture. */
async function promptCopyOtpCode(code) {
  const text = String(code || '').trim();
  if (!text) return false;
  showOtpCopyOverlay(text);
  return false;
}

async function copyEmailVerificationCode(code, nearEl, opts = {}) {
  const text = String(code || '').trim();
  if (!text) return false;
  let wrote = false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      wrote = true;
    }
  } catch {
    wrote = false;
  }
  if (!wrote) wrote = fallbackCopyText(text);
  // iOS often resolves writeText without updating the clipboard when there was no
  // user gesture (e.g. auto-copy on open). Refuse to claim success if we can tell.
  const verified = await clipboardLooksLike(text);
  if (!wrote || verified === false) {
    if (opts.preferPromptOnFail && !opts.fromPrompt) return promptCopyOtpCode(text);
    if (!opts.fromPrompt && !opts.quietFail) showChatToast('Tap the code to copy', nearEl);
    return false;
  }
  if (nearEl) showCopyButtonFeedback(nearEl);
  else showChatToast('Copied — ready to paste', nearEl);
  return true;
}

function whenDocumentFocused(timeoutMs = 1500) {
  if (!document.hidden && document.hasFocus()) return Promise.resolve();
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', onVis);
      resolve();
    };
    const onVis = () => {
      if (!document.hidden) finish();
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onVis);
    window.focus();
    setTimeout(finish, timeoutMs);
  });
}

async function clearPendingOtpCopyStash() {
  try {
    const cache = await caches.open('reave-otp-v1');
    await cache.delete('/pending-otp-copy');
  } catch {
    /* ignore */
  }
}

let otpCopyInFlightCode = '';
let otpCopyInFlightTimer = 0;

async function handleOtpCopyFromPush(data) {
  const code = String(data?.code || '').trim();
  if (!code) return;
  if (otpCopyInFlightCode === code) return;
  otpCopyInFlightCode = code;
  if (otpCopyInFlightTimer) clearTimeout(otpCopyInFlightTimer);
  otpCopyInFlightTimer = window.setTimeout(() => {
    otpCopyInFlightCode = '';
    otpCopyInFlightTimer = 0;
  }, 2500);
  // Write first. Cache I/O or a focus wait before writeText drops the
  // notification gesture, so the code never lands on the clipboard.
  let ok = await copyEmailVerificationCode(code, null, {
    preferPromptOnFail: false,
    quietFail: true,
  });
  void clearPendingOtpCopyStash();
  if (ok) {
    hideOtpCopyOverlay();
    return;
  }
  await whenDocumentFocused(800);
  ok = await copyEmailVerificationCode(code, null, { preferPromptOnFail: true });
  if (!ok) showOtpCopyOverlay(code);
}

async function handleOtpDeleteFromPush(data) {
  const emailId = String(data?.emailId || '').trim();
  const alertId = String(data?.alertId || '').trim();
  if (emailId) {
    let ev = emailState.allEvents.find((e) => e.id === emailId);
    if (!ev) ev = { id: emailId, verificationCode: data?.code || null };
    await deleteEmail(ev);
    return;
  }
  if (alertId) await dismissPushAlertById(alertId).catch(() => undefined);
}

/** Cold-start path: SW stashes the code before openWindow. */
async function consumePendingOtpCopy() {
  const fromLaunch = String(launchOtpCopy.code || '').trim();
  if (fromLaunch) {
    launchOtpCopy.code = '';
    launchOtpCopy.wanted = false;
    await handleOtpCopyFromPush({ code: fromLaunch });
    return;
  }
  try {
    const cache = await caches.open('reave-otp-v1');
    const res = await cache.match('/pending-otp-copy');
    if (!res) return;
    const data = await res.json();
    await cache.delete('/pending-otp-copy');
    if (!data?.code) return;
    if (data.t && Date.now() - Number(data.t) > 120_000) return;
    await handleOtpCopyFromPush(data);
  } catch {
    /* ignore */
  }
}

function openEmailEvent(id) {
  const list = getEmailPanel()?.querySelector('.ch-sidebar .ch-list');
  if (list && isListInSelectionMode(list)) return;
  if (emailState.composing) {
    void saveActiveEmailDraft(true).then(() => {
      emailState.composing = false;
      emailState.activeDraftId = null;
      rememberOpenEmailDraft(null);
      clearEmailReplyContext();
      openEmailEvent(id);
    });
    return;
  }
  queueEmailSeen(id);
  emailState.activeId = id;
  emailState.composing = false;
  emailState.activeDraftId = null;
  clearEmailReplyContext();
  syncEmailSidebarActiveState({ scroll: true });
  renderEmailPane();
  ensureEmailMobilePaneOpen();
  if (MAP?.type === 'email') syncAdminTabUrl('email', { emailId: id });
}

function syncEmailSidebarActiveState(opts = {}) {
  const { scroll = false } = opts;
  const root = getEmailPanel();
  if (!root) return;
  let activeEl = null;
  root.querySelectorAll('.ch-sidebar .em-list-item, .ch-sidebar .ch-list-item').forEach((el) => {
    const isActive = el.dataset.id === emailState.activeId;
    el.classList.toggle('active', isActive);
    if (isActive) {
      el.setAttribute('aria-current', 'page');
      activeEl = el;
    } else {
      el.removeAttribute('aria-current');
    }
  });
  if (scroll && activeEl) {
    const list = root.querySelector('.ch-sidebar .ch-list');
    if (list) {
      requestAnimationFrame(() => scrollSidebarListItemIntoView(list, activeEl));
    }
  }
}

function clearEmailDetailSelection() {
  exitEmailLabMode({ silent: true });
  emailState.activeId = null;
  emailState.composing = false;
  emailState.activeDraftId = null;
  getEmailPanel()?.classList.remove('em-pane-active');
  syncEmailSidebarActiveState();
  renderEmailPane();
  if (MAP?.type === 'email') syncAdminTabUrl('email', { emailId: null });
}

function normalizeEmailLabPhrase(raw) {
  return String(raw || '').replace(/\s+/g, ' ').trim();
}

function isEmailLabModeFor(ev) {
  return Boolean(emailState.labMode && ev?.id && emailState.labEmailId === ev.id);
}

function exitEmailLabMode(opts = {}) {
  emailState.labMode = false;
  emailState.labEmailId = null;
  emailState.labPhrases = [];
  emailState.labCreating = false;
  emailState.labDetail = null;
  if (opts.silent) return;
  if (emailState.activeId && getEmailPanel()?.querySelector('.ch-pane')) {
    renderEmailPane();
  }
}

function stripEmailLabFieldPrefix(text, field) {
  const label = field === 'from' ? 'From' : field === 'subject' ? 'Subject' : '';
  if (!label) return text;
  const stripped = String(text || '').replace(new RegExp(`^${label}\\s*[:\\s]\\s*`, 'i'), '').trim();
  return stripped || text;
}

function isLabHighlightAdjustment(prev, next) {
  if (!prev || !next || prev === next) return false;
  return next.startsWith(prev) || prev.startsWith(next) || next.endsWith(prev) || prev.endsWith(next);
}

function clearEmailLabSelections() {
  try {
    document.getSelection()?.removeAllRanges();
  } catch {
    /* ignore */
  }
  const frame = emailState.labDetail?.querySelector('.em-detail-body-frame');
  if (!(frame instanceof HTMLIFrameElement)) return;
  try {
    frame.contentDocument?.getSelection()?.removeAllRanges();
  } catch {
    /* sandbox */
  }
}

function addEmailLabPhrase(text, field) {
  const phrase = normalizeEmailLabPhrase(stripEmailLabFieldPrefix(text, field));
  if (phrase.length < 2) return false;
  const last = emailState.labPhrases[emailState.labPhrases.length - 1];
  if (last && last.field === field) {
    const prev = last.text.toLowerCase();
    const next = phrase.toLowerCase();
    if (prev === next) return false;
    // Same gesture growing/shrinking — prefix/suffix only (not any substring).
    if (isLabHighlightAdjustment(prev, next)) {
      last.text = phrase;
      refreshEmailLabBar();
      clearEmailLabSelections();
      return true;
    }
  }
  const dup = emailState.labPhrases.some(
    (p) => p.text.toLowerCase() === phrase.toLowerCase() && p.field === field,
  );
  if (dup) return false;
  emailState.labPhrases.push({ text: phrase, field });
  refreshEmailLabBar();
  clearEmailLabSelections();
  return true;
}

function labFieldForTarget(node, detail) {
  const el = node instanceof Element ? node : node?.parentElement;
  if (!el || !detail?.contains(el)) return null;
  if (el.closest('.em-from-value, .em-from-client')) return 'from';
  if (el.closest('.em-detail-subject, .em-subject-value')) return 'subject';
  if (el.closest('.em-to-value, .em-detail-body, .em-detail-body-html, .em-detail-summary')) {
    return 'body';
  }
  return null;
}

function selectionFromContext(winOrDoc) {
  if (!winOrDoc) return null;
  const doc = winOrDoc.nodeType === 9 ? winOrDoc : winOrDoc.document || null;
  // Prefer Document.getSelection — iframe windows without allow-scripts often
  // expose a window whose getSelection() is empty or missing.
  if (doc && typeof doc.getSelection === 'function') return doc.getSelection();
  if (typeof winOrDoc.getSelection === 'function') return winOrDoc.getSelection();
  return null;
}

function captureLabWindowSelection(winOrDoc, field, detail) {
  if (!emailState.labMode) return false;
  const sel = selectionFromContext(winOrDoc);
  if (!sel || sel.isCollapsed) return false;
  const resolved = field || labFieldForTarget(sel.anchorNode, detail);
  if (!resolved) return false;
  return addEmailLabPhrase(sel.toString(), resolved);
}

let labSelecting = false;
let labCommitTimer = 0;
let labDocSelectionBound = false;

function captureIframeLabSelection() {
  const frame = emailState.labDetail?.querySelector('.em-detail-body-frame');
  if (!(frame instanceof HTMLIFrameElement)) return false;
  try {
    const doc = frame.contentDocument;
    if (!doc || iframeDocLooksEmpty(doc)) return false;
    return captureLabWindowSelection(doc, 'body');
  } catch {
    return false;
  }
}

function captureAllLabSelections() {
  if (!emailState.labMode || labSelecting) return;
  const detail = emailState.labDetail;
  if (detail) captureLabWindowSelection(document, null, detail);
  captureIframeLabSelection();
}

function refreshEmailLabBar(bar = getEmailPanel()?.querySelector('[data-email-lab-bar]')) {
  if (!bar) return;
  const hint = bar.querySelector('.em-lab-bar-hint');
  if (hint) {
    hint.textContent = emailState.labPhrases.length
      ? 'Add more phrases, or create the rule.'
      : 'Select the text to target.';
  }
  const list = bar.querySelector('[data-email-lab-chips]');
  if (list) {
    list.replaceChildren();
    list.hidden = emailState.labPhrases.length === 0;
    emailState.labPhrases.forEach((p, i) => {
      const li = document.createElement('li');
      li.className = 'em-lab-chip';
      const label = document.createElement('span');
      const fieldLabel = p.field === 'from' ? 'From' : p.field === 'subject' ? 'Subject' : 'Body';
      label.textContent = `(${fieldLabel}: ${p.text})`;
      const rm = document.createElement('button');
      rm.type = 'button';
      rm.className = 'em-lab-chip-rm';
      rm.innerHTML = iosIcon('x', 12);
      rm.setAttribute('aria-label', `Remove “${p.text}”`);
      rm.addEventListener('click', () => {
        emailState.labPhrases.splice(i, 1);
        refreshEmailLabBar(bar);
      });
      li.append(label, rm);
      list.appendChild(li);
    });
  }
  const createBtn = bar.querySelector('[data-email-lab-create]');
  if (createBtn) createBtn.disabled = emailState.labPhrases.length === 0 || emailState.labCreating;
}

function enableEmailLabSelectionStyles(doc) {
  if (!doc) return;
  const host = doc.head || doc.documentElement;
  if (!host || doc.getElementById('em-lab-select-style')) return;
  const style = doc.createElement('style');
  style.id = 'em-lab-select-style';
  style.textContent =
    'html, body, body * { -webkit-user-select: text !important; user-select: text !important; }';
  host.appendChild(style);
}

function labEventOnChrome(ev) {
  const el = ev?.target instanceof Element ? ev.target : null;
  return Boolean(el?.closest('button, input, textarea, select, .em-lab-bar'));
}

function markLabSelecting(ev) {
  if (!emailState.labMode) return;
  if (labEventOnChrome(ev)) return;
  const el = ev?.target instanceof Element ? ev.target : null;
  const detail = emailState.labDetail;
  const fromIframe = ev?.currentTarget && ev.currentTarget !== document;
  if (!fromIframe && detail && el && !detail.contains(el)) return;
  labSelecting = true;
  window.clearTimeout(labCommitTimer);
}

function commitLabSelectionNow() {
  if (labSelecting || !emailState.labMode) return;
  captureAllLabSelections();
}

function finishLabSelecting(opts = {}) {
  const wasSelecting = labSelecting;
  labSelecting = false;
  window.clearTimeout(labCommitTimer);
  if (!wasSelecting && labEventOnChrome(opts.event)) return;
  const delay = Number(opts.delay) || 0;
  if (delay) {
    labCommitTimer = window.setTimeout(commitLabSelectionNow, delay);
    return;
  }
  commitLabSelectionNow();
}

function onLabKeyUp(ev) {
  if (!emailState.labMode || labSelecting) return;
  const key = String(ev.key || '');
  if (
    key === 'Shift' ||
    key.startsWith('Arrow') ||
    key === 'a' ||
    key === 'A' ||
    key === 'End' ||
    key === 'Home'
  ) {
    finishLabSelecting();
  }
}

function bindEmailLabReleaseListeners(target) {
  const flagEl = target?.documentElement || target;
  if (!flagEl || flagEl.dataset?.emailLabReleaseBound === '1') return;
  flagEl.dataset.emailLabReleaseBound = '1';
  target.addEventListener('pointerdown', markLabSelecting);
  target.addEventListener('mousedown', markLabSelecting);
  target.addEventListener('pointerup', (ev) => finishLabSelecting({ event: ev }));
  target.addEventListener('mouseup', (ev) => finishLabSelecting({ event: ev }));
  target.addEventListener('touchend', (ev) => finishLabSelecting({ event: ev, delay: 80 }));
}

function bindEmailLabDocument(doc) {
  if (!doc?.documentElement) return;
  enableEmailLabSelectionStyles(doc);
  if (doc.documentElement.dataset.emailLabBound === '1') return;
  doc.documentElement.dataset.emailLabBound = '1';
  bindEmailLabReleaseListeners(doc);
  doc.addEventListener(
    'click',
    (ev) => {
      if (!emailState.labMode) return;
      const a = ev.target instanceof Element ? ev.target.closest('a') : null;
      if (!a) return;
      ev.preventDefault();
      ev.stopPropagation();
    },
    true,
  );
}

function bindEmailLabDom(el) {
  if (!(el instanceof HTMLElement) || el.dataset.emailLabBound === '1') return;
  el.dataset.emailLabBound = '1';
}

function bindEmailLabDetail(detail) {
  if (!(detail instanceof HTMLElement)) return;
  emailState.labDetail = detail;
  if (!labDocSelectionBound) {
    labDocSelectionBound = true;
    document.addEventListener('pointerdown', markLabSelecting);
    document.addEventListener('mousedown', markLabSelecting);
    document.addEventListener('pointerup', (ev) => finishLabSelecting({ event: ev }));
    document.addEventListener('mouseup', (ev) => finishLabSelecting({ event: ev }));
    document.addEventListener('touchend', (ev) => finishLabSelecting({ event: ev, delay: 80 }));
    document.addEventListener('keyup', onLabKeyUp);
  }
  if (detail.dataset.emailLabDetailBound === '1') return;
  detail.dataset.emailLabDetailBound = '1';
}

function iframeDocLooksEmpty(doc) {
  if (!doc?.body) return true;
  const href = String(doc.URL || doc.location?.href || '');
  const blank = href.includes('about:blank') || href.includes('about:srcdoc');
  return blank && doc.body.childNodes.length === 0;
}

function mountEmailLabFrame(frame) {
  if (!(frame instanceof HTMLIFrameElement)) return;
  if (frame.dataset.emailLabFrameBound === '1') {
    try {
      if (frame.contentDocument && !iframeDocLooksEmpty(frame.contentDocument)) {
        bindEmailLabDocument(frame.contentDocument, 'body');
      }
    } catch {
      /* sandbox */
    }
    return;
  }
  frame.dataset.emailLabFrameBound = '1';
  const bindFrame = () => {
    try {
      const doc = frame.contentDocument;
      if (!doc || iframeDocLooksEmpty(doc)) return;
      bindEmailLabDocument(doc, 'body');
    } catch {
      /* opaque origin — sandbox needs allow-same-origin in lab mode */
    }
  };
  frame.addEventListener('load', bindFrame);
  bindFrame();
  window.setTimeout(bindFrame, 0);
  window.setTimeout(bindFrame, 200);
  window.setTimeout(bindFrame, 600);
}

function mountEmailLabSelection(detail) {
  if (!detail) return;
  bindEmailLabDetail(detail);
  bindEmailLabDom(detail.querySelector('.em-detail-body'), 'body');
  bindEmailLabDom(detail.querySelector('.em-detail-summary'), 'body');
  bindEmailLabDom(detail.querySelector('.em-from-value'), 'from');
  bindEmailLabDom(detail.querySelector('.em-to-value'), 'body');
  bindEmailLabDom(detail.querySelector('.em-detail-subject'), 'subject');
  bindEmailLabDom(detail.querySelector('.em-subject-value'), 'subject');
  mountEmailLabFrame(detail.querySelector('.em-detail-body-frame'));
}

function renderEmailLabBar() {
  const bar = document.createElement('div');
  bar.className = 'em-lab-bar';
  bar.dataset.emailLabBar = '1';
  const hint = document.createElement('p');
  hint.className = 'em-lab-bar-hint';
  hint.textContent = 'Select the text to target.';
  const list = document.createElement('ul');
  list.className = 'em-lab-bar-chips';
  list.dataset.emailLabChips = '1';
  const actions = document.createElement('div');
  actions.className = 'em-lab-bar-actions';
  const createBtn = document.createElement('button');
  createBtn.type = 'button';
  createBtn.className = 'de-btn de-btn-primary';
  createBtn.dataset.emailLabCreate = '1';
  createBtn.textContent = 'Create Rule';
  createBtn.disabled = true;
  createBtn.addEventListener('click', () => void createRuleFromEmailLab());
  const doneBtn = document.createElement('button');
  doneBtn.type = 'button';
  doneBtn.className = 'de-btn de-btn-secondary';
  doneBtn.textContent = 'Done';
  doneBtn.addEventListener('click', () => exitEmailLabMode());
  actions.append(createBtn, doneBtn);
  bar.append(hint, list, actions);
  refreshEmailLabBar(bar);
  return bar;
}

function enterEmailLabMode(ev) {
  if (!ev?.id) return;
  emailState.labMode = true;
  emailState.labEmailId = ev.id;
  emailState.labPhrases = [];
  emailState.labCreating = false;
  if (emailState.activeId === ev.id) renderEmailPane();
}

function openEmailLabIntro(ev) {
  const backdrop = document.getElementById('email-lab-intro-backdrop');
  if (!backdrop || !window.IosSheet?.open) {
    enterEmailLabMode(ev);
    return;
  }
  let started = false;
  const begin = backdrop.querySelector('[data-email-lab-begin]');
  const onBegin = (e) => {
    e.preventDefault();
    e.stopPropagation();
    started = true;
    window.IosSheet.close('email-lab-intro-backdrop');
    enterEmailLabMode(ev);
  };
  begin?.addEventListener('click', onBegin, { once: true });
  window.IosSheet.open('email-lab-intro-backdrop', {
    onClose: () => {
      if (!started) begin?.removeEventListener('click', onBegin);
    },
  });
}

function createEmailLabBtn(ev) {
  const active = isEmailLabModeFor(ev);
  return createIosIconBtn({
    iconKey: 'flask',
    label: active ? 'Exit Email Lab' : 'Email Lab',
    className:
      'ios-icon-btn em-header-action-btn em-lab-btn' + (active ? ' is-active' : ''),
    onClick: () => {
      closeEmailHeaderMenus();
      if (isEmailLabModeFor(ev)) {
        exitEmailLabMode();
        return;
      }
      openEmailLabIntro(ev);
    },
  });
}

async function createRuleFromEmailLab() {
  const labId = emailState.labEmailId;
  const ev =
    emailState.allEvents.find((e) => String(e.id) === String(labId)) ||
    emailState.allEvents.find((e) => String(e.id) === String(emailState.activeId));
  const phrases = emailState.labPhrases.map((p) => p.text).filter(Boolean);
  if (!phrases.length || emailState.labCreating) return;
  if (!ev) {
    await osAlert({
      title: 'Could not create rule',
      bodyHtml: 'This email is no longer in the inbox list.',
    });
    return;
  }
  const fields = [...new Set(emailState.labPhrases.map((p) => p.field))];
  emailState.labCreating = true;
  refreshEmailLabBar();
  const createBtn = getEmailPanel()?.querySelector('[data-email-lab-create]');
  if (createBtn) {
    createBtn.disabled = true;
    createBtn.textContent = 'Creating…';
  }
  try {
    const rule = await startNewRule({
      title: phrases[0].length > 48 ? `${phrases[0].slice(0, 47)}…` : phrases[0],
      status: 'DELETE',
      scope: 'personal',
      description: '',
      phrases,
      exceptPhrases: [],
      matchMode: phrases.length > 1 ? 'all' : 'any',
      fields: fields.length ? fields : ['body'],
      notify: false,
      notifyPush: false,
      notifyDashboard: false,
      notifyActions: ['view', 'archive'],
      enabled: true,
      expiresAt: null,
    });
    if (!rule) {
      emailState.labCreating = false;
      refreshEmailLabBar();
      if (createBtn) createBtn.textContent = 'Create Rule';
      return;
    }
    const full = await fetchFullEmailRecord(ev);
    exitEmailLabMode({ silent: true });
    await openRulesLabWithEmail(full, { run: true });
  } catch (e) {
    emailState.labCreating = false;
    refreshEmailLabBar();
    const btn = getEmailPanel()?.querySelector('[data-email-lab-create]');
    if (btn) btn.textContent = 'Create Rule';
    await showKeywordCollisionAlert(e, {
      onOpenRule: async (id) => {
        const full = ev ? await fetchFullEmailRecord(ev) : null;
        exitEmailLabMode({ silent: true });
        await openRulesLabWithRule(id, full ? { email: full, run: true } : {});
      },
    });
  }
}

function renderEmailPane() {
  const root = getEmailPanel();
  if (!root) return;
  if (!root.querySelector('.ch-sidebar')) {
    renderEmailPanel();
    return;
  }

  root.querySelector('.ch-pane')?.remove();

  const pane = document.createElement('div');
  pane.className = 'ch-pane';

  if (emailState.composing) {
    renderEmailComposePane(pane);
    root.appendChild(pane);
    root.classList.add('em-pane-active');
    syncFooterNav();
    return;
  }

  if (emailState.inboxFilter === 'sent') {
    const sent = (emailState.sentEvents || []).find((e) => e.id === emailState.activeId);
    if (!sent) {
      appendEmptyDetailPane(pane, {
        mapKey: 'email',
        iconName: 'mail',
        bodyHtml:
          '<p>Select a sent message to see what went out.</p>' +
          '<p class="em-hint">Outbound mail sent from Compose, Reply, or share flows is logged here with the message body and a Resend reference when available.</p>',
        btnLabel: 'Compose',
        onCreate: () => startNewEmail(),
        extra: buildEmailDashboardLinkGrid(),
      });
      root.appendChild(pane);
      root.classList.remove('em-pane-active');
      syncFooterNav();
      return;
    }

    pane.appendChild(
      createPaneHeader({
        back: {
          label: 'Back to sent',
          onClick: () => clearEmailDetailSelection(),
        },
        title: sent.subject || '(no subject)',
        icons: [
          paneShareIcon({
            label: 'Share sent details',
            onClick: (btn) => shareChatText(sentShareText(sent), 'assistant', btn),
          }),
        ],
      }).root,
    );

    const detail = document.createElement('div');
    detail.className = 'em-detail';
    const bodyHtmlSource = String(sent.bodyHtml || '').trim();
    const plainBody = String(sent.bodyText || '').trim();
    let detailHtml =
      `<div class="em-item-row"><span class="em-status em-status-sent">${escHtml(formatSentSourceLabel(sent.source))}</span></div>` +
      `<div class="em-detail-meta">` +
        `<span><strong>To</strong> ${escHtml(sent.toEmail || '(unknown)')}</span>` +
        (sent.jobTitle || sent.jobSlug
          ? `<span class="em-detail-project"><strong>Project</strong> <button type="button" class="project-link-chip em-project-link">${escHtml(sent.jobTitle || sent.jobSlug)}</button></span>`
          : '') +
        `<span><strong>Sent</strong> ${escHtml(new Date(sent.sentAt).toLocaleString())}</span>` +
        (sent.resendId
          ? `<span><strong>Resend ID</strong> <code class="em-resend-id">${escHtml(sent.resendId)}</code></span>`
          : '') +
      `</div>`;
    if (bodyHtmlSource) {
      detailHtml +=
        `<div class="em-detail-body-html"><iframe class="em-detail-body-frame" sandbox="allow-popups allow-popups-to-escape-sandbox" title="Sent message"></iframe></div>`;
    } else if (plainBody) {
      detailHtml += `<div class="em-detail-body">${linkifyPlainText(plainBody)}</div>`;
    } else if (sent._bodyLoadFailed) {
      detailHtml += `<p class="em-hint">Could not load the sent message body.</p>`;
    } else if (!sent._fullLoaded) {
      detailHtml += `<p class="em-hint em-sent-body-loading">Loading the message that was sent…</p>`;
    } else {
      detailHtml += `<div class="em-detail-body em-detail-body-empty">(no body text)</div>`;
    }
    if (sent.resendId) {
      detailHtml +=
        `<p class="em-hint">Use the Resend ID to confirm delivery in your Resend dashboard when troubleshooting.</p>`;
    }
    detail.innerHTML = detailHtml;
    const projectBtn = detail.querySelector('.em-project-link');
    if (projectBtn && sent.jobSlug) {
      projectBtn.addEventListener('click', () => {
        setActiveMap('work', { force: true, workSlug: sent.jobSlug });
      });
    }
    const bodyFrame = detail.querySelector('.em-detail-body-frame');
    if (bodyFrame && bodyHtmlSource) {
      bodyFrame.srcdoc = bodyHtmlSource;
    }
    if (!sent._fullLoaded) {
      void fetchFullSentRecord(sent).then((full) => {
        if (emailState.inboxFilter === 'sent' && emailState.activeId === full.id) renderEmailPane();
      });
    }
    pane.appendChild(detail);
    root.appendChild(pane);
    root.classList.add('em-pane-active');
    syncFooterNav();
    return;
  }

  const ev = emailState.allEvents.find((e) => e.id === emailState.activeId);
  if (!ev) {
    appendEmptyDetailPane(pane, {
      mapKey: 'email',
      iconName: 'mail',
      bodyHtml:
        '<p>Select a message or compose a new one.</p>' +
        '<p class="em-hint">Inbound mail arrives via Resend — forward or BCC to your receiving address.</p>',
      btnLabel: 'Compose',
      onCreate: () => startNewEmail(),
      extra: buildEmailDashboardLinkGrid(),
    });
    root.appendChild(pane);
    root.classList.remove('em-pane-active');
    syncFooterNav();
    return;
  }

  if (emailState.labMode && emailState.labEmailId !== ev.id) {
    emailState.labMode = false;
    emailState.labEmailId = null;
    emailState.labPhrases = [];
    emailState.labCreating = false;
  }

  const beforeIcons = [createEmailLabBtn(ev)];
  const linkedChat = chatState.threads.find((t) => t.source_email_id === ev.id);
  const alreadyInLinkedChat = linkedChat && chatState.activeId === linkedChat.id;
  // Always offer triage — including false-positive "verification code" mail —
  // so the user can junk/route/explain instead of being stuck with only Copy/Delete.
  if (!alreadyInLinkedChat) {
    if (shouldShowEmailProjectActions(ev)) {
      const group = document.createElement('div');
      group.className = 'em-btn-group brand-btn-pair';
      group.appendChild(createEmailAgentDropdown(ev, { inGroup: true }));
      group.appendChild(createEmailProjectDropdown(ev));
      beforeIcons.push(group);
    } else {
      beforeIcons.push(createEmailAgentDropdown(ev, { standalone: true }));
    }
  } else if (shouldShowEmailProjectActions(ev)) {
    beforeIcons.push(createEmailProjectDropdown(ev));
  }

  pane.appendChild(
    createPaneHeader({
      back: {
        label: 'Back to inbox',
        onClick: () => clearEmailDetailSelection(),
      },
      title: ev.subject || '(no subject)',
      beforeIcons,
      icons: buildEmailDetailHeaderIcons(ev),
    }).root,
  );

  const detail = document.createElement('div');
  detail.className = 'em-detail' + (isEmailLabModeFor(ev) ? ' em-detail--lab' : '');
  const summaryText = emailDetailSummaryText(ev);
  const projectLabel = ev.jobTitle || ev.jobSlug;
  let detailHtml =
    `<div class="em-item-row">` +
    `<span class="em-status ${isProjectReplyEmail(ev) ? 'em-project-reply' : emailCategoryClass(isEmailProject(ev) ? 'project' : ev.category)}">${escHtml(formatEmailCategoryLabel(ev))}</span>` +
    (projectLabel && (isEmailProject(ev) || isProjectReplyEmail(ev) || isProjectMatchSuggested(ev))
      ? emailProjectContextHtml(ev)
      : '') +
    (isEmailBooked(ev) ? '<span class="em-status em-book-scheduled">Scheduled ✓</span>' : '') +
    `</div>`;
  if (ev.verificationCode) {
    const expiryHtml = ev.deleteAfterAt
      ? `Auto-deletes in <span class="admin-otp-countdown em-otp-countdown" data-otp-expires="${escHtml(ev.deleteAfterAt)}">—</span> · `
      : '';
    const otpTitle = (() => {
      const summary = String(ev.summary || '').trim();
      const fromSummary = summary.match(/^([^:]+):\s*\d/);
      if (fromSummary?.[1]) return fromSummary[1].trim();
      return 'Verification code';
    })();
    detailHtml +=
      `<div class="em-otp-card" data-otp-card>` +
        `<div class="em-otp-card-title">${escHtml(otpTitle)}</div>` +
        `<button type="button" class="em-otp-code-btn" data-otp-code data-code="${escHtml(ev.verificationCode)}">${escHtml(ev.verificationCode)}</button>` +
        `<p class="em-otp-hint">${expiryHtml}Tap the code to copy — switch back to your browser and tap <strong>Paste</strong> above the keyboard.</p>` +
      `</div>`;
    syncOtpCountdownTimers();
  } else if (isAuthLinkEmailRecord(ev)) {
    const expiryHtml = ev.deleteAfterAt
      ? `Auto-deletes in <span class="admin-otp-countdown em-otp-countdown" data-otp-expires="${escHtml(ev.deleteAfterAt)}">—</span> · `
      : '';
    const authTitle = (() => {
      const summary = String(ev.summary || '').trim();
      const stripped = summary.replace(/\s*[—–-]\s*tap Activate\s*$/i, '').trim();
      if (stripped) return stripped;
      return 'Activation link';
    })();
    const activateBtn = ev.actionUrl
      ? `<button type="button" class="em-otp-code-btn em-auth-activate-btn" data-auth-activate data-url="${escHtml(ev.actionUrl)}">Activate</button>`
      : '';
    detailHtml +=
      `<div class="em-otp-card" data-otp-card>` +
        `<div class="em-otp-card-title">${escHtml(authTitle)}</div>` +
        activateBtn +
        `<p class="em-otp-hint">${expiryHtml}Tap Activate to open the sign-in link — the email is deleted afterward.</p>` +
      `</div>`;
    syncOtpCountdownTimers();
  }
  if (isEmailBookable(ev)) {
    const whenLabel =
      ev.bookingStart || ev.proposedMeetingStart
        ? formatScheduleWhen(ev.bookingStart || ev.proposedMeetingStart)
        : ev.schedulingNote || 'Meeting time pending';
    detailHtml +=
      `<div class="em-book-card">` +
        `<div class="em-book-card-title">${isEmailBooked(ev) ? 'Meeting scheduled' : 'Meeting requested'}</div>` +
        `<div class="em-book-card-when">${escHtml(whenLabel)}</div>` +
        (ev.schedulingNote && (ev.bookingStart || ev.proposedMeetingStart)
          ? `<div class="em-book-card-note">${escHtml(ev.schedulingNote)}</div>` : '') +
        (isEmailBooked(ev) && ev.bookingUid
          ? `<div class="em-hint">Cal.com booking · ${escHtml(ev.bookingUid.slice(0, 8))}…</div>`
          : '') +
      `</div>`;
  }
  detailHtml +=
    (summaryText ? `<div class="em-detail-summary">${linkifyPlainText(summaryText)}</div>` : '');
  if (isMeetingPendingConfirm(ev)) {
    detailHtml +=
      `<div class="em-schedule-actions em-schedule-actions-confirm">` +
        `<button type="button" class="em-schedule-action-primary de-btn de-btn-primary">Confirm</button>` +
        `<button type="button" class="em-schedule-action-secondary de-btn de-btn-secondary">Reschedule</button>` +
      `</div>`;
  } else if (isProjectMatchSuggested(ev)) {
    const matchProjectName = ev.jobTitle || ev.jobSlug || postTitle(1);
    const attachmentCount = Array.isArray(ev.attachments) ? ev.attachments.length : 0;
    const attachmentHint =
      attachmentCount > 0
        ? `${attachmentCount} attachment${attachmentCount === 1 ? '' : 's'} will be added to ${matchProjectName}.`
        : 'No attachments on this message.';
    const projectChip = ev.jobSlug
      ? `<button type="button" class="project-link-chip em-project-link">${escHtml(matchProjectName)}</button>`
      : `<span>${escHtml(matchProjectName)}</span>`;
    detailHtml +=
      `<div class="em-book-card em-project-match-card">` +
        `<div class="em-book-card-title">Possible ${escHtml(postLower(1))} match</div>` +
        `<div class="em-book-card-project">` +
          `<strong>${escHtml(postTitle(1))}</strong> ${projectChip}` +
        `</div>` +
        `<div class="em-book-card-note">Add this email's content to <strong>${escHtml(matchProjectName)}</strong>? ${escHtml(attachmentHint)}</div>` +
      `</div>` +
      `<div class="em-schedule-actions em-schedule-actions-confirm">` +
        `<button type="button" class="em-schedule-action-primary de-btn de-btn-primary em-project-match-add">Add to ${escHtml(postLower(1))}</button>` +
        `<button type="button" class="em-schedule-action-secondary de-btn de-btn-secondary em-project-match-reject">Not this ${escHtml(postLower(1))}</button>` +
      `</div>`;
  } else if (isEmailSchedulingRequest(ev) && !isEmailBooked(ev)) {
    detailHtml +=
      `<div class="em-schedule-actions">` +
        `<button type="button" class="em-schedule-action-primary de-btn de-btn-primary" disabled>Checking availability…</button>` +
        `<button type="button" class="em-schedule-action-secondary de-btn de-btn-secondary">Suggest alternate time</button>` +
      `</div>`;
  }
  detailHtml +=
    `<div class="em-detail-meta">` +
      emailDetailFromHtml(ev) +
      (inboxToAddresses(ev).length
        ? `<span><strong>To</strong> <span class="em-to-value">${escHtml(inboxToAddresses(ev).join(', '))}</span></span>`
        : '') +
      `<span class="em-detail-subject"><strong>Subject</strong> <span class="em-subject-value">${escHtml(ev.subject || '(no subject)')}</span></span>` +
      `<span><strong>Received</strong> ${escHtml(new Date(ev.receivedAt).toLocaleString())}</span>` +
    `</div>`;
  const auditHtml = emailDetailClassificationHtml(ev);
  if (auditHtml) detailHtml += `<div class="em-detail-audit">${auditHtml}</div>`;
  const attachments = Array.isArray(ev.attachments) ? ev.attachments : [];
  if (attachments.length) {
    detailHtml +=
      `<div class="em-detail-attachments">` +
        `<div class="em-detail-attachments-title">${attachments.length} attachment${attachments.length === 1 ? '' : 's'}</div>` +
        `<ul class="em-detail-attachments-list">` +
        attachments
          .map((a) => {
            const name = a.filename || 'attachment';
            const size =
              typeof a.size === 'number' && a.size > 0
                ? a.size < 1024
                  ? `${a.size} B`
                  : a.size < 1024 * 1024
                    ? `${(a.size / 1024).toFixed(a.size < 10240 ? 1 : 0)} KB`
                    : `${(a.size / (1024 * 1024)).toFixed(1)} MB`
                : '';
            const href = `/api/email/inbox/${encodeURIComponent(ev.id)}/attachments/${encodeURIComponent(a.id)}`;
            return (
              `<li class="em-detail-attachment">` +
                `<a class="em-detail-attachment-link" href="${escHtml(href)}" download="${escHtml(name)}">` +
                  `<span class="em-detail-attachment-name">${escHtml(name)}</span>` +
                  (size || a.contentType
                    ? `<span class="em-detail-attachment-meta">${escHtml(
                        [a.contentType, size].filter(Boolean).join(' · '),
                      )}</span>`
                    : '') +
                `</a>` +
              `</li>`
            );
          })
          .join('') +
        `</ul>` +
      `</div>`;
  }
  const bodyHtmlSource = (ev.bodyHtml || '').trim();
  const plainBody = ev.bodyText || ev.bodySnippet || '';
  const showPlainBody = !bodyHtmlSource && plainBody && plainBody !== summaryText;
  if (bodyHtmlSource) {
    detailHtml +=
      // Links are rewritten server-side (resolveEmailHtmlForDisplay) to target="_blank", so
      // allow-popups + allow-popups-to-escape-sandbox lets them open in a real browser tab.
      // Deliberately no allow-top-navigation(-by-user-activation): that let clicks hijack the
      // top-level app window instead of escaping it, which looked like the email going blank.
      `<div class="em-detail-body-html"><iframe class="em-detail-body-frame" sandbox="${
        isEmailLabModeFor(ev)
          ? 'allow-same-origin allow-popups allow-popups-to-escape-sandbox'
          : 'allow-popups allow-popups-to-escape-sandbox'
      }" title="Email message"></iframe></div>`;
  } else if (showPlainBody) {
    detailHtml += `<div class="em-detail-body">${linkifyPlainText(plainBody)}</div>`;
  } else if (!attachments.length && !summaryText) {
    detailHtml += `<div class="em-detail-body em-detail-body-empty">(no body text)</div>`;
  }
  detail.innerHTML = detailHtml;
  if (isEmailLabModeFor(ev)) detail.prepend(renderEmailLabBar());
  const bodyFrame = detail.querySelector('.em-detail-body-frame');
  // Bind before srcdoc so we don't miss the load event on a fast parse.
  if (isEmailLabModeFor(ev)) mountEmailLabSelection(detail);
  if (bodyFrame && bodyHtmlSource) {
    bodyFrame.srcdoc = bodyHtmlSource;
    if (isEmailLabModeFor(ev)) mountEmailLabFrame(bodyFrame);
  }
  detail.querySelector('[data-otp-code]')?.addEventListener('click', (e) => {
    e.preventDefault();
    const btn = e.currentTarget;
    const code = btn?.getAttribute('data-code') || ev.verificationCode;
    void copyEmailVerificationCode(code, btn);
  });
  detail.querySelector('[data-auth-activate]')?.addEventListener('click', (e) => {
    e.preventDefault();
    const btn = e.currentTarget;
    const url = btn?.getAttribute('data-url') || ev.actionUrl;
    if (btn) btn.disabled = true;
    if (url) {
      try {
        window.open(String(url), '_blank', 'noopener,noreferrer');
      } catch {
        /* ignore */
      }
    }
    void deleteEmail(ev).finally(() => {
      if (btn) btn.disabled = false;
    });
  });
  if (!ev._fullLoaded) {
    void fetchFullEmailRecord(ev).then((full) => {
      if (emailState.activeId === full.id) renderEmailPane();
    });
  }
  void mountEmailScheduleActions(detail.querySelector('.em-schedule-actions'), ev);
  detail.querySelectorAll('.em-project-link').forEach((btn) => {
    btn.addEventListener('click', () => navigateToWork(ev.jobSlug, { fromEmailId: ev.id }));
  });
  detail.querySelector('[data-em-add-contact]')?.addEventListener('click', () => {
    openNewContactFromEmail(ev);
  });
  bindClassificationAuditLinks(detail, ev);
  void hydrateEmailFromClient(detail, ev).then(() => {
    if (isEmailLabModeFor(ev)) {
      bindEmailLabDom(detail.querySelector('.em-from-value'), 'from');
    }
  });
  if (projectLabel && (isEmailProject(ev) || isProjectReplyEmail(ev) || isProjectMatchSuggested(ev))) {
    void hydrateEmailProjectContextIcon(detail, ev);
  }
  pane.appendChild(detail);

  root.appendChild(pane);
  root.classList.add('em-pane-active');
  syncFooterNav();
}

function renderEmailPanel(opts = {}) {
  const root = getEmailPanel();
  if (!root) return;
  const savedSidebarScroll = captureSidebarListScroll(root);
  const savedFilterScroll = captureFilterTabsScroll(root);

  if (opts.preserveSidebar) {
    refreshEmailSidebarList();
  } else {
    root.innerHTML = '';
    root.appendChild(renderEmailSidebar(savedFilterScroll));
  }

  if (opts.preservePane) {
    finishSidebarListScroll(root, savedSidebarScroll);
    return;
  }

  renderEmailPane();
  finishSidebarListScroll(root, savedSidebarScroll);
}

// ---- persistence ----
function savePositions() {
  const pos = {};
  for (const n of byId.values()) pos[n.id] = { x: n.x, y: n.y };
  try {
    localStorage.setItem(storeKey(), JSON.stringify(pos));
  } catch {}
}
function loadPositions() {
  let pos;
  try {
    pos = JSON.parse(localStorage.getItem(storeKey()) || 'null');
  } catch {
    pos = null;
  }
  if (!pos) return;
  for (const n of byId.values()) {
    if (pos[n.id]) {
      n.x = pos[n.id].x;
      n.y = pos[n.id].y;
    }
  }
}

/** Legacy tab key from older installs / deep links. */
function resolveMapKey(key) {
  if (key === 'home') return 'dashboard';
  if (key === 'email-lab' || key === 'lab') return 'rules';
  if (key === 'catalog') return 'modules';
  return key;
}

function loadActiveKey() {
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('email')?.trim() || rememberedOpenEmailDraft()) return 'email';
    if (params.get('client')?.trim()) return 'clients';
    if (params.get('chat')?.trim()) return 'chats';
    if (params.get('slug')?.trim()) return 'work';
    if (params.get('booking')?.trim()) return 'schedule';
    if (params.get('module')?.trim()) return 'modules';
    const tab = resolveMapKey(params.get('tab'));
    if (tab && MAPS[tab] && canOpenMapKey(tab)) return tab;
  } catch {}
  let key;
  try {
    key = resolveMapKey(localStorage.getItem(MAP_STORE));
  } catch {
    key = null;
  }
  if (MAPS[key] && canOpenMapKey(key)) return key;
  return 'dashboard';
}

function canOpenMapKey(key) {
  if (key === 'industries') return showIndustries();
  const features = window.__installConfig?.features;
  const has = (id) => Array.isArray(features) && features.includes(id);
  if (key === 'social') return has('social_inbox');
  if (key === 'reviews') return has('online_reviews');
  return true;
}
function saveActiveKey() {
  try {
    localStorage.setItem(MAP_STORE, activeKey);
  } catch {}
}

// ---- init ----
async function rebuildTabsForViewport() {
  const order = await resolveTabOrder();
  cachedTabOrder = order;
  buildTabs(order);
}

function showBootError(err) {
  console.error('[admin] boot failed', err);
  const banner = document.createElement('div');
  banner.setAttribute('role', 'alert');
  banner.style.cssText =
    'position:fixed;inset:auto 0 0 0;z-index:99999;padding:0.75rem 1rem;background:#7f1d1d;color:#fecaca;font:600 0.85rem/1.45 ui-sans-serif,system-ui,sans-serif;border-top:1px solid #991b1b';
  banner.textContent =
    'Admin failed to start (JavaScript error). Hard-refresh the page. If it persists, clear site data for this domain.';
  document.body?.appendChild(banner);
}

let adminBootStarted = false;

async function boot() {
  if (adminBootStarted) return;
  adminBootStarted = true;
  const tabOrder = await resolveTabOrder();
  cachedTabOrder = tabOrder;
  buildTabs(tabOrder);
  initTopbarMenus();
  initDeployIndicator();
  bindQueuedAgentOpens();
  initFooterNav();
  initFooterNavScrollCollapse();
  initChatComposeFocusLayout();
  initSearchOverlay();
  initKeyboardShortcuts();
  MOBILE_TABS_MQ.addEventListener('change', rebuildTabsForViewport);
  MOBILE_TABS_MQ.addEventListener('change', syncTopbarPanelContext);
  ADMIN_PANE_MQ.addEventListener('change', () => {
    syncAdminSplitView(MAP?.type);
    scanPanelSidebars();
  });
  COMPACT_TABS_MQ.addEventListener('change', rebuildTabsForViewport);
  initSidebarLayout();
  initModelSelector();
  syncCanvasVisibility();
  if (userId) {
    activateMapPanel();
  } else {
    bindClerkSsrSessionSync();
  }
  syncAdminTabUrl(activeKey);
  window.__reaveOpenDeepLink = handleNotificationOpen;
  installPwaNavGuard();
  syncHealthLifecycle();
  if (userId) {
    syncEmailPoll();
    syncInboxBadgePoll();
  }
  if (isDeploymentOwnerClient) {
    startDeployPoll();
  }
  syncChatRunningPoll();
  syncWorkAuditingPoll();
  syncFooterNav();
  syncProfileMenuActive();
  syncTopbarPanelContext();
  syncSpecialPageChrome();
  syncAppHeaderBack();
  syncAdminSplitView(MAP?.type);
  scanPanelSidebars();
  void consumePendingOtpCopy();
}

boot().catch(showBootError);

queueTriageEmailFromUrl();

window.addEventListener('pagehide', () => {
  persistEmailDraftKeepAlive();
});

window.addEventListener('pageshow', (ev) => {
  resumeEmailDeepLinkFromUrl();
  resumeClientDeepLinkFromUrl();
  resumeScheduleDeepLinkFromUrl();
  queueTriageEmailFromUrl();
  void purgeExpiredOtpsQuietly();
  void consumePendingOtpCopy();
  if (ev.persisted) pollActiveViewQuiet();
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.ready
    .then(() => {
      refreshInboxBadgeQuiet();
      void consumePendingOtpCopy();
    })
    .catch(() => undefined);
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'reave-inbox-push') refreshInboxBadgeQuiet(true);
    if (event.data?.type === 'reave-notification-open') handleNotificationOpen(event.data.url);
    if (event.data?.type === 'reave-alert-dismiss' && event.data.alertId) {
      void dismissPushAlertById(event.data.alertId).catch(() => undefined);
    }
    if (event.data?.type === 'reave-otp-copy') void handleOtpCopyFromPush(event.data);
    if (event.data?.type === 'reave-otp-delete') void handleOtpDeleteFromPush(event.data);
  });
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (emailState.composing) void saveActiveEmailDraft(true);
    stopHealth();
    stopEmailPoll();
    stopInboxBadgePoll();
    stopChatRunningPoll();
    stopWorkAuditingPoll();
    stopDeployPoll();
  } else {
    void purgeExpiredOtpsQuietly();
    syncHealthLifecycle();
    syncEmailPoll();
    syncInboxBadgePoll();
    syncChatRunningPoll();
    syncWorkAuditingPoll();
    if (isDeploymentOwnerClient) startDeployPoll();
    pollActiveViewQuiet();
    resumeEmailDeepLinkFromUrl();
    resumeClientDeepLinkFromUrl();
    void consumePendingOtpCopy();
  }
});

document.addEventListener('reave-purge-expired-otps', () => {
  void purgeExpiredOtpsQuietly();
});
