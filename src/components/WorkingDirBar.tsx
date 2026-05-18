import { useState, useRef, useEffect } from "react";
import { open } from "@tauri-apps/plugin-dialog";

interface Props {
  workingDir: string | null;
  onDirChange: (dir: string | null) => void;
  fileTreeOpen?: boolean;
  onToggleFileTree?: () => void;
}

function normalizePath(raw: string): string {
  return raw.replace(/\/+$/, "") || "/";
}

function toDisplayPath(absPath: string): string {
  const home = "/Users/" + (absPath.split("/")[2] ?? "");
  return absPath.startsWith(home) ? absPath.replace(home, "~") : absPath;
}

function buildSegments(absPath: string): { label: string; path: string }[] {
  const parts = absPath.split("/").filter(Boolean);
  return parts.map((part, i) => ({
    label: part,
    path: "/" + parts.slice(0, i + 1).join("/"),
  }));
}

export default function WorkingDirBar({ workingDir, onDirChange, fileTreeOpen, onToggleFileTree }: Props) {
  const [editing, setEditing] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const defaultDir = "/Users/" + (typeof window !== "undefined" ? "" : "");
  const currentPath = workingDir ?? null;

  useEffect(() => {
    if (editing) {
      setInputValue(currentPath ?? "");
      setTimeout(() => inputRef.current?.select(), 0);
    }
  }, [editing]);

  function enterEdit() {
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
  }

  function confirmEdit() {
    const val = normalizePath(inputValue.trim());
    if (val) {
      onDirChange(val === "~" ? null : val);
    }
    setEditing(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") confirmEdit();
    if (e.key === "Escape") cancelEdit();
  }

  async function handleBrowse() {
    const selected = await open({ directory: true, multiple: false });
    if (typeof selected === "string") {
      onDirChange(selected);
      setEditing(false);
    }
  }

  function handleSegmentClick(path: string) {
    onDirChange(path);
  }

  function handleReset() {
    onDirChange(null);
  }

  const segments = currentPath ? buildSegments(currentPath) : [];
  const displayPath = currentPath ? toDisplayPath(currentPath) : "~";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "4px",
        padding: "5px 14px",
        borderBottom: "1px solid var(--border)",
        background: "var(--bg-secondary, rgba(128,128,128,0.05))",
        fontSize: "12px",
        color: "var(--text-secondary, #888)",
        userSelect: "none",
        flexShrink: 0,
        minHeight: "30px",
      }}
    >
      {/* folder icon */}
      <svg
        width="13" height="13" viewBox="0 0 16 16" fill="currentColor"
        style={{ opacity: 0.6, flexShrink: 0 }}
      >
        <path d="M1.5 3A1.5 1.5 0 0 0 0 4.5v8A1.5 1.5 0 0 0 1.5 14h13A1.5 1.5 0 0 0 16 12.5v-7A1.5 1.5 0 0 0 14.5 4H7.621a1.5 1.5 0 0 1-1.06-.44L5.5 2.5A1.5 1.5 0 0 0 4.44 2H1.5Z" />
      </svg>

      {editing ? (
        /* ── 编辑态 ── */
        <>
          <input
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="/path/to/project"
            style={{
              flex: 1,
              minWidth: 0,
              background: "var(--bg-input, rgba(0,0,0,0.15))",
              border: "1px solid var(--accent, #c07a5a)",
              borderRadius: "4px",
              color: "var(--text-primary, inherit)",
              fontSize: "12px",
              padding: "2px 6px",
              outline: "none",
              fontFamily: "var(--font-mono, monospace)",
            }}
          />
          <button onClick={handleBrowse} style={btnStyle}>浏览…</button>
          <button onClick={confirmEdit} title="确认 (Enter)" style={iconBtnStyle}>✓</button>
          <button onClick={cancelEdit} title="取消 (Esc)" style={{ ...iconBtnStyle, opacity: 0.5 }}>✕</button>
        </>
      ) : (
        /* ── 面包屑态 ── */
        <>
          {/* home segment */}
          <BreadcrumbSegment
            label="~"
            onClick={handleReset}
            title="重置到主目录"
          />

          {segments.map((seg, i) => (
            <span key={seg.path} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <Separator />
              <BreadcrumbSegment
                label={seg.label}
                onClick={() => handleSegmentClick(seg.path)}
                title={seg.path}
                active={i === segments.length - 1}
              />
            </span>
          ))}

          {/* spacer */}
          <span style={{ flex: 1 }} />

          {/* edit trigger */}
          <button
            onClick={enterEdit}
            title={"编辑路径: " + displayPath}
            style={{ ...iconBtnStyle, opacity: 0 }}
            className="workingdir-edit-btn"
          >
            ✎
          </button>

          {/* file tree toggle */}
          {onToggleFileTree && (
            <button
              onClick={onToggleFileTree}
              title={fileTreeOpen ? "关闭文件树" : "浏览文件树"}
              style={{
                ...iconBtnStyle,
                opacity: fileTreeOpen ? 0.9 : 0.45,
                fontSize: "15px",
              }}
            >
              ⊟
            </button>
          )}
        </>
      )}

      <style>{`
        .workingdir-edit-btn { transition: opacity 0.15s; }
        div:has(.workingdir-edit-btn):hover .workingdir-edit-btn { opacity: 0.5 !important; }
        .workingdir-edit-btn:hover { opacity: 1 !important; }
      `}</style>
    </div>
  );
}

function BreadcrumbSegment({
  label, onClick, title, active,
}: {
  label: string;
  onClick: () => void;
  title?: string;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        background: "none",
        border: "none",
        padding: "0",
        cursor: "pointer",
        color: active ? "var(--text-primary, #ccc)" : "var(--text-secondary, #888)",
        fontSize: "12px",
        fontFamily: "inherit",
        fontWeight: active ? 500 : 400,
        whiteSpace: "nowrap",
        maxWidth: "160px",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}
    >
      {label}
    </button>
  );
}

function Separator() {
  return (
    <span style={{ opacity: 0.4, fontSize: "11px", lineHeight: 1 }}>/</span>
  );
}

const btnStyle: React.CSSProperties = {
  background: "var(--bg-input, rgba(0,0,0,0.15))",
  border: "1px solid var(--border)",
  borderRadius: "4px",
  color: "var(--text-secondary, #888)",
  fontSize: "11px",
  padding: "2px 7px",
  cursor: "pointer",
  whiteSpace: "nowrap",
  flexShrink: 0,
};

const iconBtnStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  padding: "0 3px",
  cursor: "pointer",
  color: "var(--text-secondary, #888)",
  fontSize: "13px",
  lineHeight: 1,
  flexShrink: 0,
};
