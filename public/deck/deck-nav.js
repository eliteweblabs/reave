/**
 * /deck scroll + right-nav controller (no fake OS windows).
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
  var activeSceneId = null;
  var scrollingTo = null;

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

  $$('.d-item[data-app]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      scrollToScene(btn.getAttribute('data-app'));
    });
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
