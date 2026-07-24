/** Pending-review count on the header user icon (all signed-in pages). */
(function () {
  let count = 0;
  let timer = null;

  function targets() {
    const badge = document.getElementById('topbar-review-badge');
    const toggle = document.getElementById('topbar-profile-toggle');
    const adminEntry = document.querySelector('.app-header-admin-entry');
    return { badge, toggle, adminEntry };
  }

  function defaultAriaLabel(el) {
    if (!el) return '';
    if (!el.dataset.defaultAriaLabel) {
      el.dataset.defaultAriaLabel = el.getAttribute('aria-label') || '';
    }
    return el.dataset.defaultAriaLabel;
  }

  function sync(n) {
    count = Math.max(0, Number(n) || 0);
    const { badge, toggle, adminEntry } = targets();
    if (!badge) return;

    if (onAdminShell()) {
      badge.hidden = true;
      badge.textContent = '0';
      if (toggle) toggle.setAttribute('aria-label', defaultAriaLabel(toggle));
      if (adminEntry) adminEntry.setAttribute('aria-label', defaultAriaLabel(adminEntry));
      return;
    }

    if (count > 0) {
      badge.hidden = false;
      badge.textContent = count > 99 ? '99+' : String(count);
      const hint = `${count} review${count === 1 ? '' : 's'} pending`;
      if (toggle) toggle.setAttribute('aria-label', `${defaultAriaLabel(toggle)} (${hint})`.trim());
      if (adminEntry) adminEntry.setAttribute('aria-label', `${defaultAriaLabel(adminEntry)} (${hint})`.trim());
    } else {
      badge.hidden = true;
      badge.textContent = '0';
      if (toggle) toggle.setAttribute('aria-label', defaultAriaLabel(toggle));
      if (adminEntry) adminEntry.setAttribute('aria-label', defaultAriaLabel(adminEntry));
    }
  }

  async function refresh() {
    try {
      const [dashRes, inboxRes] = await Promise.all([
        fetch('/api/admin/dashboard', { cache: 'no-store' }),
        fetch('/api/email/inbox?limit=100', { cache: 'no-store' }),
      ]);
      if (inboxRes.ok) {
        const inboxData = await inboxRes.json();
        let n = Math.max(0, Number(inboxData.digest?.reviewsPending) || 0);
        if (dashRes.ok) {
          const dash = await dashRes.json();
          if (dash.ok) {
            const stats = dash.stats || {};
            n = Math.max(0, Number(stats.reviewsPending ?? stats.automationPending ?? n) || 0);
          }
        }
        sync(n);
        return;
      }
      if (dashRes.ok) {
        const dash = await dashRes.json();
        if (dash.ok) {
          const stats = dash.stats || {};
          sync(stats.reviewsPending ?? stats.automationPending ?? 0);
        }
      }
    } catch {}
  }

  function stopPoll() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  function startPoll() {
    stopPoll();
    if (document.hidden) return;
    refresh();
    timer = setInterval(refresh, 60000);
  }

  function onAdminShell() {
    const path = location.pathname.replace(/\/$/, '') || '/';
    return path === '/admin' || path.startsWith('/admin/');
  }

  window.ReviewBadge = { sync, refresh, startPoll, stopPoll, getCount: () => count };

  if (!document.getElementById('topbar-review-badge')) return;

  document.addEventListener('visibilitychange', () => {
    if (onAdminShell()) return;
    if (document.hidden) stopPoll();
    else startPoll();
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type === 'reave-inbox-push') refresh();
    });
  }

  if (!onAdminShell()) startPoll();
})();
