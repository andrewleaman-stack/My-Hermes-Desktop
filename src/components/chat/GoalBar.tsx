import { useState, useEffect, useRef } from "react";
import Icon from "../Icon";

interface GoalState {
  text: string;
  status: "active" | "paused";
  rounds: number;
}

interface Props {
  streaming: boolean;
  onSend: (text: string) => void;
}

const STORAGE_KEY = "hermes-goal-state";

function loadGoal(): GoalState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export default function GoalBar({ streaming, onSend }: Props) {
  const [goal, setGoal] = useState<GoalState | null>(loadGoal);
  const [collapsed, setCollapsed] = useState(false);
  const [inputting, setInputting] = useState(false);
  const [inputText, setInputText] = useState("");
  const prevStreamingRef = useRef(streaming);

  // Persist goal to localStorage on every change; notify parent
  useEffect(() => {
    if (goal) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(goal));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
    window.dispatchEvent(new CustomEvent("goal-changed", { detail: !!goal }));
  }, [goal]);

  // Count rounds: streaming true → false while active = 1 round
  useEffect(() => {
    if (!streaming && prevStreamingRef.current) {
      setGoal((g) =>
        g && g.status === "active" ? { ...g, rounds: g.rounds + 1 } : g
      );
    }
    prevStreamingRef.current = streaming;
  }, [streaming]);

  const handleConfirm = () => {
    const text = inputText.trim();
    if (!text) return;
    setGoal({ text, status: "active", rounds: 0 });
    setInputting(false);
    setInputText("");
    onSend(`/goal set ${text}`);
  };

  const handlePause = () => {
    setGoal((g) => (g ? { ...g, status: "paused" } : null));
    onSend("/goal pause");
  };

  const handleResume = () => {
    setGoal((g) => (g ? { ...g, status: "active" } : null));
    onSend("/goal resume");
  };

  const handleClear = () => {
    setGoal(null);
    setCollapsed(false);
    onSend("/goal clear");
  };

  const cancelInput = () => {
    setInputting(false);
    setInputText("");
  };

  useEffect(() => {
    const handler = () => {
      if (!goal) setInputting(true);
    };
    window.addEventListener("open-goal-input", handler);
    return () => window.removeEventListener("open-goal-input", handler);
  }, [goal]);

  if (!goal && !inputting) return null;

  if (inputting) {
    return (
      <div className="goal-bar goal-bar-editing">
        <Icon name="timer" size={13} className="goal-bar-icon" />
        <input
          autoFocus
          className="goal-input ui-font"
          placeholder="Describe your persistent goal..."
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleConfirm();
            if (e.key === "Escape") cancelInput();
          }}
        />
        <button className="goal-action-btn ui-font" onClick={handleConfirm}>
          Confirm
        </button>
        <button className="goal-icon-btn" onClick={cancelInput}>
          <Icon name="close" size={12} />
        </button>
      </div>
    );
  }

  if (!goal) return null;

  return (
    <div className={`goal-bar goal-bar-active${collapsed ? " goal-bar-collapsed" : ""}`}>
      <button
        className="goal-icon-btn goal-toggle"
        onClick={() => setCollapsed((c) => !c)}
        title={collapsed ? "Expand" : "Collapse"}
      >
        <Icon
          name="chevronRight"
          size={12}
          style={{
            transform: collapsed ? "rotate(0deg)" : "rotate(90deg)",
            transition: "transform 0.15s",
          }}
        />
      </button>

      <span className={`goal-status-dot goal-status-${goal.status}`} />

      <span className="goal-text ui-font">{goal.text}</span>

      {!collapsed && (
        <div className="goal-controls">
          {goal.status === "active" ? (
            <button className="goal-action-btn ui-font" onClick={handlePause}>
              Pause
            </button>
          ) : (
            <button className="goal-action-btn goal-action-resume ui-font" onClick={handleResume}>
              Resume
            </button>
          )}
          <button className="goal-action-btn goal-action-clear ui-font" onClick={handleClear}>
            Clear
          </button>
        </div>
      )}

      <span className="goal-rounds ui-font">{goal.rounds} rounds</span>
    </div>
  );
}
