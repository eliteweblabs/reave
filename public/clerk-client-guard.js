/**
 * Runs before clerk-js loads. Stale cached clerk-js (4.x/5.x) sends
 * __clerk_api_version=2024-05-12 → 400 on sign_ins and breaks hash sign-in.
 * Clear SW + caches once, then reload so the pinned clerk-js@6.x script loads.
 */
(function () {
  if (window.__reaveClerkFetchGuard) return;
  window.__reaveClerkFetchGuard = 1;

  var RESET_KEY = 'reave-clerk-js-reset';
  var VALID_API_VERSIONS = { '2025-04-10': 1, '2025-11-10': 1 };
  var EXPECTED_JS_MAJOR = 6;

  function resetting() {
    try {
      return Boolean(sessionStorage.getItem(RESET_KEY));
    } catch (e) {
      return false;
    }
  }

  function clearAndReload() {
    if (resetting()) return;
    try {
      sessionStorage.setItem(RESET_KEY, '1');
    } catch (e) {
      return;
    }

    var reloaded = false;
    function reload() {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    }

    var tasks = [];
    if ('caches' in window) {
      tasks.push(
        caches.keys().then(function (keys) {
          return Promise.all(
            keys.map(function (key) {
              return caches.delete(key);
            }),
          );
        }),
      );
    }
    if ('serviceWorker' in navigator) {
      tasks.push(
        navigator.serviceWorker.getRegistrations().then(function (regs) {
          return Promise.all(
            regs.map(function (reg) {
              return reg.unregister();
            }),
          );
        }),
      );
    }
    Promise.all(tasks).finally(reload);
    setTimeout(reload, 3000);
  }

  function staleClerkRequestUrl(url) {
    if (!url || url.indexOf('/v1/client/sign_ins') === -1) return false;
    var apiMatch = url.match(/__clerk_api_version=([^&]+)/);
    if (apiMatch && !VALID_API_VERSIONS[apiMatch[1]]) return true;
    var jsMatch = url.match(/_clerk_js_version=([^&]+)/);
    if (jsMatch) {
      var major = parseInt(jsMatch[1].split('.')[0], 10);
      if (major > 0 && major < EXPECTED_JS_MAJOR) return true;
    }
    return false;
  }

  var nativeFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    if (staleClerkRequestUrl(url)) clearAndReload();
    return nativeFetch(input, init);
  };

  function checkClerkScriptTag() {
    var script = document.querySelector('script[data-clerk-js-script]');
    if (!script) return;
    var src = script.getAttribute('src') || '';
    var match = src.match(/@clerk\/clerk-js@([\d.]+)/);
    if (!match) return;
    var major = parseInt(match[1].split('.')[0], 10);
    if (major > 0 && major < EXPECTED_JS_MAJOR) clearAndReload();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', checkClerkScriptTag);
  } else {
    checkClerkScriptTag();
  }
})();
