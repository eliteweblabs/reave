/**
 * todo panel — extracted from os-map-loader.js
 */
import {
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
  bindListMultiSelect,
  exitListMultiSelect,
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
} from './admin-ui.js?v=20260805a';
import { escHtml, adminFetch, readAdminJson, readApiJson, linkifyPlainText, parseTodoDueInstant, isUtcDateOnlyInstant, formatTodoDueTime, TODO_PRIORITY_LABELS, sidebarAuthorIconHtml, ensureContactAuthorIconsReady, mountPanelSkeleton } from './shared.js?v=20260803a';
import { navigateToWork, navigateToNewWorkFromTodo } from './work-panel.js?v=20260805e';
import { confirmDiscardChanges } from './clients-panel.js?v=20260728p';
import { chatState, createPortalShareBtn, refreshChatSidebarList } from './chat-panel.js?v=20260730c';
import { knowledgeState, refreshKnowledgeSidebarList } from './knowledge-panel.js?v=20260728p';

/** Injected by os-map-loader via initTodoPanel(). */
let shell = {};

export function initTodoPanel(deps) {
  shell = deps;
}

// ---- extracted from os-map-loader.js:8692-9838 ----
// ---- todo tab ----

const TODO_STATUS_LABELS = {
  open: 'Open',
  done: 'Done',
};

let todoState = {
  todos: [],
  jobs: [],
  priorities: ['low', 'normal', 'high', 'urgent'],
  statuses: ['open', 'done'],
  search: '',
  filter: 'open',
  activeId: null,
  dirty: false,
  draft: null,
  linkedJob: null,
  returnToWorkSlug: null,
};

let todoSaveTimer = null;

function getTodoEditor() {
  return document.getElementById('todo-editor');
}

function todoJobTitle(slug) {
  if (!slug) return '';
  const job = todoState.jobs.find((j) => j.slug === slug);
  return job?.title || slug;
}

const TODO_WEEKDAY_SHORT = ['Sun', 'Mon', 'Tues', 'Wed', 'Thurs', 'Fri', 'Sat'];

function normalizeTodoDueDateRaw(raw) {
  if (raw == null || raw === '') return null;
  const d = parseTodoDueInstant(raw);
  return d ? d.toISOString() : null;
}

function normalizeTodoItemDates(todo) {
  if (!todo || typeof todo !== 'object') return todo;
  return { ...todo, due_date: normalizeTodoDueDateRaw(todo.due_date) };
}

