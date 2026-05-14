import { useState, useEffect, useRef } from "react";
import { Session } from "../types";
import Icon from "./Icon";

interface Props {
  sessions: Session[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  badges: Record<string, "running" | "queued" | "done">;
}

function formatDate(iso: string): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 60_000) return "0m";
    if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m`;
    if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h`;
    return `${Math.floor(diff / 86400_000)}d`;
  } catch {
    return "";
  }
}

const badgeMeta: Record<Props["badges"][string], { icon: "spark" | "timer" | "check"; label: string }> = {
  running: { icon: "spark", label: "执行中" },
  queued: { icon: "timer", label: "排队中" },
  done: { icon: "check", label: "执行完成" },
};

export default function Sidebar({ sessions, activeId, onSelect, onNew, onDelete, badges }: Props) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const requestDelete = (id: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setPendingId(id);
    timerRef.current = setTimeout(() => setPendingId(null), 3000);
  };

  const confirmDelete = (id: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setPendingId(null);
    onDelete(id);
  };

  const cancelDelete = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setPendingId(null);
  };

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <span className="sidebar-title ui-font">Sessions</span>
        <button className="btn-new-session" onClick={onNew} title="New Session">+</button>
      </div>

      <div className="session-list">
        {sessions.length === 0 && (
          <div style={{ padding: "16px 12px", color: "var(--muted)", fontSize: 11 }}>
            No sessions yet.<br />Start a conversation!
          </div>
        )}

        {sessions.map((s) => {
          const badge = badges[s.id];
          const meta = badge ? badgeMeta[badge] : null;

          return (
            <div
              key={s.id}
              className={`session-item ${activeId === s.id ? "active" : ""}`}
              onClick={() => {
                if (pendingId === s.id) cancelDelete();
                else onSelect(s.id);
              }}
            >
              <div className="session-item-title-row">
                <div className="session-item-title">{s.title || "Untitled"}</div>
                {meta && (
                  <div
                    className={`session-badge session-badge--${badge}`}
                    title={meta.label}
                    aria-label={meta.label}
                  >
                    {badge === "running" && <span className="session-badge-dot" />}
                    <Icon name={meta.icon} size={11} />
                  </div>
                )}
              </div>
              <div className="session-item-meta">
                <span className="session-meta-chip" title="更新时间">
                  <Icon name="timer" size={11} />
                  {formatDate(s.updated_at)}
                </span>
                {s.message_count !== undefined && (
                  <span className="session-meta-chip" title="消息数">
                    <Icon name="message" size={11} />
                    {s.message_count}
                  </span>
                )}
                {s.cost !== undefined && s.cost > 0 && <span>${s.cost.toFixed(3)}</span>}
              </div>

              {pendingId === s.id ? (
                <div className="session-delete-confirm" onClick={(e) => e.stopPropagation()}>
                  <span className="session-delete-label">删除?</span>
                  <button
                    className="session-delete-yes"
                    onClick={() => confirmDelete(s.id)}
                    title="确认删除"
                  >
                    <Icon name="check" size={11} />
                  </button>
                  <button
                    className="session-delete-no"
                    onClick={cancelDelete}
                    title="取消"
                  >
                    <Icon name="close" size={11} />
                  </button>
                </div>
              ) : (
                <button
                  className="session-delete"
                  onClick={(e) => { e.stopPropagation(); requestDelete(s.id); }}
                  title="删除会话"
                >
                  <Icon name="close" size={12} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div style={{
        padding: "8px 12px",
        borderTop: "1px solid var(--hairline)",
        fontSize: 10,
        color: "var(--muted)",
        fontFamily: "'Inter', sans-serif",
      }}>
        {sessions.length} session{sessions.length !== 1 ? "s" : ""}{" · "}~/.hermes/
      </div>
    </div>
  );
}
