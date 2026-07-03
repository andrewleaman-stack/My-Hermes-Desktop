import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import Icon from "../components/Icon";
import { useTheme, type Theme } from "../hooks/useTheme";

const DASHBOARD_URL = "http://127.0.0.1:9119";
const INSTALL_CMD = "curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash";
const DASHBOARD_BUILD_CMD = "cd ~/.hermes/hermes-agent/web && npm install && npm run build";

type Status = "idle" | "starting" | "ready" | "error" | "missing";

export default function DashboardPage() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const { theme, mode } = useTheme();
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [copied, setCopied] = useState(false);
  const lastSentRef = useRef<string | null>(null);
  const pendingThemeRef = useRef<Theme | null>(null);

  const [iframeGen, setIframeGen] = useState(0);

  /** Sync the dashboard theme via its own HTTP API (PUT persists to
   *  config.yaml server-side), then reload the iframe to apply it. Our
   *  dark theme YAMLs (claude-dark / apple-dark / warp) are installed by
   *  the "Dashboard Themes" installer below; light modes map to the
   *  dashboard's built-in default until light variants exist. */
  const syncTheme = useCallback((target: HTMLIFrameElement | null, t: Theme) => {
    const resolvedMode =
      document.documentElement.getAttribute("data-mode") === "dark" ? "dark" : "light";
    const name =
      t === "warp" ? "warp" : resolvedMode === "dark" ? `${t}-dark` : "default";
    if (lastSentRef.current === name) return; // avoid duplicates
    void (async () => {
      try {
        const res = await fetch(`${DASHBOARD_URL}/api/dashboard/theme`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        });
        if (res.ok) {
          lastSentRef.current = name;
          pendingThemeRef.current = null;
          if (target) setIframeGen((g) => g + 1); // reload to apply
        }
      } catch {
        // dashboard not running yet — retried on next status/theme change
      }
    })();
  }, []);

  // Sync theme whenever theme/mode changes or the dashboard comes up
  useEffect(() => {
    if (status !== "ready") return;
    syncTheme(iframeRef.current, theme);
  }, [theme, mode, status, syncTheme]);

  const start = useCallback(async () => {
    setStatus("starting");
    setErrorMsg("");
    try {
      const result = await invoke<string>("dashboard_start");
      if (result === "ready") {
        setStatus("ready");
      } else {
        setStatus("error");
        setErrorMsg(result);
      }
    } catch (e: unknown) {
      const msg = String(e);
      if (msg.includes("dashboard_dependency_missing")) {
        setStatus("missing");
        setErrorMsg(msg.replace(/^.*dashboard_dependency_missing:/, ""));
      } else if (msg.includes("start_failed") || msg.includes("No such file")) {
        setStatus("missing");
        setErrorMsg("");
      } else if (msg.includes("timeout")) {
        setStatus("error");
        setErrorMsg("Dashboard startup timed out. Check that hermes-agent is installed correctly.");
      } else {
        setStatus("error");
        setErrorMsg(msg);
      }
    }
  }, []);

  // Auto-start when page mounts
  useEffect(() => { start(); }, [start]);

  const copyCmd = () => {
    const command = errorMsg ? DASHBOARD_BUILD_CMD : INSTALL_CMD;
    navigator.clipboard?.writeText(command).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  };

  // ── Loading ──
  if (status === "idle" || status === "starting") {
    return (
      <div className="dashboard-loading">
        <span className="loading-dots" style={{ fontSize: 20 }} />
        <div className="dashboard-loading-text ui-font">Starting Dashboard...</div>
      </div>
    );
  }

  // ── Missing dependency ──
  if (status === "missing") {
    const command = errorMsg ? DASHBOARD_BUILD_CMD : INSTALL_CMD;
    return (
      <div className="dashboard-guide">
        <div className="dashboard-guide-icon">
          <Icon name="package" size={34} />
        </div>
        <div className="dashboard-guide-title ui-font">Dashboard dependencies required</div>
        <div className="dashboard-guide-desc">
          {errorMsg || "Run the command below to install, then click \"Retry\"."}
        </div>
        <div className="dashboard-guide-cmd">
          <code>{command}</code>
          <button className="guide-copy-btn ui-font" onClick={copyCmd}>
            {copied && <Icon name="check" size={12} />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <button className="guide-retry-btn ui-font" onClick={start}>Retry</button>
      </div>
    );
  }

  // ── Error ──
  if (status === "error") {
    return (
      <div className="dashboard-guide">
        <div className="dashboard-guide-icon error">
          <Icon name="alert" size={34} />
        </div>
        <div className="dashboard-guide-title ui-font">Dashboard failed to start</div>
        <div className="dashboard-guide-desc" style={{ color: "var(--error)" }}>
          {errorMsg}
        </div>
        <button className="guide-retry-btn ui-font" onClick={start}>Retry</button>
      </div>
    );
  }

  // ── Ready: show iframe (key bumps to reload after a theme change) ──
  return (
    <iframe
      key={iframeGen}
      ref={iframeRef}
      className="dashboard-iframe"
      src={DASHBOARD_URL}
      title="Hermes Dashboard"
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
    />
  );
}
