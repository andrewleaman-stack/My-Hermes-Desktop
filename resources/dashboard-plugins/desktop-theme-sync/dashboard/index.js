(function() {
  "use strict";

  var THEME_MAP = {
    claude: "claude",
    apple:  "apple",
    warp:   "warp",
  };

  /* ── helpers ─────────────────────────────────────────────── */

  function setTheme(name) {
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

    setTheme(themeName);
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
