import { open } from "@tauri-apps/plugin-dialog";

interface Props {
  workingDir: string | null;
  onDirChange: (dir: string | null) => void;
}

export default function WorkingDirBar({ workingDir, onDirChange }: Props) {
  const homeDir = "~";
  const displayPath = workingDir
    ? workingDir.replace(/^\/Users\/[^/]+/, "~")
    : homeDir;
  const basename = displayPath.split("/").pop() || displayPath;

  async function handleClick() {
    const selected = await open({ directory: true, multiple: false });
    if (typeof selected === "string") {
      onDirChange(selected);
    }
  }

  function handleReset(e: React.MouseEvent) {
    e.stopPropagation();
    onDirChange(null);
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "6px",
        padding: "5px 14px",
        borderBottom: "1px solid var(--border)",
        background: "var(--bg-secondary, rgba(255,255,255,0.03))",
        fontSize: "12px",
        color: "var(--text-secondary, #888)",
        userSelect: "none",
        flexShrink: 0,
      }}
    >
      {/* folder icon */}
      <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" style={{ opacity: 0.7, flexShrink: 0 }}>
        <path d="M1.5 3A1.5 1.5 0 0 0 0 4.5v8A1.5 1.5 0 0 0 1.5 14h13A1.5 1.5 0 0 0 16 12.5v-7A1.5 1.5 0 0 0 14.5 4H7.621a1.5 1.5 0 0 1-1.06-.44L5.5 2.5A1.5 1.5 0 0 0 4.44 2H1.5Z" />
      </svg>

      <button
        onClick={handleClick}
        title={workingDir ?? "点击选择工作目录"}
        style={{
          background: "none",
          border: "none",
          padding: "0",
          margin: "0",
          cursor: "pointer",
          color: "inherit",
          fontSize: "inherit",
          fontFamily: "inherit",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          maxWidth: "260px",
        }}
      >
        {basename}
      </button>

      {workingDir && (
        <button
          onClick={handleReset}
          title="重置到主目录"
          style={{
            background: "none",
            border: "none",
            padding: "0 2px",
            cursor: "pointer",
            color: "var(--text-secondary, #888)",
            fontSize: "14px",
            lineHeight: 1,
            opacity: 0.6,
            flexShrink: 0,
          }}
        >
          ×
        </button>
      )}
    </div>
  );
}
