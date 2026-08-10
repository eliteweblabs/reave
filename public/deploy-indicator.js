/** Railway deploy status bulb in the page header (public dev indicator). */
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

  async function refreshDeployDot() {
    const dot = document.getElementById('topbar-deploy-dot');
    if (!dot) return;
    try {
      const res = await fetch('/api/deploy/indicator', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok || !data.ok || !data.deploy) {
        dot.hidden = true;
        dot.classList.remove('tooltip-open');
        window.ProximityTooltip?.hide?.();
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
    if (document.hidden) return;
    await refreshDeployDot();
    deployPollTimer = setTimeout(() => {
      void pollDeployDot();
    }, deployPollMs);
  }

  function startDeployPoll() {
    stopDeployPoll();
    if (document.hidden) return;
    void pollDeployDot();
  }

  function stopDeployPoll() {
    if (deployPollTimer) {
      clearTimeout(deployPollTimer);
      deployPollTimer = null;
    }
  }

  function initDeployIndicator() {
    const dot = document.getElementById('topbar-deploy-dot');
    if (!dot || dot.dataset.deployBound) return;
    dot.dataset.deployBound = '1';
    dot.addEventListener('click', (ev) => {
      ev.stopPropagation();
      dot.classList.toggle('tooltip-open');
      window.ProximityTooltip?.sync?.();
    });
    startDeployPoll();
  }

  window.DeployIndicator = {
    refresh: refreshDeployDot,
    startPoll: startDeployPoll,
    stopPoll: stopDeployPoll,
    init: initDeployIndicator,
  };

  if (document.getElementById('topbar-deploy-dot')) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initDeployIndicator);
    } else {
      initDeployIndicator();
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.getElementById('topbar-deploy-dot')) return;
    if (document.hidden) stopDeployPoll();
    else startDeployPoll();
  });

  if (!document.documentElement.dataset.deployTooltipBound) {
    document.documentElement.dataset.deployTooltipBound = '1';
    document.addEventListener('click', () => {
      const dot = document.getElementById('topbar-deploy-dot');
      if (!dot?.classList.contains('tooltip-open')) return;
      dot.classList.remove('tooltip-open');
      window.ProximityTooltip?.sync?.();
    });
    document.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Escape') return;
      const dot = document.getElementById('topbar-deploy-dot');
      if (!dot?.classList.contains('tooltip-open')) return;
      dot.classList.remove('tooltip-open');
      window.ProximityTooltip?.hide?.();
    });
  }
})();