function todoDueDatePart(raw) {
  const d = parseTodoDueInstant(raw);
  if (!d) return '';
  if (isUtcDateOnlyInstant(raw, d)) {
    const y = d.getUTCFullYear();
    const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${mo}-${day}`;
  }
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${day}`;
}

function todoDueTimePart(raw) {
  const d = parseTodoDueInstant(raw);
  if (!d) return '';
  if (isUtcDateOnlyInstant(raw, d)) return '';
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${min}`;
}

function combineTodoDueDateTime(dateStr, timeStr) {
  if (!dateStr?.trim()) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = (timeStr?.trim() || '00:00').split(':').map(Number);
  const dt = new Date(y, m - 1, d, hh, mm, 0, 0);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString();
}

function formatTodoDueDate(raw) {
  const d = parseTodoDueInstant(raw);
  if (!d) return '';
  const dateOnly = isUtcDateOnlyInstant(raw, d);
  const wd = dateOnly
    ? TODO_WEEKDAY_SHORT[new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).getUTCDay()]
    : TODO_WEEKDAY_SHORT[d.getDay()];
  const month = dateOnly
    ? new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toLocaleDateString(undefined, {
        month: 'short',
        timeZone: 'UTC',
      })
    : d.toLocaleDateString(undefined, { month: 'short' });
  const day = dateOnly ? d.getUTCDate() : d.getDate();
  const time = dateOnly ? null : formatTodoDueTime(d);
  const datePart = `${wd}, ${month} ${day}`;
  return time ? `Due ${datePart} @ ${time}` : `Due ${datePart}`;
}

function todoSubline(todo) {
  const bits = [];
  if (todo.section) bits.push(todo.section);
  if (todo.job_slug) bits.push(todoJobTitle(todo.job_slug));
  if (todo.assignee) bits.push(todo.assignee);
  if (todo.due_date) bits.push(formatTodoDueDate(todo.due_date));
  if (todo.priority && todo.priority !== 'normal') {
    bits.push(TODO_PRIORITY_LABELS[todo.priority] || todo.priority);
  }
  return bits.join(' · ');
}

function todoPriorityDotClass(priority) {
  if (priority === 'urgent' || priority === 'high' || priority === 'low') {
    return `td-priority-dot td-priority-dot--${priority}`;
  }
  return 'td-priority-dot';
}

function todoSearchPlaceholder() {
  const count = todoState.todos.filter((t) => t.status === todoState.filter).length;
  const label = count === 1 ? 'To Do Item' : 'To Do Items';
  return `Search ${count} ${label}`;
}

function filterTodoItems(todos) {
  const q = todoState.search.trim().toLowerCase();
  return todos.filter((todo) => {
    if (todo.status !== todoState.filter) return false;
    if (!q) return true;
    return matchesListSearch(
      q,
      todo.title,
      todo.section,
      todo.assignee,
      todo.job_slug ? todoJobTitle(todo.job_slug) : '',
      todoSubline(todo),
    );
  });
}

async function loadTodoTab(opts = {}) {
  const root = getTodoEditor();
  if (!root) return;
  await ensureContactAuthorIconsReady();
  const preserveNew =
    todoState.activeId === '__new__' &&
    todoState.draft &&
    (opts.todoId === '__new__' || pendingTodoDeepLinkId === '__new__');
  if (!preserveNew) {
    mountPanelSkeleton(root, 'list', 'Loading to‑dos…', { contentSelector: '.ch-sidebar' });
  }
  try {
    const todoRes = await adminFetch('/api/todos');
    const todoData = await readAdminJson(todoRes, 'To-dos');
    if (!todoRes.ok) throw new Error(todoData.error || `HTTP ${todoRes.status}`);
    todoState.todos = (todoData.todos || []).map(normalizeTodoItemDates);
    todoState.priorities = todoData.priorities || todoState.priorities;
    todoState.statuses = todoData.statuses || todoState.statuses;
    todoState.jobs = [];
    try {
      const workRes = await adminFetch('/api/work');
      const workData = await readAdminJson(workRes, 'Projects');
      if (workRes.ok) todoState.jobs = workData.jobs || [];
    } catch (workErr) {
      if (workErr.message === 'Session expired') throw workErr;
      console.warn('[todo] project list unavailable', workErr);
    }
  } catch (e) {
    if (e.message === 'Session expired') return;
    root.innerHTML = `<div class="de-loading de-error">Failed to load: ${escHtml(e.message)}</div>`;
    return;
  }

  const deepId = opts.todoId ?? pendingTodoDeepLinkId;
  pendingTodoDeepLinkId = null;

  if (preserveNew && !shell.isCreateDrawerOpen('todo')) {
    getTodoEditor()?.classList.add('de-pane-active');
    renderTodoEditor();
    return;
  }

  if (deepId === '__new__') {
    startNewTodo({ keepReturnSlug: true });
    return;
  }

  if (deepId) {
    await openTodo(Number(deepId), { keepReturnSlug: true });
    return;
  }

  if (
    todoState.activeId &&
    todoState.activeId !== '__new__' &&
    !todoState.todos.some((t) => t.id === todoState.activeId)
  ) {
    try {
      await openTodo(todoState.activeId, { keepReturnSlug: true });
      return;
    } catch {
      todoState.activeId = null;
      todoState.draft = null;
      todoState.linkedJob = null;
      getTodoEditor()?.classList.remove('de-pane-active');
    }
  }
  renderTodoEditor();
}

function beginNewTodoDrawer() {
  shell.beginCreateDrawer({
    key: 'todo',
    title: 'New To‑do',
    submitLabel: 'Add',
    onSubmit: async () => {
      if (!todoState.draft?.title?.trim()) {
        shell.flagCreateDrawerTitleMissing();
        return;
      }
      if (!(await saveActiveTodoDraft())) return;
      shell.finishCreateDrawer();
      getTodoEditor()?.classList.add('de-pane-active');
      renderTodoEditor();
    },
    onDismiss: () => {
      const returnSlug = todoState.returnToWorkSlug;
      todoState.activeId = null;
      todoState.draft = null;
      todoState.linkedJob = null;
      todoState.dirty = false;
      todoState.returnToWorkSlug = null;
      getTodoEditor()?.classList.remove('de-pane-active');
      if (returnSlug) {
        navigateToWork(returnSlug);
        return;
      }
      renderTodoEditor();
      shell.syncFooterNav();
    },
  });
}

function startNewTodo(opts = {}) {
  armTitleFocus('todo');
  beginNewTodoDrawer();
  if (!opts.keepReturnSlug) todoState.returnToWorkSlug = null;
  todoState.activeId = '__new__';
  todoState.dirty = false;
  todoState.linkedJob = null;
  if (!todoState.draft || !opts.keepReturnSlug) {
    todoState.draft = {
      title: '',
      priority: 'normal',
      status: 'open',
      due_date: '',
      job_slug: opts.jobSlug || '',
      assignee: '',
      section: '',
    };
  }
  if (todoState.draft.job_slug) {
    void refreshTodoLinkedJob(todoState.draft.job_slug);
  }
  renderTodoEditor();
  shell.syncFooterNav();
}

function fillTodoSidebarList(list) {
  exitListMultiSelect(list);
  const visible = filterTodoItems(todoState.todos);
  list.innerHTML = '';
  for (const todo of visible) {
    list.appendChild(createTodoSwipeRow(todo));
  }
  if (visible.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'de-empty';
    empty.textContent = todoState.search.trim()
      ? 'No matches.'
      : todoState.filter === 'done'
        ? 'No completed to‑dos yet.'
        : 'No open to‑dos yet.';
    list.appendChild(empty);
  }
  // Drag-to-reorder disabled — re-enable via attachSidebarListReorder below.
  // else if (todoState.filter === 'open' && !todoState.search.trim()) {
  //   attachTodoListReorder(list, visible.map((t) => t.id));
  // }
}

function refreshTodoSidebarList() {
  const root = getTodoEditor();
  const list = root?.querySelector('.ch-sidebar .ch-list');
  if (!list) {
    renderTodoEditor();
    return;
  }
  const searchInput = root.querySelector('.panel-list-search');
  if (searchInput) {
    searchInput.placeholder = todoSearchPlaceholder();
  }
  fillTodoSidebarList(list);
}

function renderTodoEditor() {
  const root = getTodoEditor();
  if (!root) return;
  const savedSidebarScroll = shell.captureSidebarListScroll(root);
  const { todos, activeId, search, filter } = todoState;
  root.innerHTML = '';

  const sidebar = document.createElement('div');
  sidebar.className = 'ch-sidebar';

  const openCount = todos.filter((t) => t.status === 'open').length;
  const doneCount = todos.filter((t) => t.status === 'done').length;
  const subheader = listSearchAddNew({
    itemCount: openCount,
    search: {
      value: search,
      placeholder: todoSearchPlaceholder(),
      onInput: (value) => {
        todoState.search = value;
        refreshTodoSidebarList();
      },
    },
    addNew: false,
  });
  if (subheader) sidebar.appendChild(subheader.el);

  const filterTabs = document.createElement('div');
  filterTabs.className = 'td-filter-tabs';
  for (const tab of [
    { key: 'open', label: `Open (${openCount})` },
    { key: 'done', label: `Done (${doneCount})` },
  ]) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'td-filter-tab' + (filter === tab.key ? ' active' : '');
    btn.textContent = tab.label;
    btn.addEventListener('click', () => {
      if (todoState.filter === tab.key) return;
      todoState.filter = tab.key;
      renderTodoEditor();
    });
    filterTabs.appendChild(btn);
  }
  sidebar.appendChild(filterTabs);

  const list = document.createElement('div');
  list.className = 'ch-list';
  bindSwipeListScroll(list);
  bindListMultiSelect(list, { onBulkDelete: bulkDeleteTodos });
  fillTodoSidebarList(list);
  sidebar.appendChild(list);
  root.appendChild(sidebar);

  const pane = document.createElement('div');
  pane.className = 'de-pane';
  if (activeId === '__new__') {
    renderTodoEditPane(pane, true);
    shell.mountCreateDrawerChrome(pane);
  } else if (activeId) {
    renderTodoEditPane(pane, false);
  } else {
    shell.appendEmptyDetailPane(pane, {
      mapKey: 'todo',
      iconName: 'check-square',
      bodyHtml: '<p>Select a to‑do, or create a new one.</p>',
      onCreate: () => startNewTodo(),
    });
  }
  root.appendChild(pane);
  flushTitleFocus('todo');
  shell.finishSidebarListScroll(root, savedSidebarScroll);
}

function todoAuthorContactUid(todo) {
  const slug = todo.job_slug?.trim();
  if (!slug) return '';
  return todoState.jobs.find((j) => j.slug === slug)?.contact_uid || '';
}

function createTodoListItem(todo) {
  const item = document.createElement('button');
  item.type = 'button';
  item.className =
    'ch-list-item' +
    (todo.id === todoState.activeId ? ' active' : '') +
    (todo.status === 'done' ? ' ch-list-item--done' : '');
  item.dataset.id = String(todo.id);
  item.innerHTML =
    sidebarAuthorIconHtml({ contactUid: todoAuthorContactUid(todo) }) +
    `<span class="ch-list-content">` +
    `<span class="td-list-row">` +
    `<span class="${todoPriorityDotClass(todo.priority)}" aria-hidden="true"></span>` +
    `<span class="td-list-body">` +
    `<span class="ch-item-row"><span class="ch-item-title">${escHtml(todo.title)}</span></span>` +
    `<span class="de-item-slug">${escHtml(todoSubline(todo) || 'No project')}</span>` +
    `</span></span></span>`;
  item.addEventListener('click', () => openTodo(todo.id));
  return item;
}

function createTodoSwipeRow(todo) {
  const actions =
    todo.status === 'open'
      ? [
          swipeArchiveAction({
            label: 'Done',
            onClick: () => markTodoDone(todo.id),
          }),
          swipeDeleteAction({ onClick: () => deleteTodo(todo.id) }),
        ]
      : [
          swipeArchiveAction({
            label: 'Reopen',
            onClick: () => reopenTodo(todo.id),
          }),
          swipeDeleteAction({ onClick: () => deleteTodo(todo.id) }),
        ];
  return createSwipeRow(createTodoListItem(todo), actions);
}

async function openTodo(id, opts = {}) {
  await flushTodoAutosave();
  if (todoState.dirty && todoState.activeId && todoState.activeId !== id) {
    if (!(await confirmDiscardChanges())) return;
  }
  if (opts.fromWorkSlug) todoState.returnToWorkSlug = opts.fromWorkSlug;

  let todo = todoState.todos.find((t) => t.id === id);
  if (!todo) {
    try {
      const res = await fetch(`/api/todos/${encodeURIComponent(id)}`, { cache: 'no-store' });
      const data = await readApiJson(res);
      todo = normalizeTodoItemDates(data);
      const idx = todoState.todos.findIndex((t) => t.id === id);
      if (idx === -1) todoState.todos.unshift(todo);
      else todoState.todos[idx] = todo;
    } catch (e) {
      shell.osAlert({ title: 'To‑do not found', bodyHtml: escHtml(e.message) });
      return;
    }
  }

  todoState.activeId = id;
  todoState.dirty = false;
  todoState.draft = {
    title: todo.title,
    priority: todo.priority,
    status: todo.status,
    due_date: normalizeTodoDueDateRaw(todo.due_date),
    job_slug: todo.job_slug || '',
    assignee: todo.assignee || '',
    section: todo.section || '',
  };
  todoState.linkedJob = null;
  if (todo.job_slug) {
    try {
      const res = await fetch(`/api/work/${encodeURIComponent(todo.job_slug)}`, { cache: 'no-store' });
      const data = await res.json();
      if (res.ok) todoState.linkedJob = data;
    } catch {
      todoState.linkedJob = null;
    }
  }
  getTodoEditor()?.classList.add('de-pane-active');
  renderTodoEditor();
  shell.syncFooterNav();
}

async function closeTodoEditor(checkDirty = true) {
  await flushTodoAutosave();
  if (checkDirty && todoState.dirty && !(await confirmDiscardChanges())) return;
  const returnSlug = todoState.returnToWorkSlug;
  todoState.activeId = null;
  todoState.draft = null;
  todoState.linkedJob = null;
  todoState.dirty = false;
  todoState.returnToWorkSlug = null;
  getTodoEditor()?.classList.remove('de-pane-active');
  if (returnSlug) {
    navigateToWork(returnSlug);
    return;
  }
  renderTodoEditor();
  shell.syncFooterNav();
}

function scheduleTodoAutosave(saveFn) {
  if (todoSaveTimer) clearTimeout(todoSaveTimer);
  todoSaveTimer = setTimeout(() => {
    todoSaveTimer = null;
    void saveFn();
  }, 450);
}

async function flushTodoAutosave() {
  if (todoSaveTimer) {
    clearTimeout(todoSaveTimer);
    todoSaveTimer = null;
    await saveActiveTodoDraft(true);
  }
}

async function saveActiveTodoDraft(silent = false) {
  if (!todoState.draft) return true;
  const isNew = todoState.activeId === '__new__';
  const payload = {
    title: todoState.draft.title.trim(),
    priority: todoState.draft.priority || 'normal',
    status: todoState.draft.status || 'open',
    due_date: normalizeTodoDueDateRaw(todoState.draft.due_date),
    job_slug: todoState.draft.job_slug?.trim() || null,
    assignee: todoState.draft.assignee?.trim() || null,
    section: todoState.draft.section?.trim() || null,
  };
  if (!payload.title) return false;

  try {
    if (isNew) {
      const res = await fetch('/api/todos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await readApiJson(res);
      todoState.todos.unshift(normalizeTodoItemDates(data));
      todoState.activeId = data.id;
      todoState.dirty = false;
      todoState.draft = {
        title: data.title,
        priority: data.priority,
        status: data.status,
        due_date: normalizeTodoDueDateRaw(data.due_date),
        job_slug: data.job_slug || '',
        assignee: data.assignee || '',
        section: data.section || '',
      };
      if (data.job_slug) await refreshTodoLinkedJob(data.job_slug);
    } else {
      const res = await fetch(`/api/todos/${todoState.activeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await readApiJson(res);
      const idx = todoState.todos.findIndex((t) => t.id === data.id);
      if (idx !== -1) todoState.todos[idx] = normalizeTodoItemDates(data);
      todoState.dirty = false;
      if (payload.job_slug !== (todoState.linkedJob?.slug || null)) {
        await refreshTodoLinkedJob(payload.job_slug);
      }
    }
    refreshTodoSidebarList();
    return true;
  } catch (e) {
    if (!silent) shell.osAlert({ title: 'Save failed', bodyHtml: escHtml(e.message) });
    return false;
  }
}

