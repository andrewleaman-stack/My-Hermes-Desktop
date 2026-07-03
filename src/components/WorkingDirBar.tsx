import { useState, useRef, useEffect } from "react";
import { open } from "@tauri-apps/plugin-dialog";

interface Props {
  workingDir: string | null;
  onDirChange: (dir: string | null) => void;
  fileTreeOpen?: boolean;
  onToggleFileTree?: () => void;
  /** Conversation status shown right-aligned (message count, memory state). */
  messageCount?: number;
  memoryLoaded?: boolean | null;
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

export default function WorkingDirBar({
  workingDir,
  onDirChange,
  fileTreeOpen,
  onToggleFileTree,
  messageCount,
  memoryLoaded = null,
}: Props) {
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
        padding: "4px 14px",
        background: "transparent",
        fontSize: "12px",
        color: "var(--muted)",
        userSelect: "none",
        flexShrink: 0,
        minHeight: "26px",
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
        /* Edit state */
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
          <button onClick={handleBrowse} style={btnStyle}>Browse...</button>
          <button onClick={confirmEdit} title="Confirm (Enter)" style={iconBtnStyle}>✓</button>
          <button onClick={cancelEdit} title="Cancel (Esc)" style={{ ...iconBtnStyle, opacity: 0.5 }}>✕</button>
        </>
      ) : (
        /* Breadcrumb state */
        <>
          {/* home segment */}
          <BreadcrumbSegment
            label="~"
            onClick={handleReset}
            title="Reset to home directory"
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

          {/* conversation status (merged from the old context-info bar) */}
          {messageCount !== undefined && (
            <span
              className="ui-font"
              style={{ whiteSpace: "nowrap", color: "var(--muted-soft)", marginRight: "6px" }}
            >
              {messageCount === 0 ? "New conversation" : `${messageCount} messages`}
              {memoryLoaded !== null && (
                <>
                  {" · "}
                  <span className={memoryLoaded ? "ctx-memory-ok" : "ctx-memory-none"}>
                    {memoryLoaded ? "Personal memory loaded" : "Personal memory not configured"}
                  </span>
                </>
              )}
            </span>
          )}

          {/* edit trigger */}
          <button
            onClick={enterEdit}
            title={"Edit path: " + displayPath}
            style={{ ...iconBtnStyle, opacity: 0 }}
            className="workingdir-edit-btn"
          >
            ✎
          </button>

          {/* file tree toggle */}
          {onToggleFileTree && (
            <button
              onClick={onToggleFileTree}
              title={fileTreeOpen ? "Close file tree" : "Browse file tree"}
              style={{
                ...iconBtnStyle,
                opacity: fileTreeOpen ? 1 : 0.5,
                padding: "2px 3px",
                color: fileTreeOpen ? "var(--accent, #c07a5a)" : "inherit",
              }}
            >
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
                {/* folder outline */}
                <path d="M1 4.5A1 1 0 0 1 2 3.5h3l1 1h7a1 1 0 0 1 1 1V12a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1z" strokeWidth="1.2"/>
                {/* file list lines inside folder */}
                <line x1="4" y1="8" x2="12" y2="8"/>
                <line x1="4" y1="10.2" x2="10" y2="10.2"/>
              </svg>
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
