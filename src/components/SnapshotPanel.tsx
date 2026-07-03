import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import Icon from "./Icon";

interface Snapshot {
  id: string;
  hermesId?: string;
  label: string;
  createdAt: string;
  sessionTitle: string;
  expanded: boolean;
  status?: "saving" | "ok" | "error";
}

interface BackgroundTaskSummary {
  id: string;
  prompt: string;
  started_at: string;
  finished_at: string | null;
  status: "running" | "done" | "failed";
  pid: number | null;
  exit_code: number | null;
  session_id: string | null;
  tail: string;
}

interface Props {
  onSend: (text: string) => void;
  onClose: () => void;
  sessionTitle?: string;
  externalCreateCount?: number;
  initialTab?: "snapshot" | "background";
  onBgCountChange?: (running: number) => void;
}

interface TimelineStep {
  status: "done" | "running" | "pending" | "error";
  label: string;
}

function parseSteps(output: string): TimelineStep[] {
  const steps: TimelineStep[] = [];
  for (const line of output.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    if (/^[✓✔]/.test(t)) {
      steps.push({ status: "done", label: t.replace(/^[✓✔]\s*/, "") });
    } else if (/^[✖✗]/.test(t)) {
      steps.push({ status: "error", label: t.replace(/^[✖✗]\s*/, "") });
    } else if (/^⏳/.test(t)) {
      steps.push({ status: "running", label: t.replace(/^⏳\s*/, "") });
    } else if (/^○/.test(t)) {
      steps.push({ status: "pending", label: t.replace(/^○\s*/, "") });
    } else if (/(?:Running tool|Tool call|Calling tool|tool_use)[:：\s]/i.test(t)) {
      steps.push({ status: "done", label: t });
    }
  }
  return steps.slice(-10);
}

const STEP_ICONS: Record<TimelineStep["status"], string> = {
  done: "✓",
  running: "⏳",
  pending: "○",
  error: "✗",
};

const STORAGE_KEY = "hermes-snapshot-log";
let snapshotCounter = 0;

function makeId() {
  return `snap-${Date.now()}-${++snapshotCounter}`;
}