async function refreshTodoLinkedJob(slug) {
  if (!slug) {
    todoState.linkedJob = null;
    return;
  }
  try {
    const res = await fetch(`/api/work/${encodeURIComponent(slug)}`, { cache: 'no-store' });
    const data = await res.json();
    todoState.linkedJob = res.ok ? data : null;
  } catch {
    todoState.linkedJob = null;
  }
}

function renderTodoEditPane(pane, isNew) {
  const draft = todoState.draft;
  if (!draft) return;

  const linkTrackEl = document.createElement('div');
  linkTrackEl.className = 'wk-link-track';
  linkTrackEl.hidden = true;

  const linked = todoState.linkedJob;
  const icons = [];
  const shareBtn = linked?.contact_uid
    ? createPortalShareBtn(linked.contact_uid, {
        tab: 'work',
        jobSlug: linked.slug,
        trackEl: linkTrackEl,
        title: `${linked.contact_name || linked.client || 'Client'} — Projects`,
        recipient: {
          contactUid: linked.contact_uid,
          name: linked.contact_name || linked.client || 'Client',
          email: linked.contact_email,
          phone: linked.contact_phone,
        },
      })
    : null;
  if (shareBtn) icons.push(shareBtn);
  if (!isNew) {
    icons.push(
      paneDeleteIcon({
        label: 'Delete to‑do',
        onClick: () => deleteTodo(todoState.activeId),
      }),
    );
  }

  const inDrawer = isNew && shell.isCreateDrawerOpen('todo');
  const { header, titleInput } = createPaneSubheader({
    back: inDrawer
      ? null
      : {
          label: todoState.returnToWorkSlug ? 'Back to project' : 'Back to to‑dos',
          onClick: () => closeTodoEditor(),
        },
    editableTitle: {
      value: draft.title,
      placeholder: 'To‑do title',
      ariaLabel: 'To‑do title',
    },
    icons,
  });
  pane.appendChild(header);
  if (isNew) requestTitleFocus('todo', titleInput);

  const scroll = document.createElement('div');
  scroll.className = 're-form-scroll';
  const fields = document.createElement('div');
  fields.className = 'de-fields';

  const markDirty = () => {
    todoState.dirty = true;
    // In the create drawer the Add button is the save; autosaving as the user
    // types would leave a to-do behind after Cancel.
    if (inDrawer) return;
    scheduleTodoAutosave(() => saveActiveTodoDraft(true));
  };

  const priorityPill = createSlidingPillSelect({
    label: 'Priority',
    value: draft.priority || 'normal',
    options: todoState.priorities.map((p) => ({
      value: p,
      label: TODO_PRIORITY_LABELS[p] || p,
    })),
    ariaLabel: 'Priority',
    onChange: () => {
      draft.priority = priorityPill.getValue();
      markDirty();
    },
  });
  fields.appendChild(priorityPill.el);

  const statusPill = createSlidingPillSelect({
    label: 'Status',
    value: draft.status || 'open',
    options: todoState.statuses.map((s) => ({
      value: s,
      label: TODO_STATUS_LABELS[s] || s,
    })),
    ariaLabel: 'Status',
    onChange: () => {
      draft.status = statusPill.getValue();
      markDirty();
    },
  });
  fields.appendChild(statusPill.el);

  const dueWrap = document.createElement('div');
  dueWrap.className = 'de-label td-due-field';
  dueWrap.textContent = 'Due';
  const dueRow = document.createElement('div');
  dueRow.className = 'td-due-row';
  const dueDateInput = document.createElement('input');
  dueDateInput.className = 'de-input';
  dueDateInput.type = 'date';
  dueDateInput.value = todoDueDatePart(draft.due_date);
  const dueTimeInput = document.createElement('input');
  dueTimeInput.className = 'de-input';
  dueTimeInput.type = 'time';
  dueTimeInput.value = todoDueTimePart(draft.due_date);
  const syncDueDraft = () => {
    draft.due_date = combineTodoDueDateTime(dueDateInput.value, dueTimeInput.value);
    markDirty();
  };
  dueDateInput.addEventListener('change', syncDueDraft);
  dueTimeInput.addEventListener('change', syncDueDraft);
  dueRow.appendChild(dueDateInput);
  dueRow.appendChild(dueTimeInput);
  dueWrap.appendChild(dueRow);
  fields.appendChild(dueWrap);

  const assigneeLabel = document.createElement('label');
  assigneeLabel.className = 'de-label';
  assigneeLabel.textContent = 'Assigned to';
  const assigneeInput = document.createElement('input');
  assigneeInput.className = 'de-input';
  assigneeInput.placeholder = 'Name or team member';
  assigneeInput.value = draft.assignee || '';
  assigneeInput.addEventListener('input', () => {
    draft.assignee = assigneeInput.value;
    markDirty();
  });
  assigneeLabel.appendChild(assigneeInput);
  fields.appendChild(assigneeLabel);

  const sectionLabel = document.createElement('label');
  sectionLabel.className = 'de-label';
  sectionLabel.textContent = 'Section';
  const sectionInput = document.createElement('input');
  sectionInput.className = 'de-input';
  sectionInput.placeholder = 'Product Backlog, Voice Agent…';
  sectionInput.value = draft.section || '';
  sectionInput.addEventListener('input', () => {
    draft.section = sectionInput.value;
    markDirty();
  });
  sectionLabel.appendChild(sectionInput);
  fields.appendChild(sectionLabel);

  mountTodoProjectPicker(fields, draft, markDirty);

  scroll.appendChild(fields);
  pane.appendChild(scroll);

  titleInput.addEventListener('input', () => {
    draft.title = titleInput.value;
    markDirty();
  });
  titleInput.addEventListener('blur', () => {
    if (inDrawer) return;
    void saveActiveTodoDraft(true);
  });
}

