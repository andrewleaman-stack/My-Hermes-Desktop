import { useEffect } from "react";

interface Props {
  onClose: () => void;
}

const isMac = navigator.platform.toLowerCase().includes("mac");
const mod = isMac ? "⌘" : "Ctrl";
const shift = isMac ? "⇧" : "Shift";

const SHORTCUTS = [
  {
    group: "Global",
    items: [
      { keys: [mod, shift, "H"], label: "Show / Hide Window" },
      { keys: [mod, "/"], label: "Keyboard Shortcuts Panel" },
    ],
  },
  {
    group: "Session",
    items: [
      { keys: [mod, "N"], label: "New Session" },
    ],
  },
  {
    group: "Chat Input",
    items: [
      { keys: ["Enter"], label: "Send Message" },
      { keys: [shift, "Enter"], label: "New Line" },
      { keys: ["Esc"], label: "Cancel / Close panel" },
    ],
  },
  {
    group: "Panels",
    items: [
      { keys: [mod, "W"], label: "Close current panel" },
      { keys: [mod, "K"], label: "Open snapshots panel" },
    ],
  },
];

export default function KeyboardShortcutsPanel({ onClose }: Props) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="kbd-panel-overlay" onClick={onClose}>
      <div className="kbd-panel" onClick={(e) => e.stopPropagation()}>
        <div className="kbd-panel-header">
          <span className="kbd-panel-title">Shortcuts</span>
          <button className="kbd-panel-close" onClick={onClose} title="Off">✕</button>
        </div>
        <div className="kbd-panel-body">
          {SHORTCUTS.map((section) => (
            <div key={section.group} className="kbd-section">
              <div className="kbd-section-label">{section.group}</div>
              {section.items.map((item) => (
                <div key={item.label} className="kbd-row">
                  <span className="kbd-row-label">{item.label}</span>
                  <span className="kbd-row-keys">
                    {item.keys.map((k, i) => (
                      <kbd key={i} className="kbd-key">{k}</kbd>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
