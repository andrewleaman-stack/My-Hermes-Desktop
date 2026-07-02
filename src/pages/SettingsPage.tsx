import { useNavigate } from "react-router-dom";
import { useCallback, useEffect, useState } from "react";
import Icon from "../components/Icon";
import {
  GUIDE_BOT_APPEARANCES,
  GUIDE_BOT_DISPLAYS,
  GUIDE_BOT_SIZES,
  GuideBotAvatar,
  type GuideBotAppearance,
  type GuideBotDisplay,
  type GuideBotSize,
  useGuideBotAppearance,
  useGuideBotDisplay,
  useGuideBotSize,
} from "../components/chat/GuideBot";
import { MODES, THEMES, useTheme, type Mode, type Theme } from "../hooks/useTheme";
import { TERMINAL_BGS, useTerminalBg, type TerminalBg } from "../hooks/useTerminalBg";
import { FONT_SIZES, FONT_SIZE_LABELS, useFontSize, type FontSize } from "../hooks/useFontSize";

const THEME_LABELS: Record<Theme, { name: string; description: string }> = {
  claude: { name: "Claude Noir", description: "Warm paper surface with soft edges" },
  apple: { name: "Apple", description: "System-native feel, light background, blue accents" },
  warp: { name: "Warp", description: "Warm dark mode with a terminal feel" },
};

const MODE_LABELS: Record<Mode, string> = {
  auto: "Auto",
  light: "Light",
  dark: "Dark",
};

const TERMINAL_BG_LABELS: Record<TerminalBg, { name: string; description: string }> = {
  dark:    { name: "Dark",    description: "Classic dark mode with the best contrast" },
  glass:   { name: "Glass",   description: "Translucent frosted-glass effect" },
  ocean:   { name: "Ocean",   description: "Blue-purple nebula gradient" },
  sunset:  { name: "Sunset",  description: "Deep red-purple dusk gradient" },
  forest:  { name: "Forest",  description: "Deep emerald forest gradient" },
};

const FONT_SIZE_ROW_LABELS: Record<string, string> = {
  ui: "Interface",
  terminal: "Terminal",
  fileTree: "File manager",
};

const APPEARANCE_MOOD: Record<GuideBotAppearance, Parameters<typeof GuideBotAvatar>[0]["mood"]> = {
  classic: "blink",
  voxel: "ok",
  anime: "typing",
  cyber: "alert",
  pod: "heartbeat",
  "april-v4": "smug",
};

// ─── Dashboard Theme Installer sub-component ─────────────────────────────────

interface InstallResult {
  themes_installed: string[];
  plugin_files_installed: string[];
  themes_dir: string;
  plugin_dir: string;
  skipped: string[];
}

interface InstallStatus {
  themes: string[];
  plugin_files: string[];
  themes_dir: string;
  plugin_dir: string;
  installed: boolean;
}