async function ensureTodoJobsLoaded() {
  if (todoState.jobs.length) return;
  try {
    const res = await fetch('/api/work', { cache: 'no-store' });
    const data = await res.json();
    if (res.ok) todoState.jobs = data.jobs || [];
  } catch {
    /* non-fatal */
  }
}

function mountTodoProjectPicker(parent, draft, markDirty) {
  let changing = !draft.job_slug?.trim();

  const wrap = document.createElement('div');
  wrap.className = 'wk-client-picker td-project-picker';

  const fieldLabel = document.createElement('span');
  fieldLabel.className = 'de-label';
  fieldLabel.textContent = 'Project';
  wrap.appendChild(fieldLabel);

  const selectedEl = document.createElement('div');
  selectedEl.className = 'wk-client-selected';
  const profileLink = document.createElement('button');
  profileLink.type = 'button';
  profileLink.className = 'wk-client-profile-link';
  const selectedName = document.createElement('span');
  selectedName.className = 'wk-client-name';
  profileLink.appendChild(selectedName);
  const changeBtn = document.createElement('button');
  changeBtn.type = 'button';
  changeBtn.className = 'de-btn de-btn-ghost';
  changeBtn.textContent = 'Change';
  selectedEl.appendChild(profileLink);
  selectedEl.appendChild(changeBtn);
  wrap.appendChild(selectedEl);

  const searchWrap = document.createElement('div');
  searchWrap.className = 'wk-client-search-wrap';
  const searchInput = document.createElement('input');
  searchInput.className = 'de-input';
  searchInput.type = 'search';
  searchInput.placeholder = 'Search Projects…';
  searchInput.autocomplete = 'off';
  const dropdown = document.createElement('div');
  dropdown.className = 'wk-client-dropdown';
  dropdown.style.display = 'none';
  searchWrap.appendChild(searchInput);
  searchWrap.appendChild(dropdown);
  wrap.appendChild(searchWrap);

  function syncView() {
    const slug = draft.job_slug?.trim();
    const has = !!slug;
    selectedEl.style.display = has && !changing ? 'flex' : 'none';
    searchWrap.style.display = changing || !has ? 'block' : 'none';
    if (has) {
      selectedName.textContent = todoJobTitle(slug);
      profileLink.title = `Open ${selectedName.textContent}`;
    }
  }

  profileLink.addEventListener('click', async () => {
    const slug = draft.job_slug?.trim();
    if (!slug) return;
    await flushTodoAutosave();
    const todoId = typeof todoState.activeId === 'number' ? todoState.activeId : null;
    navigateToWork(slug, todoId ? { fromTodoId: todoId } : {});
  });

  function renderDropdown(matches, query) {
    dropdown.innerHTML = '';
    for (const job of matches) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'wk-client-option';
      btn.innerHTML =
        `${escHtml(job.title || job.slug)}` +
        `<span class="sub">${escHtml(job.contact_name || job.client || '—')}</span>`;
      btn.addEventListener('mousedown', (e) => e.preventDefault());
      btn.addEventListener('click', () => pickJob(job));
      dropdown.appendChild(btn);
    }
    const q = query.trim();
    const createBtn = document.createElement('button');
    createBtn.type = 'button';
    createBtn.className = 'wk-client-option wk-client-add';
    createBtn.textContent = q ? `+ Create "${q}" as new project` : '+ Create new project…';
    createBtn.addEventListener('mousedown', (e) => e.preventDefault());
    createBtn.addEventListener('click', () => beginCreateProject(q));
    dropdown.appendChild(createBtn);
    if (q.length >= 1 && draft.job_slug?.trim()) {
      const clearBtn = document.createElement('button');
      clearBtn.type = 'button';
      clearBtn.className = 'wk-client-option wk-client-add';
      clearBtn.textContent = 'Remove project link';
      clearBtn.addEventListener('mousedown', (e) => e.preventDefault());
      clearBtn.addEventListener('click', () => pickJob(null));
      dropdown.appendChild(clearBtn);
    }
    dropdown.style.display = 'block';
  }

  async function beginCreateProject(suggestedTitle) {
    dropdown.style.display = 'none';
    searchInput.value = '';
    changing = false;
    syncView();
    await navigateToNewWorkFromTodo({ suggestedTitle });
  }

  function filterJobs(query) {
    const q = query.trim().toLowerCase();
    if (q.length < 1) return null;
    return todoState.jobs
      .filter((job) =>
        matchesListSearch(q, job.title, job.slug, job.contact_name, job.client, job.status),
      )
      .slice(0, 8);
  }

  async function scheduleSearch() {
    const q = searchInput.value.trim();
    await ensureTodoJobsLoaded();
    const matches = q.length >= 1 ? filterJobs(q) || [] : [];
    renderDropdown(matches, q);
  }

  function pickJob(job) {
    draft.job_slug = job?.slug || '';
    changing = !draft.job_slug;
    searchInput.value = '';
    dropdown.style.display = 'none';
    syncView();
    markDirty();
    void refreshTodoLinkedJob(draft.job_slug).then(() => renderTodoEditor());
  }

  changeBtn.addEventListener('click', () => {
    changing = true;
    syncView();
    searchInput.focus();
    void scheduleSearch();
  });

  searchInput.addEventListener('input', () => {
    void scheduleSearch();
  });
  searchInput.addEventListener('focus', () => {
    void scheduleSearch();
  });
  searchInput.addEventListener('blur', () => {
    setTimeout(() => {
      if (!wrap.contains(document.activeElement) && draft.job_slug?.trim()) {
        changing = false;
        searchInput.value = '';
        dropdown.style.display = 'none';
        syncView();
      }
    }, 150);
  });
  shell.attachAutosuggestKeyboardNav(searchInput, dropdown, {
    optionSelector: '.wk-client-option',
    onClose: () => {
      dropdown.style.display = 'none';
    },
  });

  syncView();
  parent.appendChild(wrap);
}

