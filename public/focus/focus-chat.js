/**
 * Alternate focus chat skin — minimal full-screen chats with a speed-dial FAB.
 * Uses the same agent chat React panel as admin (`window.__reaveAgentChat`).
 */
(function focusChatBoot() {
  const root = document.getElementById('focus-root');
  if (!root) return;

  const companyName = root.dataset.companyName || 'Assistant';
  const initialChatId = (root.dataset.chatId || '').trim();

  /** @type {{ activeId: string|null, messages: any[], linkedJobs: {slug:string,title:string}[], threads: any[], dialOpen: boolean, recentOpen: boolean, autoFocusComposer: boolean }} */
  const state = {
    activeId: null,
    messages: [],
    linkedJobs: [],
    threads: [],
    dialOpen: false,
    recentOpen: false,
    autoFocusComposer: false,
  };

  /** Hold mobile keyboard across async create+mount (same idea as admin chat-panel). */
  let composerKeyboardBridge = null;
  let composerKeyboardBridgeTimer = 0;

  function disarmComposerKeyboardBridge() {
    if (composerKeyboardBridgeTimer) {
      clearTimeout(composerKeyboardBridgeTimer);
      composerKeyboardBridgeTimer = 0;
    }
    const bridge = composerKeyboardBridge;
    composerKeyboardBridge = null;
    bridge?.remove();
  }

  function armComposerKeyboardBridge() {
    disarmComposerKeyboardBridge();
    const bridge = document.createElement('textarea');
    bridge.setAttribute('aria-hidden', 'true');
    bridge.tabIndex = -1;
    bridge.setAttribute('autocomplete', 'off');
    bridge.setAttribute('autocorrect', 'off');
    bridge.setAttribute('spellcheck', 'false');
    bridge.style.cssText =
      'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;border:0;padding:0;margin:0;overflow:hidden;z-index:-1;';
    document.body.appendChild(bridge);
    try {
      bridge.focus({ preventScroll: true });
    } catch {
      bridge.focus();
    }
    if (document.activeElement !== bridge) {
      bridge.remove();
      return;
    }
    composerKeyboardBridge = bridge;
    composerKeyboardBridgeTimer = window.setTimeout(disarmComposerKeyboardBridge, 2500);
  }

  const els = {
    idle: document.getElementById('focus-idle'),
    chat: document.getElementById('focus-chat'),
    threadHost: document.getElementById('focus-thread-root'),
    header: document.getElementById('focus-header'),
    projectChips: document.getElementById('focus-project-chips'),
    backBtn: document.getElementById('focus-back'),
    addProjectBtn: document.getElementById('focus-add-project'),
    dial: document.getElementById('focus-dial'),
    fab: document.getElementById('focus-fab'),
    dialActions: /** @type {NodeListOf<HTMLButtonElement>} */ (
      document.querySelectorAll('[data-focus-dial-action]')
    ),
    projectPrompt: document.getElementById('focus-project-prompt'),
    projectPicker: document.getElementById('focus-project-picker'),
    projectSearch: /** @type {HTMLInputElement|null} */ (document.getElementById('focus-project-search')),
    projectList: document.getElementById('focus-project-list'),
    recentSheet: document.getElementById('focus-recent'),
    recentList: document.getElementById('focus-recent-list'),
  };

  /** @type {(() => void)|null} */
  let pickerResolve = null;
  /** @type {'new'|'existing'|null} */
  let pendingProjectKind = null;

  function companyStaffAvatarUrl() {
    return window.__companyStaffAvatarUrl || '/api/branding/icon?size=192&transparent=1';
  }

  function focusAuthorIconUrl(thread) {
    const direct = (thread?.author_icon_url || '').trim();
    if (direct) return direct;
    return companyStaffAvatarUrl();
  }

  function escAttr(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function focusAuthorIconHtml(thread) {
    const url = focusAuthorIconUrl(thread);
    return (
      `<span class="focus-recent-author-icon" aria-hidden="true">` +
      `<img src="${escAttr(url)}" alt="" loading="lazy" decoding="async" />` +
      `</span>`
    );
  }

  async function readApiJson(res) {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = typeof data.error === 'string' ? data.error : `Request failed (${res.status})`;
      throw new Error(msg);
    }
    return data;
  }

  function setDialOpen(open) {
    state.dialOpen = open;
    els.dial?.classList.toggle('open', open);
    els.fab?.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  function showOverlay(el) {
    if (!el?.id) return;
    window.IosSheet?.closeAll();
    window.IosSheet?.open(el.id);
  }

  function hideOverlay() {
    window.IosSheet?.closeAll();
    state.recentOpen = false;
    pickerResolve = null;
    pendingProjectKind = null;
  }

  function onFocusSheetClose() {
    state.recentOpen = false;
    pickerResolve = null;
    pendingProjectKind = null;
  }

  function renderProjectChips() {
    if (!els.projectChips) return;
    els.projectChips.replaceChildren();
    for (const job of state.linkedJobs) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'focus-project-chip';
      chip.textContent = job.title || job.slug;
      chip.title = job.slug;
      chip.addEventListener('click', () => {
        window.location.href = `/admin/?tab=work&slug=${encodeURIComponent(job.slug)}`;
      });
      els.projectChips.appendChild(chip);
    }
  }

  function unmountThread() {
    if (els.threadHost) window.__reaveAgentChat?.unmount(els.threadHost);
  }

  function mountThread() {
    const chatApi = window.__reaveAgentChat;
    if (!chatApi || !els.threadHost || !state.activeId) {
      disarmComposerKeyboardBridge();
      return;
    }
    const autoFocusComposer = state.autoFocusComposer === true;
    state.autoFocusComposer = false;
    if (!autoFocusComposer) disarmComposerKeyboardBridge();
    chatApi.mount(els.threadHost, {
      threadId: state.activeId,
      companyName,
      variant: 'focus',
      initialMessages: state.messages,
      autoFocusComposer,
      onComposeFocus: (focused) => {
        if (focused) disarmComposerKeyboardBridge();
      },
      onAgentRunChange: () => {},
      onRefreshMessages: async () => {
        if (!state.activeId) return;
        try {
          const res = await fetch(`/api/chats/${encodeURIComponent(state.activeId)}`, {
            cache: 'no-store',
          });
          const data = await readApiJson(res);
          state.messages = data.thread.messages || [];
          state.linkedJobs = data.thread.linked_jobs || [];
          renderProjectChips();
          unmountThread();
          mountThread();
        } catch {
          /* keep current view */
        }
      },
      onTitleUpdate: (title) => {
        const thread = state.threads.find((t) => t.id === state.activeId);
        if (thread) thread.title = title;
        syncRecentList();
      },
      onMessagesPersist: (userContent, assistantContent) => {
        const now = new Date().toISOString();
        state.messages.push({ role: 'user', content: userContent, created_at: now });
        state.messages.push({ role: 'assistant', content: assistantContent, created_at: now });
      },
      onLinkedJobsRefresh: () => {
        void refreshLinkedJobs();
      },
    });
  }

  async function refreshLinkedJobs() {
    if (!state.activeId) return;
    try {
      const res = await fetch(`/api/chats/${encodeURIComponent(state.activeId)}`, {
        cache: 'no-store',
      });
      const data = await readApiJson(res);
      state.linkedJobs = data.thread.linked_jobs || [];
      renderProjectChips();
    } catch {
      /* ignore */
    }
  }

  function showChatView(show) {
    els.idle?.toggleAttribute('hidden', show);
    els.chat?.toggleAttribute('hidden', !show);
    els.header?.toggleAttribute('hidden', !show);
    document.body.classList.toggle('focus-chat-active', show);
  }

  async function openChat(threadId, threadMeta) {
    state.activeId = threadId;
    setDialOpen(false);
    hideOverlay(els.projectPrompt);
    hideOverlay(els.projectPicker);

    try {
      const res = await fetch(`/api/chats/${encodeURIComponent(threadId)}`, { cache: 'no-store' });
      const data = await readApiJson(res);
      state.messages = data.thread.messages || [];
      state.linkedJobs = data.thread.linked_jobs || [];
      if (threadMeta && !state.threads.some((t) => t.id === threadId)) {
        state.threads.unshift(threadMeta);
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Could not open session');
      return;
    }

    const url = new URL(window.location.href);
    url.searchParams.set('chat', threadId);
    history.replaceState(null, '', url.pathname + url.search);

    showChatView(true);
    renderProjectChips();
    unmountThread();
    mountThread();
  }

  function closeChatView() {
    unmountThread();
    state.activeId = null;
    state.messages = [];
    state.linkedJobs = [];
    showChatView(false);

    const url = new URL(window.location.href);
    url.searchParams.delete('chat');
    history.replaceState(null, '', url.pathname + url.search);
  }

  async function loadThreads() {
    try {
      const res = await fetch('/api/chats', { cache: 'no-store' });
      const data = await readApiJson(res);
      state.threads = data.threads || [];
    } catch {
      state.threads = [];
    }
  }

  function syncRecentList() {
    if (!els.recentList) return;
    els.recentList.replaceChildren();
    const items = state.threads.filter((t) => !t.archived).slice(0, 30);
    if (!items.length) {
      const empty = document.createElement('p');
      empty.className = 'focus-recent-empty';
      empty.textContent = 'No sessions yet — tap + to start one.';
      els.recentList.appendChild(empty);
      return;
    }
    for (const t of items) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'focus-recent-item';
      if (t.id === state.activeId) btn.classList.add('active');
      btn.innerHTML =
        focusAuthorIconHtml(t) +
        `<span class="focus-recent-copy">` +
        `<span class="focus-recent-title">${escAttr(t.title?.trim() === 'New chat' || !t.title?.trim() ? 'New session' : t.title.trim())}</span>` +
        (t.linked_jobs?.length
          ? `<span class="focus-recent-sub">${escAttr(
              t.linked_jobs.length === 1
                ? t.linked_jobs[0].title || t.linked_jobs[0].slug
                : `${t.linked_jobs.length} projects`,
            )}</span>`
          : '') +
        `</span>`;
      btn.addEventListener('click', () => {
        hideOverlay(els.recentSheet);
        void openChat(t.id, t);
      });
      els.recentList.appendChild(btn);
    }
  }

  async function createThread(sourceJobSlug) {
    const payload = sourceJobSlug ? { sourceJobSlug } : {};
    const res = await fetch('/api/chats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await readApiJson(res);
    const thread = data.thread;
    state.threads.unshift(thread);
    return thread;
  }

  function beginNewChatFlow() {
    setDialOpen(false);
    pendingProjectKind = null;
    showOverlay(els.projectPrompt);
  }

  async function finishNewChatWithProject(slug) {
    // Capture the confirm-tap user-activation before create+mount awaits.
    armComposerKeyboardBridge();
    state.autoFocusComposer = true;
    try {
      const thread = await createThread(slug || undefined);
      await openChat(thread.id, thread);
    } catch (e) {
      disarmComposerKeyboardBridge();
      state.autoFocusComposer = false;
      alert(e instanceof Error ? e.message : 'Could not create session');
    }
  }

  async function linkProjectToActiveChat(slug) {
    if (!state.activeId || !slug) return;
    try {
      const res = await fetch(`/api/chats/${encodeURIComponent(state.activeId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ linkJobSlug: slug }),
      });
      const data = await readApiJson(res);
      state.linkedJobs = data.linked_jobs || [];
      renderProjectChips();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Could not link project');
    }
  }

  async function openProjectPicker(mode) {
    /** @type {'pick'|'link'} */
    const pickerMode = mode;
    showOverlay(els.projectPicker);

    let jobs = [];
    try {
      const res = await fetch('/api/work', { cache: 'no-store' });
      const data = await readApiJson(res);
      jobs = data.jobs || [];
    } catch {
      jobs = [];
    }

    function renderList(filter) {
      if (!els.projectList) return;
      els.projectList.replaceChildren();
      const q = (filter || '').trim().toLowerCase();
      const filtered = jobs.filter((j) => {
        if (!q) return true;
        const hay = `${j.title || ''} ${j.slug || ''} ${j.client || ''}`.toLowerCase();
        return hay.includes(q);
      });
      if (!filtered.length) {
        const empty = document.createElement('p');
        empty.className = 'focus-picker-empty';
        empty.textContent = q ? 'No matching projects.' : 'No projects yet.';
        els.projectList.appendChild(empty);
        return;
      }
      for (const job of filtered.slice(0, 80)) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'focus-picker-item';
        const title = document.createElement('span');
        title.className = 'focus-picker-title';
        title.textContent = job.title || job.slug;
        btn.appendChild(title);
        if (job.client) {
          const sub = document.createElement('span');
          sub.className = 'focus-picker-sub';
          sub.textContent = job.client;
          btn.appendChild(sub);
        }
        btn.addEventListener('click', () => {
          hideOverlay(els.projectPicker);
          if (pickerMode === 'link') void linkProjectToActiveChat(job.slug);
          else void finishNewChatWithProject(job.slug);
        });
        els.projectList.appendChild(btn);
      }
    }

    renderList('');
    if (els.projectSearch) {
      els.projectSearch.value = '';
      els.projectSearch.oninput = () => renderList(els.projectSearch?.value || '');
      els.projectSearch.focus();
    }
  }

  els.fab?.addEventListener('click', () => setDialOpen(!state.dialOpen));

  els.dialActions.forEach((btn) => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.focusDialAction;
      if (action === 'new') beginNewChatFlow();
      else if (action === 'recent') {
        setDialOpen(false);
        syncRecentList();
        showOverlay(els.recentSheet);
        state.recentOpen = true;
      } else if (action === 'admin') {
        window.location.href = '/admin/?tab=chats';
      }
    });
  });

  els.backBtn?.addEventListener('click', () => closeChatView());

  els.addProjectBtn?.addEventListener('click', () => {
    void openProjectPicker('link');
  });

  document.querySelectorAll('[data-focus-project-kind]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const kind = btn.getAttribute('data-focus-project-kind');
      if (kind === 'new') {
        hideOverlay();
        void finishNewChatWithProject('');
      } else if (kind === 'existing') {
        hideOverlay();
        void openProjectPicker('pick');
      }
    });
  });

  for (const sheet of [els.projectPrompt, els.projectPicker, els.recentSheet]) {
    sheet?.addEventListener('ios-sheet-close', onFocusSheetClose);
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && state.dialOpen) {
      setDialOpen(false);
    }
  });

  void loadThreads().then(() => {
    if (initialChatId) void openChat(initialChatId);
  });
})();
