/**
 * /deck scroll + right-nav controller + optional module toggles / quote summary.
 */
(function () {
  'use strict';

  function $(sel, root) {
    return (root || document).querySelector(sel);
  }
  function $$(sel, root) {
    return Array.from((root || document).querySelectorAll(sel));
  }

  function readPayload() {
    var el = $('#deck-data');
    if (!el) return { sections: [] };
    try {
      return JSON.parse(el.textContent || '{}');
    } catch (_) {
      return { sections: [] };
    }
  }

  var sections = readPayload().sections || [];
  /** @type {Record<string, boolean>} id → included (default true) */
  var included = {};
  sections.forEach(function (s) {
    included[s.id] = true;
  });

  var activeSceneId = null;
  var scrollingTo = null;
  var excludeAdvanceTimer = null;
  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /** @type {HTMLElement[]} */
  var videoLayers = [];
  /** @type {HTMLElement[]} */
  var productScenes = [];
  var quoteVideoLayer = null;
  var quoteSceneEl = null;

  function sceneOrder() {
    return $$('[data-deck-scene]').map(function (el) {
      return el.getAttribute('data-deck-scene');
    }).filter(Boolean);
  }

  function nextSceneId(id) {
    var order = sceneOrder();
    var idx = order.indexOf(id);
    if (idx < 0 || idx >= order.length - 1) return null;
    return order[idx + 1];
  }

  function clearExcludeAdvance() {
    if (excludeAdvanceTimer) {
      window.clearTimeout(excludeAdvanceTimer);
      excludeAdvanceTimer = null;
    }
  }

  /** After excluding a module, advance to the next scene. */
  function scheduleAdvanceAfterExclude(fromId) {
    clearExcludeAdvance();
    var next = nextSceneId(fromId);
    if (!next) return;
    excludeAdvanceTimer = window.setTimeout(function () {
      excludeAdvanceTimer = null;
      // Only advance if still excluded and we haven't navigated elsewhere.
      if (included[fromId] !== false) return;
      if (activeSceneId && activeSceneId !== fromId && activeSceneId !== scrollingTo) return;
      scrollToScene(next);
    }, 1500);
  }

  function setNavActive(id) {
    $$('.d-item[data-app]').forEach(function (btn) {
      var on = btn.getAttribute('data-app') === id;
      btn.classList.toggle('active', on);
      if (on) btn.setAttribute('aria-current', 'true');
      else btn.removeAttribute('aria-current');
    });
  }

  function setSceneActive(id) {
    $$('[data-deck-scene]').forEach(function (el) {
      el.classList.toggle('is-active', el.getAttribute('data-deck-scene') === id);
    });
  }

  function applyDeclinedUi() {
    sections.forEach(function (s) {
      var on = included[s.id] !== false;
      var scene = $('#scene-' + s.id);
      var dock = $('#d-' + s.id);
      var note = $('[data-opt-note="' + s.id + '"]');
      var input = $('[data-opt-toggle="' + s.id + '"]');
      var labelText = input && input.closest('.deck-opt')
        ? input.closest('.deck-opt').querySelector('.deck-opt-label')
        : null;

      if (scene) scene.classList.toggle('is-declined', s.optional && !on);
      if (dock) {
        dock.classList.toggle('is-declined', s.optional && !on);
        if (s.optional) {
          dock.title = on
            ? s.label || s.id
            : (s.label || s.id) + ' — excluded (open to turn back on)';
        }
      }
      if (note) note.hidden = !(s.optional && !on);
      if (input) {
        input.checked = on;
        input.disabled = false;
        input.setAttribute('aria-checked', on ? 'true' : 'false');
      }
      if (labelText) {
        labelText.textContent = on ? 'Include in quote' : 'Excluded — turn back on';
      }
    });
    refreshQuoteSummary();
  }

  function refreshQuoteSummary() {
    var includedEl = $('#quote-included');
    var declinedEl = $('#quote-declined');
    var desc = $('#quote-description');
    if (!includedEl || !declinedEl) return;

    var inList = [];
    var outList = [];
    sections.forEach(function (s) {
      var label = s.quoteLabel || s.label || s.id;
      if (included[s.id] !== false) inList.push(label);
      else if (s.optional) outList.push(label);
    });

    includedEl.innerHTML = inList.length
      ? inList.map(function (t) {
          return '<li>' + escapeHtml(t) + '</li>';
        }).join('')
      : '<li class="deck-quote-empty">Nothing included</li>';

    declinedEl.innerHTML = outList.length
      ? outList.map(function (t) {
          return '<li>' + escapeHtml(t) + '</li>';
        }).join('')
      : '<li class="deck-quote-empty">None opted out</li>';

    if (desc) {
      var lines = ['Business OS quote package', '', 'Included:'];
      inList.forEach(function (t) {
        lines.push('- ' + t);
      });
      if (outList.length) {
        lines.push('', 'Opted out (excluded from quote):');
        outList.forEach(function (t) {
          lines.push('- ' + t);
        });
      } else {
        lines.push('', 'Opted out: none');
      }
      desc.value = lines.join('\n');
    }
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function activateScene(id, opts) {
    opts = opts || {};
    if (!id || (id === activeSceneId && !opts.force)) return;
    activeSceneId = id;
    setSceneActive(id);
    setNavActive(id);
  }

  function scrollToScene(id) {
    var track = $('#scroll-track');
    var el = $('#scene-' + id);
    if (!el) {
      activateScene(id, { force: true });
      return;
    }
    scrollingTo = id;
    activateScene(id, { force: true });
    if (track) {
      track.scrollTo({ top: el.offsetTop, behavior: 'smooth' });
    } else {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    window.setTimeout(function () {
      if (scrollingTo === id) scrollingTo = null;
    }, 900);
  }

  function setVideoMediaState(media, vx, vy, opacity, scale) {
    if (!media) return;
    media.style.setProperty('--vx', vx + '%');
    media.style.setProperty('--vy', vy + '%');
    media.style.setProperty('--vopacity', String(opacity));
    media.style.setProperty('--vscale', String(scale));
  }

  function enterOffset(dir, progress) {
    var remain = 1 - progress;
    switch (dir) {
      case 'right':
        return [remain * 100, 0];
      case 'left':
        return [-remain * 100, 0];
      case 'up':
        return [0, remain * 100];
      case 'down':
        return [0, -remain * 100];
      default:
        return [0, 0];
    }
  }

  function exitOffset(dir, progress) {
    var off = enterOffset(dir, 0);
    return [-off[0] * progress, -off[1] * progress];
  }

  function layerMedia(layer) {
    return layer ? layer.querySelector('.deck-video-media') : null;
  }

  function layerVideo(layer) {
    return layer ? layer.querySelector('.deck-video-el') : null;
  }

  function ensureVideoLoaded(layer) {
    var video = layerVideo(layer);
    if (!video || video.dataset.loaded === 'true') return;
    var src = video.getAttribute('data-src');
    if (!src) return;
    video.dataset.loaded = 'true';
    video.src = src;
    video.addEventListener(
      'loadeddata',
      function () {
        video.classList.add('is-ready');
      },
      { once: true },
    );
    video.addEventListener(
      'error',
      function () {
        video.classList.remove('is-ready');
        video.removeAttribute('src');
        video.dataset.loaded = 'false';
      },
      { once: true },
    );
  }

  function playVideo(layer) {
    var video = layerVideo(layer);
    if (!video || !video.getAttribute('src')) return;
    var play = video.play();
    if (play && play.catch) play.catch(function () {});
  }

  function pauseVideo(layer) {
    var video = layerVideo(layer);
    if (!video) return;
    video.pause();
  }

  function resetVideoLayers() {
    videoLayers.forEach(function (layer) {
      layer.classList.remove('is-live');
      layer.style.zIndex = '0';
      setVideoMediaState(layerMedia(layer), 0, 0, 0, 1);
      pauseVideo(layer);
    });
    if (quoteVideoLayer) {
      quoteVideoLayer.classList.remove('is-live');
      quoteVideoLayer.style.zIndex = '0';
      setVideoMediaState(layerMedia(quoteVideoLayer), 0, 0, 0, 1);
    }
  }

  function showSingleVideoLayer(index) {
    resetVideoLayers();
    var layer = videoLayers[index];
    if (!layer) return;
    layer.classList.add('is-live');
    layer.style.zIndex = '2';
    ensureVideoLoaded(layer);
    setVideoMediaState(layerMedia(layer), 0, 0, 1, 1);
    playVideo(layer);
    if (videoLayers[index + 1]) ensureVideoLoaded(videoLayers[index + 1]);
    if (videoLayers[index - 1]) ensureVideoLoaded(videoLayers[index - 1]);
  }

  function showQuoteVideo(progress) {
    resetVideoLayers();
    if (!quoteVideoLayer) return;
    quoteVideoLayer.classList.add('is-live');
    quoteVideoLayer.style.zIndex = '2';
    var opacity = reducedMotion ? (progress > 0.35 ? 1 : 0) : progress;
    setVideoMediaState(layerMedia(quoteVideoLayer), 0, 0, opacity, 1);
  }

  function applyVideoTransition(fromIdx, toIdx, progress) {
    resetVideoLayers();
    var fromLayer = videoLayers[fromIdx];
    var toLayer = videoLayers[toIdx];
    if (!fromLayer || !toLayer) return;

    fromLayer.classList.add('is-live');
    toLayer.classList.add('is-live');
    ensureVideoLoaded(fromLayer);
    ensureVideoLoaded(toLayer);
    if (videoLayers[fromIdx - 1]) ensureVideoLoaded(videoLayers[fromIdx - 1]);
    if (videoLayers[toIdx + 1]) ensureVideoLoaded(videoLayers[toIdx + 1]);

    var enterDir = toLayer.getAttribute('data-enter') || 'right';
    var enter = enterOffset(enterDir, progress);
    var exit = exitOffset(enterDir, progress);
    var fromOpacity = 1 - progress;
    var toOpacity = progress;
    var fromScale = 1 - progress * 0.06;
    var toScale = 0.94 + progress * 0.06;

    if (reducedMotion) {
      enter = [0, 0];
      exit = [0, 0];
      fromScale = 1;
      toScale = 1;
    }

    setVideoMediaState(layerMedia(fromLayer), exit[0], exit[1], fromOpacity, fromScale);
    setVideoMediaState(layerMedia(toLayer), enter[0], enter[1], toOpacity, toScale);
    fromLayer.style.zIndex = '1';
    toLayer.style.zIndex = '2';

    if (toOpacity >= fromOpacity) playVideo(toLayer);
    else playVideo(fromLayer);
    if (toOpacity < 0.35) pauseVideo(toLayer);
    if (fromOpacity < 0.35) pauseVideo(fromLayer);
  }

  function updateVideoStage() {
    if (!videoLayers.length) return;
    var track = $('#scroll-track');
    if (!track) return;

    if (quoteSceneEl) {
      var quoteTop = quoteSceneEl.offsetTop;
      var quoteStart = quoteTop - track.clientHeight * 0.35;
      if (track.scrollTop >= quoteStart) {
        var quoteProgress = Math.min(
          1,
          Math.max(0, (track.scrollTop - quoteStart) / (quoteTop - quoteStart || 1)),
        );
        showQuoteVideo(quoteProgress);
        return;
      }
    }

    if (productScenes.length === 0) return;

    var scrollTop = track.scrollTop;
    var firstTop = productScenes[0].offsetTop;
    if (scrollTop <= firstTop + 2) {
      showSingleVideoLayer(0);
      return;
    }

    for (var i = 0; i < productScenes.length - 1; i++) {
      var topA = productScenes[i].offsetTop;
      var topB = productScenes[i + 1].offsetTop;
      if (scrollTop >= topA && scrollTop < topB) {
        var span = topB - topA || 1;
        var progress = Math.min(1, Math.max(0, (scrollTop - topA) / span));
        applyVideoTransition(i, i + 1, progress);
        return;
      }
    }

    showSingleVideoLayer(productScenes.length - 1);
  }

  function bindVideoStage() {
    videoLayers = $$('[data-deck-video]').filter(function (el) {
      return el.getAttribute('data-deck-video') !== 'quote';
    });
    quoteVideoLayer = $('[data-deck-video="quote"]');
    quoteSceneEl = $('#scene-quote');
    productScenes = sections
      .map(function (s) {
        return $('#scene-' + s.id);
      })
      .filter(Boolean);

    var track = $('#scroll-track');
    if (!track || !videoLayers.length) return;

    var ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(function () {
        updateVideoStage();
        ticking = false;
      });
    }

    track.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    updateVideoStage();
  }

  function bindScrollEngagement() {
    var track = $('#scroll-track');
    var scenes = $$('[data-deck-scene]');
    if (!scenes.length) return;

    var ratios = new Map();
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          ratios.set(entry.target, entry.intersectionRatio);
        });
        if (scrollingTo) {
          activateScene(scrollingTo);
          return;
        }
        var best = null;
        var bestRatio = 0;
        scenes.forEach(function (scene) {
          var r = ratios.get(scene) || 0;
          if (r > bestRatio) {
            bestRatio = r;
            best = scene;
          }
        });
        if (best && bestRatio > 0.35) {
          var id = best.getAttribute('data-deck-scene');
          if (id) activateScene(id);
        }
      },
      {
        root: track || null,
        threshold: [0, 0.25, 0.5, 0.75, 1],
        rootMargin: '0px',
      },
    );

    scenes.forEach(function (scene) {
      observer.observe(scene);
    });
  }

  function bindOptionalToggles() {
    $$('[data-opt-toggle]').forEach(function (input) {
      input.addEventListener('change', function () {
        var id = input.getAttribute('data-opt-toggle');
        if (!id) return;
        var on = !!input.checked;
        included[id] = on;
        applyDeclinedUi();
        if (on) {
          clearExcludeAdvance();
        } else {
          scheduleAdvanceAfterExclude(id);
        }
      });
    });
  }

  $$('.d-item[data-app]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      scrollToScene(btn.getAttribute('data-app'));
    });
  });

  var copyBtn = $('#quote-copy');
  if (copyBtn) {
    copyBtn.addEventListener('click', function () {
      var desc = $('#quote-description');
      if (!desc) return;
      var text = desc.value || '';
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(
          function () {
            copyBtn.textContent = 'Copied';
            setTimeout(function () {
              copyBtn.textContent = 'Copy description';
            }, 1400);
          },
          function () {},
        );
      } else {
        desc.focus();
        desc.select();
      }
    });
  }

  function startDeck() {
    bindVideoStage();
    bindScrollEngagement();
    bindOptionalToggles();
    applyDeclinedUi();
    var first = sections[0] && sections[0].id;
    if (first) activateScene(first, { force: true });
  }

  window.addEventListener('load', function () {
    var fill = $('#boot-fill');
    if (fill) fill.style.width = '100%';
    setTimeout(function () {
      var boot = $('#boot');
      if (boot) {
        boot.style.opacity = '0';
        setTimeout(function () {
          boot.remove();
          startDeck();
        }, 500);
      } else {
        startDeck();
      }
    }, 2600);
  });
})();
