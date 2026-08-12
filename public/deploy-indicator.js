/** Railway deploy status bulb in the page header (owner session; see DEPLOY_STATUS_PUBLIC). */
(function () {
  const DEPLOY_POLL_MS_LIVE = 15_000;
  const DEPLOY_POLL_MS_ACTIVE = 5_000;
  const DEPLOY_POLL_MS_ALERT = 60_000;
  let deployPollTimer = null;
  let deployPollMs = DEPLOY_POLL_MS_LIVE;

  function publishDeployIndicator(deploy) {
    try {
      window.dispatchEvent(new CustomEvent('reave:deploy-indicator', { detail: deploy ?? null }));
    } catch {
      /* ignore */
    }
  }

  /** After 401/403, never poll again — endpoint is owner-only unless DEPLOY_STATUS_PUBLIC. */
  let deployAuthDenied = false;

  function deployDotEl() {
    return document.getElementById('topbar-deploy-dot');
  }

  function isDeployStatusPublic() {
    return deployDotEl()?.dataset?.deployPublic === '1';
  }

  function serverUserId() {
    if (document.body?.dataset?.userId === undefined) return null;
    return document.body.dataset.userId.trim() || '';
  }

  /** Soft sign-out: Clerk cleared the session but this page still has the poller. */
  function clerkSessionGone() {
    try {
      const clerk = window.Clerk;
      return Boolean(clerk?.loaded && !clerk.user);
    } catch {
      return false;
    }
  }

  /**
   * Whether the client may call /api/deploy/indicator.
   * @returns {boolean|null} true = poll, false = stop, null = wait (Clerk not ready)
   */
  function canPollDeployIndicator() {
    if (deployAuthDenied) return false;
    if (isDeployStatusPublic()) return true;

    const uid = serverUserId();
    if (uid !== null && !uid) return false;

    if (document.body?.dataset?.isOwner !== undefined) {
      return document.body.dataset.isOwner === '1';
    }

    if (clerkSessionGone()) return false;
    const clerk = window.Clerk;
    if (clerk && !clerk.loaded) return null;
    if (clerk?.loaded && !clerk.user) return false;

    return uid !== null ? Boolean(uid) : true;
  }

  function denyDeployPoll() {
    deployAuthDenied = true;
    stopDeployPoll();
    hideDeployDot();
    publishDeployIndicator(null);
  }

  function hideDeployDot() {
    const dot = deployDotEl();
    if (!dot) return;
    dot.hidden = true;
    dot.classList.remove('tooltip-open');
    window.ProximityTooltip?.hide?.();
  }

  async function refreshDeployDot() {
    const dot = deployDotEl();
    if (!dot || deployAuthDenied) return;

    const allowed = canPollDeployIndicator();
    if (allowed === false) {
      denyDeployPoll();
      return;
    }
    if (allowed === null) return;

    try {
      const res = await fetch('/api/deploy/indicator', { cache: 'no-store' });
      if (res.status === 401 || res.status === 403) {
        denyDeployPoll();
        return;
      }
      const data = await res.json();
      if (!res.ok || !data.ok || !data.deploy) {
        hideDeployDot();
        deployPollMs = DEPLOY_POLL_MS_LIVE;
        publishDeployIndicator(null);
        return;
      }
      const { tone, tooltip } = data.deploy;
      const keepOpen = dot.classList.contains('tooltip-open');
      dot.hidden = false;
      dot.className = `topbar-deploy-dot topbar-deploy-dot--${tone || 'alert'} tt-left${keepOpen ? ' tooltip-open' : ''}`;
      dot.dataset.tooltip = tooltip || 'Deploy status unavailable';
      dot.setAttribute('aria-label', tooltip || 'Deploy status');
      if (keepOpen) window.ProximityTooltip?.sync?.();
      deployPollMs =
        tone === 'deploying'
          ? DEPLOY_POLL_MS_ACTIVE
          : tone === 'alert'
            ? DEPLOY_POLL_MS_ALERT
            : DEPLOY_POLL_MS_LIVE;
      publishDeployIndicator(data.deploy);
    } catch {
      const keepOpen = dot.classList.contains('tooltip-open');
      dot.hidden = false;
      dot.className = `topbar-deploy-dot topbar-deploy-dot--alert tt-left${keepOpen ? ' tooltip-open' : ''}`;
      dot.dataset.tooltip = 'Could not check deploy status';
      dot.setAttribute('aria-label', 'Could not check deploy status');
      if (keepOpen) window.ProximityTooltip?.sync?.();
      deployPollMs = DEPLOY_POLL_MS_ALERT;
    }
  }

  async function pollDeployDot() {
    if (document.hidden || deployAuthDenied) return;
    const allowed = canPollDeployIndicator();
    if (allowed === false) {
      denyDeployPoll();
      return;
    }
    if (allowed === null) {
      deployPollTimer = setTimeout(() => {
        void pollDeployDot();
      }, 250);
      return;
    }
    await refreshDeployDot();
    if (deployAuthDenied || document.hidden) return;
    deployPollTimer = setTimeout(() => {
      void pollDeployDot();
    }, deployPollMs);
  }

  function startDeployPoll() {
    stopDeployPoll();
    if (document.hidden || deployAuthDenied) return;
    const allowed = canPollDeployIndicator();
    if (allowed === false) {
      denyDeployPoll();
      return;
    }
    void pollDeployDot();
  }

  function stopDeployPoll() {
    if (deployPollTimer) {
      clearTimeout(deployPollTimer);
      deployPollTimer = null;
    }
  }

  function initDeployIndicator() {
    const dot = deployDotEl();
    if (!dot || dot.dataset.deployBound) return;
    const allowed = canPollDeployIndicator();
    if (allowed === false) {
      denyDeployPoll();
      return;
    }
    dot.dataset.deployBound = '1';
    dot.addEventListener('click', (ev) => {
      ev.stopPropagation();
      dot.classList.toggle('tooltip-open');
      window.ProximityTooltip?.sync?.();
    });
    startDeployPoll();
  }

  function bindClerkResume() {
    if (document.documentElement.dataset.deployClerkBound) return;
    document.documentElement.dataset.deployClerkBound = '1';
    window.addEventListener(
      'clerk-loaded',
      () => {
        if (!deployDotEl()) return;
        if (canPollDeployIndicator() === false) denyDeployPoll();
        else startDeployPoll();
      },
      true,
    );
  }

  window.DeployIndicator = {
    refresh: refreshDeployDot,
    startPoll: startDeployPoll,
    stopPoll: stopDeployPoll,
    init: initDeployIndicator,
  };

  bindClerkResume();

  if (deployDotEl()) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initDeployIndicator);
    } else {
      initDeployIndicator();
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (!deployDotEl()) return;
    if (document.hidden) stopDeployPoll();
    else startDeployPoll();
  });

  window.addEventListener('pageshow', (ev) => {
    if (!deployDotEl()) return;
    if (ev.persisted && canPollDeployIndicator() === false) denyDeployPoll();
    else if (!document.hidden) startDeployPoll();
  });

  if (!document.documentElement.dataset.deployTooltipBound) {
    document.documentElement.dataset.deployTooltipBound = '1';
    document.addEventListener('click', () => {
      const dot = deployDotEl();
      if (!dot?.classList.contains('tooltip-open')) return;
      dot.classList.remove('tooltip-open');
      window.ProximityTooltip?.sync?.();
    });
    document.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Escape') return;
      const dot = deployDotEl();
      if (!dot?.classList.contains('tooltip-open')) return;
      dot.classList.remove('tooltip-open');
      window.ProximityTooltip?.hide?.();
    });
  }
})();
