import { useState, useEffect, useRef } from "react";
import { Session } from "../types";
import Icon from "./Icon";

interface Props {
  sessions: Session[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}

function formatDate(iso: string): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 60_000) return "just now";
    if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
    return `${Math.floor(diff / 86400_000)}d ago`;
  } catch {
    return "";
  }
}

export default function Sidebar({ sessions, activeId, onSelect, onNew, onDelete }: Props) {
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

        {sessions.map((s) => (
          <div
            key={s.id}
            className={`session-item ${activeId === s.id ? "active" : ""}`}
            onClick={() => {
              if (pendingId === s.id) cancelDelete();
              else onSelect(s.id);
            }}
          >
            <div className="session-item-title">{s.title || "Untitled"}</div>
            <div className="session-item-meta">
              <span>{formatDate(s.updated_at)}</span>
              {s.message_count !== undefined && <span>{s.message_count} msgs</span>}
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
        ))}
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
