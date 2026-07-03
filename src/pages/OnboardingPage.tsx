import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import Icon from "../components/Icon";

export interface HermesSetupStatus {
  installed: boolean;
  version: string;
  hermes_home: string;
  config_exists: boolean;
  api_key_configured: boolean;
  configured_providers: string[];
  error: string;
}

const INSTALL_CMD = "curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash";
const SETUP_CMD = "hermes setup";

async function writeClipboardText(text: string) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall back below for WebViews or browser contexts without clipboard grants.
  }

  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.setAttribute("readonly", "true");
  textArea.style.position = "fixed";
  textArea.style.left = "-9999px";
  document.body.appendChild(textArea);
  textArea.select();

  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    document.body.removeChild(textArea);
  }
}

interface Props {
  setup: HermesSetupStatus | null;
  checking: boolean;
  onRetry: () => void;
  onContinue?: () => void;
}

export default function OnboardingPage({ setup, checking, onRetry, onContinue }: Props) {
  const [copiedCommand, setCopiedCommand] = useState<"install" | "setup" | null>(null);
  const [terminalError, setTerminalError] = useState("");
  const [showPathInput, setShowPathInput] = useState(false);
  const [customPath, setCustomPath] = useState("");
  const [pathSaving, setPathSaving] = useState(false);
  const [pathResult, setPathResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const saveCustomPath = async () => {
    if (!customPath.trim()) return;
    setPathSaving(true);
    setPathResult(null);
    try {
      const version = await invoke<string>("set_hermes_path", { path: customPath.trim() });
      setPathResult({ ok: true, msg: `Saved; detected ${version}` });
      window.setTimeout(() => onRetry(), 800);
    } catch (e) {
      setPathResult({ ok: false, msg: String(e) });
    } finally {
      setPathSaving(false);
    }
  };

  const copyCommand = async (kind: "install" | "setup", command: string) => {
    setTerminalError("");
    const ok = await writeClipboardText(command);
    if (ok) {
      setCopiedCommand(kind);
      window.setTimeout(() => setCopiedCommand(null), 1800);
    } else {
      setTerminalError("Copy failed. Select and copy the install command manually.");
    }
  };

  const openTerminal = async (command: "open_install_terminal" | "open_setup_terminal") => {
    setTerminalError("");
    try {
      await invoke(command);
    } catch (e) {
      setTerminalError(String(e));
    }
  };

  const providerText = setup?.configured_providers.length
    ? setup.configured_providers.join(" / ")
    : "Not detected yet";

  return (
    <div className="onboarding-page">
      <section className="onboarding-hero">
        <div className="onboarding-mark">
          <Icon name="spark" size={30} />
        </div>
        <div className="onboarding-copy">
          <p className="onboarding-kicker ui-font">My Hermes Desktop</p>
          <h1 className="onboarding-title">Get Started with Hermes</h1>
          <p className="onboarding-subtitle">
            The desktop app first checks that the Hermes CLI is available. Complete the official install and configuration steps, then you can start chatting.
          </p>
        </div>
      </section>

      <section className="onboarding-steps" aria-label="First-run guide">
        <article className="onboarding-step active">
          <div className="onboarding-step-index">1</div>
          <div className="onboarding-step-body">
            <h2>Install Hermes CLI</h2>
            <p>Run the install command. When it finishes, come back here and check again.</p>
            <div className="onboarding-command">
              <code>{INSTALL_CMD}</code>
              <button className="guide-copy-btn ui-font" onClick={() => copyCommand("install", INSTALL_CMD)}>
                {copiedCommand === "install" && <Icon name="check" size={12} />}
                {copiedCommand === "install" ? "Copied" : "Copy"}
              </button>
            </div>
            <button className="onboarding-secondary-btn ui-font" onClick={() => openTerminal("open_install_terminal")}>
              <Icon name="terminal" size={14} />
              Open in Terminal
            </button>
            {terminalError && <p className="onboarding-error">{terminalError}</p>}
          </div>
        </article>

        <article className="onboarding-step">
          <div className="onboarding-step-index">2</div>
          <div className="onboarding-step-body">
            <h2>Configure Hermes</h2>
            <p>
              After installation, run the official configuration wizard and choose a provider, model, and API key.
            </p>
            <div className="onboarding-command">
              <code>{SETUP_CMD}</code>
              <button className="guide-copy-btn ui-font" onClick={() => copyCommand("setup", SETUP_CMD)}>
                {copiedCommand === "setup" && <Icon name="check" size={12} />}
                {copiedCommand === "setup" ? "Copied" : "Copy"}
              </button>
            </div>
            <button className="onboarding-secondary-btn ui-font" onClick={() => openTerminal("open_setup_terminal")}>
              <Icon name="terminal" size={14} />
              Open Configuration Wizard
            </button>
            <div className="onboarding-status-row">
              <span>Current Check</span>
              <strong>{providerText}</strong>
            </div>
          </div>
        </article>

        <article className="onboarding-step">
          <div className="onboarding-step-index">3</div>
          <div className="onboarding-step-body">
            <h2>Enter Chat</h2>
            <p>After Hermes is detected, the app enters the main interface automatically. Future launches open Chat directly.</p>
            <div className={`onboarding-check ${setup?.installed ? "ok" : ""}`}>
              {setup?.installed ? <Icon name="check" size={14} /> : <Icon name="alert" size={14} />}
              <span>{setup?.installed ? `Installed ${setup.version}` : setup?.error || "Waiting for check"}</span>
            </div>

            {/* Manual path entry; shown only when detection fails */}
            {setup && !setup.installed && (
              <div className="onboarding-custom-path">
                <button
                  className="onboarding-link-btn ui-font"
                  onClick={() => setShowPathInput((v) => !v)}
                >
                  {showPathInput ? "Collapse" : "Specify Hermes path manually"}
                </button>
                {showPathInput && (
                  <div className="onboarding-path-row">
                    <input
                      className="onboarding-path-input ui-font"
                      type="text"
                      placeholder="Example: /usr/local/bin/hermes or ~/.hermes/bin/hermes"
                      value={customPath}
                      onChange={(e) => setCustomPath(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && saveCustomPath()}
                      autoFocus
                    />
                    <button
                      className="guide-retry-btn ui-font"
                      onClick={saveCustomPath}
                      disabled={pathSaving || !customPath.trim()}
                    >
                      {pathSaving ? "Verifying..." : "Verify and Save"}
                    </button>
                  </div>
                )}
                {pathResult && (
                  <p className={`onboarding-path-result ${pathResult.ok ? "ok" : "error"}`}>
                    {pathResult.msg}
                  </p>
                )}
              </div>
            )}
          </div>
        </article>
      </section>

      <div className="onboarding-actions">
        <button
          className="guide-retry-btn ui-font"
          onClick={setup?.installed && onContinue ? onContinue : onRetry}
          disabled={checking}
        >
          {checking ? "Checking..." : setup?.installed && onContinue ? "Enter Chat" : "I finished; check again"}
        </button>
        {!setup?.installed && onContinue && (
          <button className="onboarding-skip-btn ui-font" onClick={onContinue}>
            Skip check and enter directly
          </button>
        )}
      </div>
    </div>
  );
}