function sidebarListRowHost(list) {
  return pullRefreshContentRoot(list) || list;
}

function sidebarRowKey(row) {
  return (
    row.dataset.id ||
    row.dataset.slug ||
    row.querySelector('.ch-list-item')?.dataset.id ||
    row.querySelector('.ch-list-item')?.dataset.slug ||
    ''
  );
}

function sidebarListRowKeys(list) {
  return [...sidebarListRowHost(list).querySelectorAll(':scope > .swipe-row')]
    .map(sidebarRowKey)
    .filter(Boolean);
}

function clearSidebarDropTargets(list) {
  sidebarListRowHost(list).querySelectorAll('.swipe-row').forEach((el) => {
    el.classList.remove('td-drop-target');
  });
}

function repositionSidebarRowByPointer(list, dragEl, pointerY) {
  const host = sidebarListRowHost(list);
  clearSidebarDropTargets(list);
  const siblings = [...host.querySelectorAll(':scope > .swipe-row')].filter((node) => node !== dragEl);
  if (!siblings.length) return;

  for (const sib of siblings) {
    const rect = sib.getBoundingClientRect();
    const mid = rect.top + rect.height / 2;
    if (pointerY < mid) {
      host.insertBefore(dragEl, sib);
      sib.classList.add('td-drop-target');
      return;
    }
  }

  host.appendChild(dragEl);
  siblings[siblings.length - 1]?.classList.add('td-drop-target');
}

