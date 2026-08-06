/** Railway deploy status bulb in the page header (owner session; see DEPLOY_STATUS_PUBLIC). */
(function () {
  const DEPLOY_POLL_MS_LIVE = 15_000;
  const DEPLOY_POLL_MS_ACTIVE = 5_000;
  let deployPollTimer = null;
  let deployPollMs = DEPLOY_POLL_MS_LIVE;

  async function refreshDeployDot() {
    const dot = document.getElementById('topbar-deploy-dot');
    if (!dot) return;
    try {
      const res = await fetch('/api/deploy/indicator', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok || !data.ok || !data.deploy) {
        dot.hidden = true;
        deployPollMs = DEPLOY_POLL_MS_LIVE;
        return;
      }
      const { tone, tooltip } = data.deploy;
      dot.hidden = false;
      dot.className = `topbar-deploy-dot topbar-deploy-dot--${tone || 'alert'} tt-left`;
      dot.dataset.tooltip = tooltip || 'Deploy status unavailable';
      dot.setAttribute('aria-label', tooltip || 'Deploy status');
      deployPollMs = tone === 'deploying' ? DEPLOY_POLL_MS_ACTIVE : DEPLOY_POLL_MS_LIVE;
    } catch {
      dot.hidden = false;
      dot.className = 'topbar-deploy-dot topbar-deploy-dot--alert tt-left';
      dot.dataset.tooltip = 'Could not check deploy status';
      dot.setAttribute('aria-label', 'Could not check deploy status');
      deployPollMs = DEPLOY_POLL_MS_LIVE;
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
      document.getElementById('topbar-deploy-dot')?.classList.remove('tooltip-open');
    });
    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') {
        document.getElementById('topbar-deploy-dot')?.classList.remove('tooltip-open');
      }
    });
  }
})();
