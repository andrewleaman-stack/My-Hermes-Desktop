import { useState, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

const LEVELS = [
  { value: "none", label: "Off" },
  { value: "minimal", label: "Minimal" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "xhigh", label: "Highest" },
] as const;

interface Props {
  onNewSession: () => void;
}

export default function ReasoningPicker({ onNewSession }: Props) {
  const [currentLevel, setCurrentLevel] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Load current from config on mount
  useEffect(() => {
    invoke<string>("get_reasoning_effort")
      .then(setCurrentLevel)
      .catch(() => setCurrentLevel("medium"));
  }, []);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleSelect = (value: string) => {
    setOpen(false);
    if (value === currentLevel) return;
    // Optimistically update UI, then persist
    setCurrentLevel(value);
    invoke("set_reasoning_effort", { level: value })
      .then(() => onNewSession())
      .catch((e) => {
        console.error("Failed to set reasoning effort:", e);
        // Revert on failure
        invoke<string>("get_reasoning_effort").then(setCurrentLevel).catch(() => {});
      });
  };

  const label = LEVELS.find((l) => l.value === currentLevel)?.label ?? "Medium";

  return (
    <div className="reasoning-picker" ref={ref}>
      <button
        className="app-titlebar-icon-btn"
        onClick={() => setOpen((o) => !o)}
        title={`Reasoning effort：${label}`}
        aria-label="SwitchReasoning effort"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="reasoning-picker-trigger-label">{label}</span>
      </button>

      {open && (
        <div className="reasoning-picker-dropdown" role="listbox" aria-label="Reasoning effort">
          {LEVELS.map(({ value, label }) => (
            <button
              key={value}
              role="option"
              aria-selected={value === currentLevel}
              className={`reasoning-picker-item${value === currentLevel ? " active" : ""}`}
              onClick={() => handleSelect(value)}
            >
              <span className="reasoning-picker-check">
                {value === currentLevel ? "●" : ""}
              </span>
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