function attachSidebarListReorder(list, orderedKeys, persistFn) {
  // Drag-to-reorder disabled — uncomment the block below to restore manual sidebar ordering.
  return;
  /*
  let dragEl = null;
  let dragStartKeys = null;
  let moved = false;

  list.querySelectorAll('.td-list-grip').forEach((grip) => {
    grip.addEventListener('pointerdown', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const item = grip.closest('.ch-list-item');
      const row = grip.closest('.swipe-row');
      if (!item || !row) return;
      dragEl = row;
      dragStartKeys = sidebarListRowKeys(list);
      moved = false;
      row.classList.add('td-dragging');
      grip.setPointerCapture(ev.pointerId);

      function onMove(moveEv) {
        if (!dragEl) return;
        moved = true;
        repositionSidebarRowByPointer(list, dragEl, moveEv.clientY);
      }

      function onUp(upEv) {
        grip.releasePointerCapture(upEv.pointerId);
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        dragEl?.classList.remove('td-dragging');
        clearSidebarDropTargets(list);
        if (dragEl && moved) {
          const keys = sidebarListRowKeys(list);
          const changed =
            keys.length !== dragStartKeys.length ||
            keys.some((key, idx) => key !== dragStartKeys[idx]);
          if (changed) void persistFn(keys);
        }
        dragEl = null;
        dragStartKeys = null;
        moved = false;
      }

      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
    });
  });
  */
}

