import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { HashRouter, Routes, Route, useLocation, useNavigate } from "react-router-dom";
import NavBar from "./components/NavBar";
import ChatPage from "./pages/ChatPage";
import MemoryPage from "./pages/MemoryPage";
import DashboardPage from "./pages/DashboardPage";
import OnboardingPage, { type HermesSetupStatus } from "./pages/OnboardingPage";
import SettingsPage from "./pages/SettingsPage";
import KeyboardShortcutsPanel from "./components/KeyboardShortcutsPanel";
import AppTitleBar from "./components/AppTitleBar";
import type { AppMenuAction } from "./appMenu";
import { useTheme } from "./hooks/useTheme";
import { useFontSize } from "./hooks/useFontSize";
import { detectPlatformKind } from "./utils/platform";

const isMac = navigator.platform.toLowerCase().includes("mac");

function setupErrorMessage(error: unknown) {
  const message = String(error);
  if (message.includes("invoke") || message.includes("__TAURI")) {
    return "未检测到 Hermes CLI，请完成安装后重新检测。";
  }
  return message;
}

// ChatPage holds long-lived per-session state (running chats, queues, the
// hermes:chunk listener). Unmounting it on route change would orphan running
// hermes processes — their output chunks would arrive but no one would
// consume them. Keep ChatPage permanently mounted; toggle visibility via CSS.
function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  useTheme();
  useFontSize();
  const isChat = location.pathname === "/";
  const platformKind = detectPlatformKind();
  const [checkingSetup, setCheckingSetup] = useState(true);
  const [setup, setSetup] = useState<HermesSetupStatus | null>(null);
  const [ready, setReady] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);

  const checkSetup = useCallback(async () => {
    setCheckingSetup(true);
    try {
      const nextSetup = await invoke<HermesSetupStatus>("check_hermes_setup");
      setSetup(nextSetup);
      if (nextSetup.installed) {
        window.localStorage.setItem("hermes.onboarding.complete", "true");
        setReady(true);
      } else {
        setReady(false);
      }
    } catch (e) {
      setSetup({
        installed: false,
        version: "",
        hermes_home: "",
        config_exists: false,
        api_key_configured: false,
        configured_providers: [],
        error: setupErrorMessage(e),
      });
      setReady(false);
    } finally {
      setCheckingSetup(false);
    }
  }, []);

  useEffect(() => {
    checkSetup();
  }, [checkSetup]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const modKey = isMac ? e.metaKey : e.ctrlKey;
      if (modKey && e.key === "/") {
        e.preventDefault();
        setShowShortcuts((v) => !v);
      }
      if (modKey && e.key === "n") {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("new-session-hotkey"));
      }
      if (modKey && e.key === "w") {
        e.preventDefault();
        setShowShortcuts(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const handleTitleBarAction = useCallback((action: AppMenuAction) => {
    switch (action) {
      case "new-session":
        navigate("/");
        window.dispatchEvent(new CustomEvent("new-session-hotkey"));
        break;
      case "open-chat":
        navigate("/");
        break;
      case "open-memory":
        navigate("/memory");
        break;
      case "open-files":
        navigate("/");
        window.dispatchEvent(new CustomEvent("toggle-file-tree"));
        break;
      case "open-dashboard":
        navigate("/dashboard");
        break;
      case "open-settings":
        navigate("/settings");
        break;
      case "toggle-terminal":
        window.dispatchEvent(new CustomEvent("toggle-terminal"));
        break;
      case "toggle-snapshot":
        window.dispatchEvent(new CustomEvent("toggle-snapshot"));
        break;
      case "show-shortcuts":
        setShowShortcuts((v) => !v);
        break;
      case "stop-agent":
        window.dispatchEvent(new CustomEvent("stop-active-session"));
        break;
      case "hide-window":
        import("@tauri-apps/api/window")
          .then(({ getCurrentWindow }) => getCurrentWindow().hide())
          .catch((error) => console.warn("Window control failed: hide", error));
        break;
      case "quit":
        invoke("quit_app").catch(() => {});
        break;
    }
  }, [navigate]);

  useEffect(() => {
    const unlisten = listen<AppMenuAction>("app-menu-action", (event) => {
      handleTitleBarAction(event.payload);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [handleTitleBarAction]);

  const shellContent = (() => {
    if (checkingSetup && !setup && !ready) {
      return (
        <div className="setup-loading">
          <span className="loading-dots" style={{ fontSize: 20 }} />
          <div className="dashboard-loading-text ui-font">正在检测 Hermes CLI…</div>
        </div>
      );
    }

    if (!ready) {
      return <OnboardingPage setup={setup} checking={checkingSetup} onRetry={checkSetup} />;
    }

    return (
      <>
        <NavBar />
        <div className="page-area">
          <div className="chat-page-host" style={{ display: isChat ? "block" : "none" }}>
            <ChatPage apiKeyConfigured={setup?.api_key_configured ?? true} />
          </div>
          {!isChat && (
            <Routes>
              <Route path="/memory" element={<MemoryPage />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route
                path="/onboarding"
                element={
                  <OnboardingPage
                    setup={setup}
                    checking={checkingSetup}
                    onRetry={checkSetup}
                    onContinue={() => navigate("/")}
                  />
                }
              />
            </Routes>
          )}
        </div>
      </>
    );
  })();

  return (
    <div className={`app-shell app-shell-${platformKind}`}>
      <AppTitleBar
        platform={platformKind}
        currentPath={location.pathname}
        onAction={handleTitleBarAction}
      />
      {showShortcuts && <KeyboardShortcutsPanel onClose={() => setShowShortcuts(false)} />}
      <div className="app-body">
        {shellContent}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <HashRouter>
      <AppShell />
    </HashRouter>
  );
}
