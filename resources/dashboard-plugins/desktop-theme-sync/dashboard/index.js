(function() {
  "use strict";

  var THEME_MAP = {
    claude: "claude",
    apple:  "apple",
    warp:   "warp",
  };

  /* ── helpers ─────────────────────────────────────────────── */

  function setThemeDirect(name) {
    var sdk = window.__HERMES_PLUGIN_SDK__;
    if (sdk && sdk.api && typeof sdk.api.setTheme === "function") {
      sdk.api.setTheme(name).catch(function() {});
      return;
    }

    var basePath = window.__HERMES_BASE_PATH__ || "";
    var token = window.__HERMES_SESSION_TOKEN__ || "";
    fetch(basePath + "/api/dashboard/theme", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Hermes-Session-Token": token,
      },
      body: JSON.stringify({ name: name }),
    }).catch(function() {});
  }

  /**
   * Wait until the target theme is available in the dashboard's theme list,
   * then apply it.  This avoids the race where setTheme() bails out because
   * userThemeDefs hasn't loaded yet.
   */
  function setThemeWhenReady(name, maxAttempts) {
    maxAttempts = maxAttempts || 20;
    var sdk = window.__HERMES_PLUGIN_SDK__;
    if (!sdk || !sdk.api || typeof sdk.api.getThemes !== "function") {
      // SDK not fully exposed yet — retry shortly.
      if (maxAttempts > 0) {
        setTimeout(function() { setThemeWhenReady(name, maxAttempts - 1); }, 250);
      } else {
        setThemeDirect(name);
      }
      return;
    }

    var attempts = 0;
    function tryApply() {
      sdk.api.getThemes().then(function(resp) {
        var hasTheme = resp.themes && resp.themes.some(function(t) { return t.name === name; });
        if (hasTheme) {
          setThemeDirect(name);
        } else if (++attempts < maxAttempts) {
          setTimeout(tryApply, 300);
        } else {
          // Fallback: force via localStorage + API so the next reload picks it up.
          localStorage.setItem("hermes-dashboard-theme", name);
          setThemeDirect(name);
        }
      }).catch(function() {
        if (++attempts < maxAttempts) {
          setTimeout(tryApply, 300);
        } else {
          setThemeDirect(name);
        }
      });
    }
    tryApply();
  }

  function requestCurrentTheme() {
    if (window.parent !== window) {
      window.parent.postMessage({ type: "hermes-theme-request" }, "*");
    }
  }

  /* ── message listener ────────────────────────────────────── */

  window.addEventListener("message", function(event) {
    if (!event.data || event.data.type !== "hermes-theme-sync") return;

    var themeName = event.data.dashboardTheme || THEME_MAP[event.data.desktopTheme];
    if (!themeName) return;

    setThemeWhenReady(themeName);
  });

  /* ── plugin registration ───────────────────────────────── */

  function register() {
    if (window.__HERMES_PLUGINS__ && typeof window.__HERMES_PLUGINS__.register === "function") {
      window.__HERMES_PLUGINS__.register("desktop-theme-sync", function() { return null; });
      // Ask Desktop for the current theme as soon as we are registered.
      requestCurrentTheme();
    } else {
      // SDK not ready yet — retry shortly.
      setTimeout(register, 50);
    }
  }

  // Start registration loop.
  register();
})();
