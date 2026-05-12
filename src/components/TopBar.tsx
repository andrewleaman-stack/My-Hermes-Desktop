import { HermesStatus } from "../types";

interface Props {
  streaming: boolean;
  status: HermesStatus | null;
  hermesVersion: string;
  onOpenTerminal: () => void;
}

export default function TopBar({ streaming, status, hermesVersion, onOpenTerminal }: Props) {
  return (
    <div className="topbar">
      {/* Logo */}
      <div className="topbar-logo">
        ⚡ <span className="topbar-logo-name">Hermes</span>
        <span className="topbar-logo-sub">Desktop</span>
      </div>

      <div className="topbar-divider" />

      {/* Agent state */}
      <div className="status-pill">
        <div
          className={`hermes-indicator ${streaming ? "streaming" : "idle"}`}
          title={streaming ? "Agent is running..." : "Ready"}
        />
        <span className="label">{streaming ? "Running" : "Ready"}</span>
      </div>

      {/* ── Live hermes status ── */}
      <div className="topbar-divider" />

      {/* Model */}
      <div className="status-pill">
        <span className="label">Model</span>
        <span className="value topbar-model">
          {status?.model || "—"}
        </span>
      </div>

      <div className="topbar-divider" />

      {/* Message count */}
      <div className="status-pill">
        <span className="label">Msgs</span>
        <span className="value">
          {status?.msgCount || "—"}
        </span>
      </div>

      {/* Cost */}
      {status?.cost && (
        <>
          <div className="topbar-divider" />
          <div className="status-pill">
            <span className="label">Cost</span>
            <span className="amber">{status.cost}</span>
          </div>
        </>
      )}

      {/* Duration */}
      {status?.duration && (
        <>
          <div className="topbar-divider" />
          <div className="status-pill">
            <span className="label">⏱</span>
            <span className="value">{status.duration}</span>
          </div>
        </>
      )}

      <div className="topbar-spacer" />

      {/* Terminal button */}
      <button
        className="topbar-terminal-btn"
        onClick={onOpenTerminal}
        title="打开 Hermes 交互终端（支持 slash 命令）"
      >
        ⌨ Terminal
      </button>

      {/* Hermes version */}
      {hermesVersion && (
        <div className="status-pill">
          <span className="label" style={{ fontSize: 10 }}>
            {hermesVersion.split("\n")[0].slice(0, 28)}
          </span>
        </div>
      )}
    </div>
  );
}
