/** Railway deploy status bulb in the page header (owner session; see DEPLOY_STATUS_PUBLIC). */
(function () {
  const DEPLOY_POLL_MS_LIVE = 15_000;
  const DEPLOY_POLL_MS_ACTIVE = 5_000;
  const DEPLOY_POLL_MS_ALERT = 60_000;
  /** Keep in sync with src/lib/agentTones.ts — rising triad when a deploy goes live. */
  const DEPLOY_TONE_AT_KEY = 'reave:deploy-tone-at';
  const DEPLOY_TONE_DEBOUNCE_MS = 8_000;
  let deployPollTimer = null;
  let deployPollMs = DEPLOY_POLL_MS_LIVE;
  let lastDeployTone = null;
  let deployToneCtx = null;
  let deployToneArmed = false;

  function deployToneAudioContext() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!deployToneCtx || deployToneCtx.state === 'closed') deployToneCtx = new AC();
    return deployToneCtx;
  }

  function armDeployDoneTone() {
    if (deployToneArmed) return;
    deployToneArmed = true;
    const resume = () => {
      const c = deployToneAudioContext();
      if (c?.state === 'suspended') void c.resume().catch(() => undefined);
    };
    window.addEventListener('pointerdown', resume, { passive: true });
    window.addEventListener('keydown', resume);
  }

  function playDeployDoneTone() {
    const now = Date.now();
    try {
      const prev = Number(sessionStorage.getItem(DEPLOY_TONE_AT_KEY) || 0);
      if (now - prev < DEPLOY_TONE_DEBOUNCE_MS) return;
      sessionStorage.setItem(DEPLOY_TONE_AT_KEY, String(now));
    } catch {
      /* private mode */
    }
    const c = deployToneAudioContext();
    if (!c) return;
    if (c.state === 'suspended') void c.resume().catch(() => undefined);
    const t = c.currentTime;
    const notes = [
      { freq: 523.25, start: 0, dur: 0.12 },
      { freq: 659.25, start: 0.1, dur: 0.12 },
      { freq: 783.99, start: 0.2, dur: 0.28 },
    ];
    const master = c.createGain();
    master.gain.value = 1;
    master.connect(c.destination);
    for (const n of notes) {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = 'sine';
      osc.frequency.value = n.freq;
      const t0 = t + n.start;
      const t1 = t0 + n.dur;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.075, t0 + 0.018);
      gain.gain.exponentialRampToValueAtTime(0.0001, t1);
      osc.connect(gain);
      gain.connect(master);
      osc.start(t0);
      osc.stop(t1 + 0.02);
    }
  }

  function maybePlayDeployLiveTone(tone) {
    if (lastDeployTone === 'deploying' && tone === 'live') playDeployDoneTone();
    lastDeployTone = tone || null;
  }

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
      maybePlayDeployLiveTone(tone);
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
    armDeployDoneTone();
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
