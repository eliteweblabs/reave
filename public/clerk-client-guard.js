/**
 * Runs before clerk-js loads. Stale cached clerk-js (4.x/5.x) sends
 * __clerk_api_version=2024-05-12 → 400 on sign_ins and breaks hash sign-in.
 * Clear SW + caches, cache-bust the clerk-js script URL, then reload.
 */
(function () {
  if (window.__reaveClerkFetchGuard) return;
  window.__reaveClerkFetchGuard = 1;

  var RESET_KEY = 'reave-clerk-js-reset';
  var RESET_MAX = 3;
  var VALID_API_VERSIONS = { '2025-04-10': 1, '2025-11-10': 1 };
  var EXPECTED_JS_MAJOR = 6;

  function resetAttempts() {
    try {
      return Number(sessionStorage.getItem(RESET_KEY) || '0');
    } catch (e) {
      return 0;
    }
  }

  function bumpResetAttempts() {
    var next = resetAttempts() + 1;
    try {
      sessionStorage.setItem(RESET_KEY, String(next));
    } catch (e) {
      /* ignore */
    }
    return next;
  }

  function clearAndReload(reason) {
    if (resetAttempts() >= RESET_MAX) return;
    bumpResetAttempts();

    var reloaded = false;
    function reload() {
      if (reloaded) return;
      reloaded = true;
      try {
        var url = new URL(window.location.href);
        url.searchParams.set('_cr', String(Date.now()));
        window.location.replace(url.toString());
      } catch (e) {
        window.location.reload();
      }
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
    setTimeout(reload, 1500);
  }

  function staleClerkRequestUrl(url) {
    if (!url || url.indexOf('/v1/client/sign_ins') === -1) return false;
    var apiMatch = url.match(/__clerk_api_version=([^&]+)/);
    if (apiMatch && !VALID_API_VERSIONS[apiMatch[1]]) return true;
    var jsMatch = url.match(/__clerk_js_version=([^&]+)/);
    if (jsMatch) {
      var major = parseInt(jsMatch[1].split('.')[0], 10);
      if (major > 0 && major < EXPECTED_JS_MAJOR) return true;
    }
    return false;
  }

  function runningClerkMajor() {
    var ver = window.Clerk && window.Clerk.version != null ? String(window.Clerk.version) : '';
    if (!ver) return 0;
    return parseInt(ver.split('.')[0], 10) || 0;
  }

  function staleRunningClerk() {
    var major = runningClerkMajor();
    return major > 0 && major < EXPECTED_JS_MAJOR;
  }

  function cacheBustClerkScript(script) {
    if (!script) return;
    var src = script.getAttribute('src') || '';
    if (!src || src.indexOf('__cb=') !== -1) return;
    var sep = src.indexOf('?') === -1 ? '?' : '&';
    script.setAttribute('src', src + sep + '__cb=' + Date.now());
  }

  function inspectClerkScript(script) {
    if (!script) return;
    var src = script.getAttribute('src') || '';
    var match = src.match(/@clerk\/clerk-js@([\d.]+)/);
    if (match) {
      var major = parseInt(match[1].split('.')[0], 10);
      if (major > 0 && major < EXPECTED_JS_MAJOR) {
        clearAndReload('script-tag');
        return;
      }
    }
    if (resetAttempts() > 0) cacheBustClerkScript(script);
  }

  function watchClerkScript() {
    inspectClerkScript(document.querySelector('script[data-clerk-js-script]'));
    if (!window.MutationObserver) return;
    var observer = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var nodes = mutations[i].addedNodes;
        for (var j = 0; j < nodes.length; j++) {
          var node = nodes[j];
          if (node.nodeType !== 1) continue;
          if (node.matches && node.matches('script[data-clerk-js-script]')) {
            inspectClerkScript(node);
          } else if (node.querySelector) {
            inspectClerkScript(node.querySelector('script[data-clerk-js-script]'));
          }
        }
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  var nativeFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    if (staleClerkRequestUrl(url)) {
      clearAndReload('fetch-url');
      return nativeFetch(input, init);
    }
    return nativeFetch(input, init).then(function (res) {
      if (url.indexOf('/v1/client/sign_ins') !== -1 && res.status === 400) {
        clearAndReload('sign-ins-400');
      }
      return res;
    });
  };

  if (window.XMLHttpRequest) {
    var NativeXHR = window.XMLHttpRequest;
    window.XMLHttpRequest = function () {
      var xhr = new NativeXHR();
      var open = xhr.open;
      xhr.open = function (method, url) {
        xhr.__reaveUrl = url;
        return open.apply(xhr, arguments);
      };
      xhr.addEventListener('load', function () {
        var url = xhr.__reaveUrl || '';
        if (staleClerkRequestUrl(url) || (url.indexOf('/v1/client/sign_ins') !== -1 && xhr.status === 400)) {
          clearAndReload('xhr');
        }
      });
      return xhr;
    };
  }

  document.addEventListener(
    'clerk-loaded',
    function () {
      if (staleRunningClerk()) clearAndReload('clerk-loaded');
    },
    true,
  );

  if (staleRunningClerk()) clearAndReload('preloaded-clerk');

  watchClerkScript();
})();