function loadFromStorage(): Snapshot[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(startIso: string, endIso: string | null) {
  const start = new Date(startIso).getTime();
  const end = endIso ? new Date(endIso).getTime() : Date.now();
  const sec = Math.max(0, Math.floor((end - start) / 1000));
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export default function SnapshotPanel({
  onSend,
  onClose,
  sessionTitle = "Untitled Session",
  externalCreateCount = 0,
  initialTab = "snapshot",
  onBgCountChange,
}: Props) {
  const [tab, setTab] = useState<"snapshot" | "background">(initialTab);
  const [snapshots, setSnapshots] = useState<Snapshot[]>(loadFromStorage);
  const [confirmRestoreId, setConfirmRestoreId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [prevExternal, setPrevExternal] = useState(externalCreateCount);

  // Background tasks state
  const [bgTasks, setBgTasks] = useState<BackgroundTaskSummary[]>([]);
  const [bgExpanded, setBgExpanded] = useState<Record<string, boolean>>({});
  const [bgFullOutput, setBgFullOutput] = useState<Record<string, string>>({});
  const [bgConfirmStopAll, setBgConfirmStopAll] = useState(false);
  const tickRef = useRef(0);

  // Persist snapshots to localStorage on every change
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshots));
  }, [snapshots]);

  // Sync entries created via chat input (/snapshot create sent directly)
  useEffect(() => {
    if (externalCreateCount > prevExternal) {
      const delta = externalCreateCount - prevExternal;
      setSnapshots((prev) => {
        let next = prev;
        for (let i = 0; i < delta; i++) {
          next = [makeEntry(next.length + 1, sessionTitle), ...next];
        }
        return next;
      });
    }
    setPrevExternal(externalCreateCount);
  }, [externalCreateCount]);

  // Switch tab when initialTab changes (e.g. user clicks "Run in Background" → auto-open background)
  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  // Poll background tasks every 5s while panel is open; faster (1s) when running tasks exist
  const refreshBgTasks = async () => {
    try {
      const tasks = await invoke<BackgroundTaskSummary[]>("bg_list");
      setBgTasks(tasks);
      const running = tasks.filter((t) => t.status === "running").length;
      onBgCountChange?.(running);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    refreshBgTasks();
    const id = setInterval(() => {
      tickRef.current += 1;
      refreshBgTasks();
    }, 5000);
    return () => clearInterval(id);
  }, []);

  function makeEntry(index: number, title: string, opts?: { hermesId?: string; status?: "saving" | "ok" | "error" }): Snapshot {
    return {
      id: makeId(),
      hermesId: opts?.hermesId,
      label: `Snapshots ${index}`,
      createdAt: new Date().toISOString(),
      sessionTitle: title,
      expanded: false,
      status: opts?.status ?? "ok",
    };
  }

  const handleSave = async () => {
    const localId = makeId();
    const index = snapshots.length + 1;
    const placeholder: Snapshot = {
      id: localId,
      label: `Snapshots ${index}`,
      createdAt: new Date().toISOString(),
      sessionTitle: sessionTitle,
      expanded: false,
      status: "saving",
    };
    setSnapshots((prev) => [placeholder, ...prev]);
    try {
      const hermesId = await invoke<string>("snapshot_create", { label: null });
      setSnapshots((prev) =>
        prev.map((s) => s.id === localId ? { ...s, hermesId, status: "ok" } : s)
      );
    } catch (e) {
      setSnapshots((prev) =>
        prev.map((s) => s.id === localId ? { ...s, status: "error" } : s)
      );
    }
  };

  const toggleExpand = (id: string) => {
    setSnapshots((prev) =>
      prev.map((s) => (s.id === id ? { ...s, expanded: !s.expanded } : s))
    );
  };

  const handleRestore = (snap: Snapshot) => {
    if (confirmRestoreId === snap.id) {
      setConfirmRestoreId(null);
      if (snap.hermesId) {
        onSend(`/snapshot restore ${snap.hermesId}`);
      }
    } else {
      setConfirmRestoreId(snap.id);
      setConfirmDeleteId(null);
    }
  };

  const handleDelete = (id: string) => {
    if (confirmDeleteId === id) {
      setSnapshots((prev) => prev.filter((s) => s.id !== id));
      setConfirmDeleteId(null);
    } else {
      setConfirmDeleteId(id);
      setConfirmRestoreId(null);
    }
  };

  const cancelConfirm = () => {
    setConfirmRestoreId(null);
    setConfirmDeleteId(null);
  };

  // Background tasks handlers
  const toggleBgExpand = async (id: string) => {
    const next = !bgExpanded[id];
    setBgExpanded((prev) => ({ ...prev, [id]: next }));
    if (next && !bgFullOutput[id]) {
      try {
        const out = await invoke<string>("bg_get_output", { taskId: id });
        setBgFullOutput((prev) => ({ ...prev, [id]: out }));
      } catch (e) {
        setBgFullOutput((prev) => ({ ...prev, [id]: `Read failed: ${e}` }));
      }
    }
  };

  const handleStopOne = async (id: string) => {
    try {
      await invoke("bg_stop", { taskId: id });
      setTimeout(refreshBgTasks, 500);
    } catch {
      /* ignore */
    }
  };

  const handleStopAll = async () => {
    if (!bgConfirmStopAll) {
      setBgConfirmStopAll(true);
      setTimeout(() => setBgConfirmStopAll(false), 3000);
      return;
    }
    setBgConfirmStopAll(false);
    try {
      await invoke<number>("bg_stop_all");
      setTimeout(refreshBgTasks, 500);
    } catch {
      /* ignore */
    }
  };

  const handleClearFinished = async () => {
    try {
      await invoke<number>("bg_clear_finished");
      refreshBgTasks();
    } catch {
      /* ignore */
    }
  };

  const runningCount = bgTasks.filter((t) => t.status === "running").length;

  return (
    <div className="right-panel">
      {/* Header */}
      <div className="right-panel-header">
        <div className="right-panel-tabs">
          <button
            className={`right-panel-tab ui-font${tab === "snapshot" ? " active" : ""}`}
            onClick={() => setTab("snapshot")}
          >
            Snapshots
          </button>
          <button
            className={`right-panel-tab ui-font${tab === "background" ? " active" : ""}`}
            onClick={() => setTab("background")}
          >
            Background Tasks
            {runningCount > 0 && (
              <span className="right-panel-tab-badge">{runningCount}</span>
            )}
          </button>
        </div>
        <button className="right-panel-close" onClick={onClose}>
          <Icon name="close" size={13} />
        </button>
      </div>

      {/* Snapshot tab */}
      {tab === "snapshot" && (
        <div className="right-panel-body">
          <button className="snapshot-save-btn ui-font" onClick={handleSave}>
            <Icon name="package" size={13} />
            Save Snapshot
          </button>

          {/* Disclaimer */}
          <div className="snapshot-notice ui-font">
            Snapshots are saved to ~/.hermes/state-snapshots/
          </div>

          {/* List */}
          {snapshots.length === 0 ? (
            <div className="snapshot-empty ui-font">No records yet</div>
          ) : (
            <div className="snapshot-list">
              {snapshots.map((snap) => (
                <div key={snap.id} className="snapshot-item">
                  <div
                    className="snapshot-item-header"
                    onClick={() => toggleExpand(snap.id)}
                  >
                    <Icon
                      name="chevronRight"
                      size={11}
                      style={{
                        transform: snap.expanded ? "rotate(90deg)" : "rotate(0deg)",
                        transition: "transform 0.15s",
                        flexShrink: 0,
                        color: "var(--muted-soft)",
                      }}
                    />
                    <div className="snapshot-item-meta">
                      <span className="snapshot-item-label ui-font">
                        {snap.label}
                        {snap.status === "saving" && <span style={{ opacity: 0.5, marginLeft: 4 }}>Saving...</span>}
                        {snap.status === "error" && <span style={{ color: "var(--danger, #e05)", marginLeft: 4 }}>Failed</span>}
                      </span>
                      <span className="snapshot-item-session ui-font">
                        {snap.hermesId ?? snap.sessionTitle}
                      </span>
                    </div>
                    <span className="snapshot-item-time ui-font">
                      {formatDateTime(snap.createdAt)}
                    </span>
                  </div>

                  {snap.expanded && (
                    <div className="snapshot-item-body">
                      {/* Confirm states */}
                      {confirmRestoreId === snap.id && (
                        <div className="snapshot-confirm-row">
                          <span className="snapshot-confirm-label ui-font">Resume this snapshot?</span>
                          <button className="snapshot-action-btn snapshot-action-confirm ui-font" onClick={() => handleRestore(snap)}>Confirm</button>
                          <button className="snapshot-action-btn ui-font" onClick={cancelConfirm}>Cancel</button>
                        </div>
                      )}
                      {confirmDeleteId === snap.id && (
                        <div className="snapshot-confirm-row">
                          <span className="snapshot-confirm-label ui-font">Delete this record?</span>
                          <button className="snapshot-action-btn snapshot-action-danger ui-font" onClick={() => handleDelete(snap.id)}>Delete</button>
                          <button className="snapshot-action-btn ui-font" onClick={cancelConfirm}>Cancel</button>
                        </div>
                      )}
                      {!confirmRestoreId && !confirmDeleteId && (
                        <div className="snapshot-item-actions">
                          <button
                            className="snapshot-action-btn ui-font"
                            onClick={() => handleRestore(snap)}
                            disabled={!snap.hermesId || snap.status !== "ok"}
                          >
                            Resume
                          </button>
                          <button className="snapshot-action-btn ui-font" onClick={() => handleDelete(snap.id)}>
                            Delete Record
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Background tasks tab */}
      {tab === "background" && (
        <div className="right-panel-body">
          <div className="bg-toolbar">
            <button
              className="bg-toolbar-btn ui-font"
              onClick={refreshBgTasks}
              title="Refresh now"
            >
              <Icon name="refresh" size={12} />
              Refresh
            </button>
            <button
              className="bg-toolbar-btn ui-font"
              onClick={handleClearFinished}
              title="Remove completed/failed records"
              disabled={bgTasks.every((t) => t.status === "running")}
            >
              Clear Completed
            </button>
            <button
              className={`bg-toolbar-btn ui-font${bgConfirmStopAll ? " bg-toolbar-btn-danger" : ""}`}
              onClick={handleStopAll}
              disabled={runningCount === 0}
            >
              {bgConfirmStopAll ? "ConfirmStopAll" : "StopAll"}
            </button>
          </div>

          <div className="snapshot-notice ui-font">
            Background tasks run in isolated Hermes processes (--source tool) and do not appear in the main session list
          </div>

          {bgTasks.length === 0 ? (
            <div className="snapshot-empty ui-font">
              No background tasks yet<br />
              <span style={{ fontSize: 11, opacity: 0.7 }}>
                Click the "Run in Background" button in the composer to start a task
              </span>
            </div>
          ) : (
            <div className="snapshot-list">
              {bgTasks.map((task) => {
                const expanded = bgExpanded[task.id] ?? false;
                const dotClass =
                  task.status === "running"
                    ? "bg-dot-running"
                    : task.status === "done"
                    ? "bg-dot-done"
                    : "bg-dot-failed";
                const statusLabel =
                  task.status === "running"
                    ? "Running"
                    : task.status === "done"
                    ? "Completed"
                    : `Failed(${task.exit_code ?? "?"})`;
                return (
                  <div key={task.id} className="snapshot-item">
                    <div
                      className="snapshot-item-header"
                      onClick={() => toggleBgExpand(task.id)}
                    >
                      <Icon
                        name="chevronRight"
                        size={11}
                        style={{
                          transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
                          transition: "transform 0.15s",
                          flexShrink: 0,
                          color: "var(--muted-soft)",
                        }}
                      />
                      <span className={`bg-status-dot ${dotClass}`} title={statusLabel} />
                      <div className="snapshot-item-meta">
                        <span className="snapshot-item-label ui-font" title={task.prompt}>
                          {task.prompt.slice(0, 40)}
                          {task.prompt.length > 40 ? "…" : ""}
                        </span>
                        <span className="snapshot-item-session ui-font">
                          {statusLabel} · {formatDuration(task.started_at, task.finished_at)}
                        </span>
                      </div>
                      <span className="snapshot-item-time ui-font">
                        {formatDateTime(task.started_at)}
                      </span>
                    </div>

                    {expanded && (
                      <div className="snapshot-item-body">
                        {bgFullOutput[task.id] !== undefined && (() => {
                          const steps = parseSteps(bgFullOutput[task.id]);
                          if (steps.length === 0) return null;
                          return (
                            <div className="bg-timeline">
                              {steps.map((step, i) => (
                                <div key={i} className={`bg-timeline-step bg-step-${step.status}`}>
                                  <span className="bg-step-icon">{STEP_ICONS[step.status]}</span>
                                  <span className="bg-step-label ui-font">{step.label}</span>
                                </div>
                              ))}
                            </div>
                          );
                        })()}
                        {task.tail && (
                          <pre className="bg-tail">{task.tail}</pre>
                        )}
                        <div className="snapshot-item-actions">
                          {task.status === "running" && (
                            <button
                              className="snapshot-action-btn snapshot-action-danger ui-font"
                              onClick={() => handleStopOne(task.id)}
                            >
                              Stop
                            </button>
                          )}
                        </div>
                        {bgFullOutput[task.id] !== undefined && (
                          <details className="bg-full-details">
                            <summary className="ui-font">Full Output</summary>
                            <pre className="bg-full-output">
                              {bgFullOutput[task.id] || "(empty)"}
                            </pre>
                          </details>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