function attachTodoListReorder(list, orderedIds) {
  attachSidebarListReorder(list, orderedIds.map(String), persistTodoOrder);
}

async function persistTodoOrder(ids) {
  try {
    const numericIds = ids.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0);
    const res = await fetch('/api/todos/reorder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: numericIds }),
    });
    const data = await readApiJson(res);
    todoState.todos = data.todos || todoState.todos;
    refreshTodoSidebarList();
  } catch (e) {
    shell.osAlert({ title: 'Reorder failed', bodyHtml: escHtml(e.message) });
    renderTodoEditor();
  }
}

async function persistChatOrder(ids) {
  try {
    const res = await fetch('/api/chats/reorder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    });
    const data = await readApiJson(res);
    chatState.threads = data.threads || chatState.threads;
    refreshChatSidebarList();
  } catch (e) {
    shell.osAlert({ title: 'Reorder failed', bodyHtml: escHtml(e.message) });
    refreshChatSidebarList();
  }
}

async function persistKnowledgeOrder(slugs) {
  try {
    const res = await adminFetch(`${shell.KNOWLEDGE_API}/reorder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slugs }),
    });
    const data = await readApiJson(res);
    knowledgeState.entries = data.entries || knowledgeState.entries;
    refreshKnowledgeSidebarList();
  } catch (e) {
    if (e.message === 'Session expired') return;
    shell.osAlert({ title: 'Reorder failed', bodyHtml: escHtml(e.message) });
    refreshKnowledgeSidebarList();
  }
}

async function markTodoDone(id) {
  try {
    const res = await fetch(`/api/todos/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'done' }),
    });
    const data = await readApiJson(res);
    const idx = todoState.todos.findIndex((t) => t.id === id);
    if (idx !== -1) todoState.todos[idx] = normalizeTodoItemDates(data);
    if (todoState.activeId === id) {
      todoState.draft = { ...todoState.draft, status: 'done' };
    }
    refreshTodoSidebarList();
  } catch (e) {
    shell.osAlert({ title: 'Could not complete', bodyHtml: escHtml(e.message) });
  }
}