function DashboardThemeInstaller() {
  const [isInstalling, setIsInstalling] = useState(false);
  const [installResult, setInstallResult] = useState<InstallResult | null>(null);
  const [installError, setInstallError] = useState<string | null>(null);
  const [status, setStatus] = useState<InstallStatus | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const result = await invoke<InstallStatus>("get_dashboard_theme_install_status");
      setStatus(result);
    } catch {
      // silently ignore — the user can still install
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const handleInstall = async () => {
    setIsInstalling(true);
    setInstallResult(null);
    setInstallError(null);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const result = await invoke<InstallResult>("install_dashboard_themes");
      setInstallResult(result);
      await loadStatus();
    } catch (e) {
      setInstallError(String(e));
    } finally {
      setIsInstalling(false);
    }
  };

  return (
    <div className="dashboard-theme-installer">
      <div className="settings-row">
        <div className="settings-row-label">
          <span className="ui-font">Install Dashboard theme pack</span>
          <span className="settings-row-desc">
            Install the Claude, Apple, and Warp themes plus the sync plugin into ~/.hermes/
          </span>
        </div>
        <button
          type="button"
          className="settings-primary-btn ui-font"
          disabled={isInstalling}
          onClick={handleInstall}
        >
          {isInstalling ? (
            <>
              <span className="btn-spinner" />
              Installing…
            </>
          ) : status?.installed ? (
            <>
              Reinstall
              <Icon name="refresh" size={15} />
            </>
          ) : (
            <>
              Install
              <Icon name="package" size={15} />
            </>
          )}
        </button>
      </div>

      {/* Install result banner */}
      {installError && (
        <div className="install-result-card install-error">
          <Icon name="alert" size={16} />
          <span>Install failed: {installError}</span>
        </div>
      )}
      {installResult && (
        <div className="install-result-card install-success">
          <div className="install-result-header">
            <Icon name="check" size={16} />
            <span>Installed successfully</span>
          </div>
          <div className="install-result-body">
            {installResult.themes_installed.length > 0 && (
              <div className="install-result-group">
                <span className="install-result-label">Theme files</span>
                <ul className="install-result-list">
                  {installResult.themes_installed.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
                <span className="install-result-path">{installResult.themes_dir}</span>
              </div>
            )}
            {installResult.plugin_files_installed.length > 0 && (
              <div className="install-result-group">
                <span className="install-result-label">Plugin files</span>
                <ul className="install-result-list">
                  {installResult.plugin_files_installed.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
                <span className="install-result-path">{installResult.plugin_dir}</span>
              </div>
            )}
            {installResult.skipped.length > 0 && (
              <div className="install-result-group">
                <span className="install-result-label">Skipped (source files missing)</span>
                <ul className="install-result-list">
                  {installResult.skipped.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Current installed status */}
      {status && (
        <div className="install-status-block">
          <div className="install-status-header">
            <Icon name="package" size={14} />
            <span className="ui-font">
              {status.installed ? "Installed content" : "Not installed yet"}
            </span>
          </div>
          {status.installed && (
            <div className="install-status-body">
              {status.themes.length > 0 && (
                <div className="install-status-group">
                  <span className="install-status-label">Themes</span>
                  <div className="install-status-tags">
                    {status.themes.map((t) => (
                      <span key={t} className="install-status-tag">{t}</span>
                    ))}
                  </div>
                </div>
              )}
              {status.plugin_files.length > 0 && (
                <div className="install-status-group">
                  <span className="install-status-label">Plugins</span>
                  <div className="install-status-tags">
                    {status.plugin_files.map((f) => (
                      <span key={f} className="install-status-tag">{f}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function SettingsPage() {
  const navigate = useNavigate();
  const { theme, setTheme, mode, setMode } = useTheme();
  const { appearance, setAppearance } = useGuideBotAppearance();
  const { size: guideBotSize, setSize: setGuideBotSize } = useGuideBotSize();
  const { display: guideBotDisplay, setDisplay: setGuideBotDisplay } = useGuideBotDisplay();
  const { terminalBg, setTerminalBg } = useTerminalBg();
  const {
    uiFontSize, setUiFontSize,
    terminalFontSize, setTerminalFontSize,
    fileTreeFontSize, setFileTreeFontSize,
  } = useFontSize();

  return (
    <div className="settings-page">
      <div className="settings-page-header">
        <span className="settings-page-icon">
          <Icon name="settings" size={21} />
        </span>
        <div>
          <div className="settings-page-title ui-font">Settings</div>
          <div className="settings-page-subtitle">Appearance, onboarding, and Composer Guide</div>
        </div>
      </div>

      <div className="settings-content">
        <section className="settings-section">
          <div className="settings-section-header">
            <div>
              <h2 className="settings-section-title ui-font">Appearance style</h2>
              <p className="settings-section-desc">Choose the overall visual language for My Hermes Desktop.</p>
            </div>
          </div>

          <div className="theme-card-grid">
            {THEMES.map((item) => (
              <button
                key={item}
                type="button"
                className={`theme-card theme-card-${item}${theme === item ? " selected" : ""}`}
                onClick={() => setTheme(item)}
              >
                <span className="theme-card-preview">
                  <span />
                  <span />
                  <span />
                </span>
                <span className="theme-card-body">
                  <span className="theme-card-name ui-font">{THEME_LABELS[item].name}</span>
                  <span className="theme-card-desc">{THEME_LABELS[item].description}</span>
                </span>
                {theme === item && <Icon name="check" size={15} />}
              </button>
            ))}
          </div>
        </section>

        <section className="settings-section">
          <div className="settings-section-header">
            <div>
              <h2 className="settings-section-title ui-font">Color mode</h2>
              <p className="settings-section-desc">
                Light, dark, or follow the system. Warp is always dark.
              </p>
            </div>
          </div>

          <div className="font-size-rows">
            <div className="font-size-row">
              <span className="font-size-row-label ui-font">Mode</span>
              <div className="font-size-chips">
                {MODES.map((item) => (
                  <button
                    key={item}
                    type="button"
                    className={`font-size-chip ui-font${mode === item ? " selected" : ""}`}
                    onClick={() => setMode(item as Mode)}
                  >
                    {MODE_LABELS[item]}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="settings-section">
          <div className="settings-section-header">
            <div>
              <h2 className="settings-section-title ui-font">Dashboard Themes</h2>
              <p className="settings-section-desc">Keep Dashboard admin themes synchronized with Desktop.</p>
            </div>
          </div>

          <DashboardThemeInstaller />
        </section>

        <section className="settings-section">
          <div className="settings-section-header">
            <div>
              <h2 className="settings-section-title ui-font">Bot appearance</h2>
              <p className="settings-section-desc">Choose the guide bot appearance in the composer.</p>
            </div>
          </div>

          <div className="bot-appearance-grid">
            {GUIDE_BOT_APPEARANCES.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`bot-appearance-card${appearance === item.id ? " selected" : ""}`}
                onClick={() => setAppearance(item.id)}
              >
                <span className="bot-appearance-preview">
                  <GuideBotAvatar mood={APPEARANCE_MOOD[item.id]} appearance={item.id} />
                </span>
                <span className="bot-appearance-copy">
                  <span className="bot-appearance-name ui-font">{item.name}</span>
                  <span className="bot-appearance-desc">{item.description}</span>
                </span>
                {appearance === item.id && <Icon name="check" size={15} />}
              </button>
            ))}
          </div>
        </section>

        <section className="settings-section">
          <div className="settings-section-header">
            <div>
              <h2 className="settings-section-title ui-font">April size</h2>
              <p className="settings-section-desc">Scale April in the composer. Medium is the current default.</p>
            </div>
          </div>

          <div className="font-size-rows guide-bot-size-rows">
            <div className="font-size-row">
              <span className="font-size-row-label ui-font">Avatar</span>
              <div className="font-size-chips guide-bot-size-chips">
                {GUIDE_BOT_SIZES.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`font-size-chip ui-font${guideBotSize === item.id ? " selected" : ""}`}
                    onClick={() => setGuideBotSize(item.id as GuideBotSize)}
                    title={item.description}
                  >
                    {item.name}
                  </button>
                ))}
              </div>
              <span className="guide-bot-size-preview">
                <GuideBotAvatar mood="smug" appearance="april-v4" size={guideBotSize} />
              </span>
            </div>
            <div className="font-size-row">
              <span className="font-size-row-label ui-font">Display</span>
              <div className="font-size-chips guide-bot-size-chips">
                {GUIDE_BOT_DISPLAYS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`font-size-chip ui-font${guideBotDisplay === item.id ? " selected" : ""}`}
                    onClick={() => setGuideBotDisplay(item.id as GuideBotDisplay)}
                    title={item.description}
                  >
                    {item.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="settings-section">
          <div className="settings-section-header">
            <div>
              <h2 className="settings-section-title ui-font">Terminal background</h2>
              <p className="settings-section-desc">Customize the TUI terminal panel background.</p>
            </div>
          </div>

          <div className="terminal-bg-grid">
            {TERMINAL_BGS.map((bg) => (
              <button
                key={bg}
                type="button"
                className={`terminal-bg-card terminal-bg-card-${bg}${terminalBg === bg ? " selected" : ""}`}
                onClick={() => setTerminalBg(bg)}
              >
                <span className="terminal-bg-swatch" />
                <span className="terminal-bg-body">
                  <span className="terminal-bg-name ui-font">{TERMINAL_BG_LABELS[bg].name}</span>
                  <span className="terminal-bg-desc">{TERMINAL_BG_LABELS[bg].description}</span>
                </span>
                {terminalBg === bg && <Icon name="check" size={15} />}
              </button>
            ))}
          </div>
        </section>

        <section className="settings-section">
          <div className="settings-section-header">
            <div>
              <h2 className="settings-section-title ui-font">Font size</h2>
              <p className="settings-section-desc">Adjust text size for the interface, terminal, and file manager.</p>
            </div>
          </div>

          <div className="font-size-rows">
            {(
              [
                { key: "ui",       label: FONT_SIZE_ROW_LABELS.ui,       value: uiFontSize,       set: setUiFontSize },
                { key: "terminal", label: FONT_SIZE_ROW_LABELS.terminal, value: terminalFontSize, set: setTerminalFontSize },
                { key: "fileTree", label: FONT_SIZE_ROW_LABELS.fileTree, value: fileTreeFontSize, set: setFileTreeFontSize },
              ] as { key: string; label: string; value: FontSize; set: (v: FontSize) => void }[]
            ).map(({ key, label, value, set }) => (
              <div key={key} className="font-size-row">
                <span className="font-size-row-label ui-font">{label}</span>
                <div className="font-size-chips">
                  {FONT_SIZES.map((s) => (
                    <button
                      key={s}
                      type="button"
                      className={`font-size-chip ui-font${value === s ? " selected" : ""}`}
                      onClick={() => set(s)}
                    >
                      {FONT_SIZE_LABELS[s]}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="settings-section settings-guide-section">
          <div>
            <h2 className="settings-section-title ui-font">Onboarding</h2>
            <p className="settings-section-desc">Review installation, configuration, and getting into chat.</p>
          </div>
          <button
            type="button"
            className="settings-primary-btn ui-font"
            onClick={() => navigate("/onboarding")}
          >
            View onboarding
            <Icon name="chevronRight" size={15} />
          </button>
        </section>
      </div>

      <footer className="settings-copyright ui-font">
        © {new Date().getFullYear()} Beacon AI
      </footer>
    </div>
  );
}
