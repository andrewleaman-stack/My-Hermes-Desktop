import { useState } from "react";
import { HermesStatus } from "../../types";
import Icon from "../Icon";

// Parse "12.4K", "200K", "1.5M" → number
function parseTokenCount(s: string): number {
  if (!s) return 0;
  const m = s.match(/^([\d.]+)([KMB]?)$/i);
  if (!m) return 0;
  const n = parseFloat(m[1]);
  switch (m[2].toUpperCase()) {
    case "K": return n * 1_000;
    case "M": return n * 1_000_000;
    case "B": return n * 1_000_000_000;
    default:  return n;
  }
}

function contextColor(pct: number): string {
  if (pct >= 95) return "var(--error)";
  if (pct >= 85) return "#e07020";   // orange
  if (pct >= 70) return "var(--warning)";
  return "var(--success)";
}

interface Props {
  status: HermesStatus | null;
  onCompress: (focus: string) => void;
}

export default function ContextBar({ status, onCompress }: Props) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [focusText, setFocusText] = useState("");

  const used = parseTokenCount(status?.tokensUsed ?? "");
  const max  = parseTokenCount(status?.tokensMax ?? "");
  const pct  = max > 0 ? Math.min(100, Math.round((used / max) * 100)) : 0;
  const color = contextColor(pct);
  const highlight = pct >= 70;

  if (!status?.tokensUsed || !status?.tokensMax) return null;

  const handleCompress = () => {
    onCompress(focusText.trim());
    setFocusText("");
    setPopoverOpen(false);
  };

  return (
    <div className="context-bar-wrapper">
      {/* Progress bar */}
      <div className="context-bar" title={`Context: ${status.tokensUsed} / ${status.tokensMax} (${pct}%)`}>
        <span className="label">Ctx</span>
        <div className="context-track">
          <div
            className={`context-fill${pct >= 95 ? " blink" : ""}`}
            style={{ width: `${pct}%`, background: color }}
          />
        </div>
        <span className="context-pct" style={{ color }}>{pct}%</span>
      </div>

      {/* Compress button */}
      <button
        className={`compress-btn${highlight ? " highlight" : ""}`}
        onClick={() => setPopoverOpen((o) => !o)}
        title="Compress Context"
      >
        <Icon name="spark" size={12} />
        Compress
      </button>

      {/* Popover */}
      {popoverOpen && (
        <div className="compress-popover">
          <div className="compress-popover-title ui-font">Compress Context</div>
          <input
            className="compress-input"
            placeholder="Compression focus (optional; leave blank for full compression)"
            value={focusText}
            onChange={(e) => setFocusText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleCompress(); if (e.key === "Escape") setPopoverOpen(false); }}
            autoFocus
          />
          <div className="compress-popover-actions">
            <button className="btn-cancel ui-font" onClick={() => setPopoverOpen(false)}>Cancel</button>
            <button className="btn-confirm ui-font" onClick={handleCompress}>Compress Now</button>
          </div>
        </div>
      )}
    </div>
  );
}