async function reopenTodo(id) {
  try {
    const res = await fetch(`/api/todos/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'open' }),
    });
    const data = await readApiJson(res);
    const idx = todoState.todos.findIndex((t) => t.id === id);
    if (idx !== -1) todoState.todos[idx] = normalizeTodoItemDates(data);
    todoState.filter = 'open';
    refreshTodoSidebarList();
  } catch (e) {
    shell.osAlert({ title: 'Could not reopen', bodyHtml: escHtml(e.message) });
  }
}

async function bulkDeleteTodos(ids) {
  if (!ids.length) return;
  closeOpenSwipeRow();
  const idSet = new Set(ids.map(String));
  for (const id of ids) {
    try {
      const res = await fetch(`/api/todos/${id}`, { method: 'DELETE' });
      await readApiJson(res);
    } catch {
      /* continue */
    }
  }
  todoState.todos = todoState.todos.filter((t) => !idSet.has(String(t.id)));
  if (todoState.activeId != null && idSet.has(String(todoState.activeId))) {
    todoState.activeId = null;
    todoState.draft = null;
    todoState.linkedJob = null;
    getTodoEditor()?.classList.remove('de-pane-active');
  }
  renderTodoEditor();
  shell.syncFooterNav();
}

async function deleteTodo(id) {
  try {
    const res = await fetch(`/api/todos/${id}`, { method: 'DELETE' });
    await readApiJson(res);
    todoState.todos = todoState.todos.filter((t) => t.id !== id);
    if (todoState.activeId === id) {
      todoState.activeId = null;
      todoState.draft = null;
      todoState.linkedJob = null;
      getTodoEditor()?.classList.remove('de-pane-active');
    }
    renderTodoEditor();
    shell.syncFooterNav();
  } catch (e) {
    shell.osAlert({ title: 'Delete failed', bodyHtml: escHtml(e.message) });
  }
}
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

export {
  todoState,
  loadTodoTab,
  navigateToTodo,
  navigateToNewTodoForProject,
  beginNewTodoDrawer,
  startNewTodo,
  normalizeTodoItemDates,
  todoSubline,
  flushTodoAutosave,
  saveActiveTodoDraft,
  parseTodoDueInstant,
  isUtcDateOnlyInstant,
  formatTodoDueTime,
  TODO_PRIORITY_LABELS,
  attachSidebarListReorder,
  persistChatOrder,
  persistKnowledgeOrder,
  formatTodoDueDate,
};
