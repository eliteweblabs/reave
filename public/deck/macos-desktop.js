/**
 * macOS-style desktop window manager + scroll scene engagement for /deck.
 * Reads section payload from #deck-data.
 */
(function () {
  'use strict';

  var HEADER_TOP = 64;

  function $(sel, root) {
    return (root || document).querySelector(sel);
  }
  function $$(sel, root) {
    return Array.from((root || document).querySelectorAll(sel));
  }

  function headerOffset() {
    var header = $('.app-header');
    if (!header) return HEADER_TOP;
    return Math.max(HEADER_TOP, Math.ceil(header.getBoundingClientRect().bottom));
  }

  function readPayload() {
    var el = $('#deck-data');
    if (!el) return { companyName: '', sections: [] };
    try {
      return JSON.parse(el.textContent || '{}');
    } catch (_) {
      return { companyName: '', sections: [] };
    }
  }

  var data = readPayload();
  var sections = data.sections || [];
  var zIdx = 100;
  var wins = {};
  var activeSceneId = null;
  var scrollingTo = null;

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function escapeAttr(str) {
    return escapeHtml(str).replace(/'/g, '&#39;');
  }

  function findSection(id) {
    return sections.find(function (s) {
      return s.id === id;
    });
  }

  function setActive(id) {
    $$('.win').forEach(function (w) {
      w.classList.add('inactive');
    });
    var $w = $('#w-' + id);
    if ($w) {
      $w.classList.remove('inactive');
      $w.style.zIndex = String(++zIdx);
    }
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

  function closeWin(id) {
    var $w = $('#w-' + id);
    if ($w) {
      $w.style.opacity = '0';
      $w.style.transform = 'scale(0.92)';
      setTimeout(function () {
        $w.remove();
      }, 150);
    }
    delete wins[id];
    var dock = $('#d-' + id);
    if (dock) dock.classList.remove('open');
  }

  function maxWin(id) {
    var $w = $('#w-' + id);
    if (!$w) return;
    var top = headerOffset();
    var rightDock = window.matchMedia('(min-width: 640px)').matches;
    if ($w.classList.contains('maxed')) {
      $w.style.top = $w.dataset.ot || top + 'px';
      $w.style.left = $w.dataset.ol || '48px';
      $w.style.width = $w.dataset.ow || '520px';
      $w.style.height = $w.dataset.oh || '640px';
      $w.classList.remove('maxed');
    } else {
      $w.dataset.ot = $w.style.top;
      $w.dataset.ol = $w.style.left;
      $w.dataset.ow = $w.style.width;
      $w.dataset.oh = $w.style.height;
      $w.style.top = top + 'px';
      $w.style.left = '0';
      if (rightDock) {
        $w.style.width = 'calc(100% - 88px)';
        $w.style.height = 'calc(100% - ' + top + 'px)';
      } else {
        $w.style.width = '100%';
        $w.style.height = 'calc(100% - ' + (top + 90) + 'px)';
      }
      $w.classList.add('maxed');
    }
  }

  function makeDraggable(el, handle, id) {
    var dragging = false;
    var ox = 0;
    var oy = 0;
    handle.addEventListener('pointerdown', function (e) {
      if (e.target.closest('.tl')) return;
      dragging = true;
      ox = e.clientX - el.offsetLeft;
      oy = e.clientY - el.offsetTop;
      try {
        handle.setPointerCapture(e.pointerId);
      } catch (_) {}
      setActive(id);
    });
    handle.addEventListener('pointermove', function (e) {
      if (!dragging || el.classList.contains('maxed')) return;
      el.style.left = Math.max(0, e.clientX - ox) + 'px';
      el.style.top = Math.max(headerOffset(), e.clientY - oy) + 'px';
    });
    handle.addEventListener('pointerup', function () {
      dragging = false;
    });
  }

  function deviceClass(device) {
    if (device === 'laptop') return 'gif-device--laptop';
    if (device === 'phone-desk') return 'gif-device--phone-desk';
    if (device === 'tablet') return 'gif-device--tablet';
    return 'gif-device--phone-hand';
  }

  function renderBody(s) {
    var device = s.device || 'phone-hand';
    return (
      '<div class="s-home">' +
      '<div class="copy">' +
      '<div class="tag"><span class="pulse"></span> ' +
      escapeHtml(data.companyName || 'Business OS') +
      '</div>' +
      '<h2>' +
      escapeHtml(s.featureTitle || s.name) +
      '</h2>' +
      '<p>' +
      escapeHtml(s.featureBody || s.summary || '') +
      '</p>' +
      '</div>' +
      '<div class="preview">' +
      '<div class="gif-device ' +
      deviceClass(device) +
      '">' +
      '<div class="gif-device-shell">' +
      '<img data-gif-src="' +
      escapeAttr(s.gif) +
      '" alt="" hidden />' +
      '<div class="gif-ph">Recording coming soon</div>' +
      '</div></div></div></div>'
    );
  }

  function hydrateGifs(root) {
    $$('[data-gif-src]', root).forEach(function (img) {
      var src = img.getAttribute('data-gif-src');
      var ph = img.parentElement && img.parentElement.querySelector('.gif-ph');
      if (!src) return;
      img.onload = function () {
        img.hidden = false;
        if (ph) ph.hidden = true;
      };
      img.onerror = function () {
        img.hidden = true;
        if (ph) ph.hidden = false;
      };
      img.src = src;
    });
  }

  function createWin(id, s) {
    wins[id] = s;
    var top = Math.max(s.top || HEADER_TOP, headerOffset());
    var html =
      '<div class="win opening" id="w-' +
      id +
      '" style="width:' +
      s.w +
      'px;height:' +
      s.h +
      'px;top:' +
      top +
      'px;left:' +
      s.left +
      'px;z-index:' +
      ++zIdx +
      '">' +
      '<div class="win-head"><div class="tl"><span class="c" data-act="close"></span><span class="m" data-act="min"></span><span class="x" data-act="max"></span></div><div class="win-title">' +
      escapeHtml(s.name) +
      '</div></div>' +
      '<div class="win-body" id="wb-' +
      id +
      '">' +
      renderBody(s) +
      '</div></div>';
    $('#wins').insertAdjacentHTML('beforeend', html);
    var $w = $('#w-' + id);
    makeDraggable($w, $w.querySelector('.win-head'), id);
    $w.addEventListener('mousedown', function () {
      setActive(id);
    });
    $w.querySelector('[data-act="close"]').addEventListener('click', function (e) {
      e.stopPropagation();
      closeWin(id);
    });
    $w.querySelector('[data-act="min"]').addEventListener('click', function (e) {
      e.stopPropagation();
      $w.style.display = 'none';
    });
    $w.querySelector('[data-act="max"]').addEventListener('click', function (e) {
      e.stopPropagation();
      maxWin(id);
    });
    setTimeout(function () {
      $w.classList.remove('opening');
    }, 220);
    setActive(id);
    hydrateGifs($w);
  }

  /** Open (or focus) a section window — windows stack for now. */
  function openSection(id) {
    var s = findSection(id);
    if (!s) return;
    var $d = $('#d-' + id);
    if ($d && !$d.classList.contains('open') && !$d.classList.contains('bouncing')) {
      $d.classList.add('bouncing');
      setTimeout(function () {
        $d.classList.remove('bouncing');
        $d.classList.add('open');
      }, 550);
    } else if ($d) {
      $d.classList.add('open');
    }
    if (wins[id]) {
      var $w = $('#w-' + id);
      if ($w) {
        $w.style.display = '';
        $w.style.opacity = '1';
        $w.style.transform = '';
      }
      setActive(id);
      return;
    }
    createWin(id, s);
  }

  /**
   * Scroll engagement: activate one scene at a time.
   * Creates/stacks the OSX window; delete is available via traffic lights for now.
   */
  function activateScene(id, opts) {
    opts = opts || {};
    if (!id || (id === activeSceneId && !opts.force)) return;
    activeSceneId = id;
    setSceneActive(id);
    setNavActive(id);
    openSection(id);
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

  // Dock + context menu are controllers: jump scroll + open window
  $$('.d-item[data-app]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      scrollToScene(btn.getAttribute('data-app'));
    });
  });
  $$('.ctx-i[data-app]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      scrollToScene(btn.getAttribute('data-app'));
      var ctx = $('#ctx');
      if (ctx) ctx.hidden = true;
    });
  });

  document.addEventListener('contextmenu', function (e) {
    if (e.target.closest('.win, #dock, .app-header')) return;
    if (!e.target.closest('#desktop')) return;
    e.preventDefault();
    var ctx = $('#ctx');
    if (!ctx) return;
    ctx.hidden = false;
    ctx.style.top = e.clientY + 'px';
    ctx.style.left = e.clientX + 'px';
  });
  document.addEventListener('click', function () {
    var ctx = $('#ctx');
    if (ctx) ctx.hidden = true;
  });

  function startDeck() {
    bindScrollEngagement();
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
