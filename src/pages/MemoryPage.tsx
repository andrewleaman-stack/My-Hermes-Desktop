import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import Icon from "../components/Icon";

const LIMITS = { "MEMORY.md": 2200, "USER.md": 1375 } as const;
type MemFile = keyof typeof LIMITS;

function charColor(used: number, max: number): string {
  const pct = used / max;
  if (pct > 1)   return "var(--error)";
  if (pct > 0.9) return "var(--error)";
  if (pct > 0.7) return "var(--warning)";
  return "var(--success)";
}

interface PanelProps {
  filename: MemFile;
  label: string;
  description: string;
}

function MemoryPanel({ filename, label, description }: PanelProps) {
  const [content, setContent] = useState("");
  const [original, setOriginal] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const limit = LIMITS[filename];
  const charCount = content.length;
  const overLimit = charCount > limit;
  const dirty = content !== original;

  const load = useCallback(async () => {
    setLoading(true);
    setMsg(null);
    try {
      const text = await invoke<string>("read_memory", { filename });
      setContent(text);
      setOriginal(text);
    } catch (e) {
      setMsg({ text: `加载失败: ${e}`, ok: false });
    } finally {
      setLoading(false);
    }
  }, [filename]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (overLimit || saving) return;
    setSaving(true);
    setMsg(null);
    try {
      await invoke("save_memory", { filename, content });
      setOriginal(content);
      setMsg({ text: "已保存", ok: true });
      setTimeout(() => setMsg(null), 2000);
    } catch (e) {
      setMsg({ text: `保存失败: ${e}`, ok: false });
    } finally {
      setSaving(false);
    }
  };

  const pct = Math.min(100, Math.round((charCount / limit) * 100));
  const barColor = charColor(charCount, limit);

  return (
    <div className="memory-panel">
      {/* Header */}
      <div className="memory-panel-header">
        <div>
          <div className="memory-panel-title ui-font">{label}</div>
          <div className="memory-panel-desc">{description}</div>
        </div>
        <div className="memory-panel-actions">
          <button className="mem-btn-refresh" onClick={load} title="重新加载" disabled={loading}>
            <Icon name="refresh" size={14} />
          </button>
          <button
            className={`mem-btn-save ui-font${overLimit ? " disabled" : dirty ? " dirty" : ""}`}
            onClick={save}
            disabled={overLimit || saving || !dirty}
          >
            {saving ? "保存中…" : "保存"}
          </button>
        </div>
      </div>

      {/* Editor */}
      <textarea
        className="memory-textarea"
        value={loading ? "" : content}
        onChange={(e) => setContent(e.target.value)}
        placeholder={loading ? "加载中…" : `编辑 ${filename}…`}
        disabled={loading}
        spellCheck={false}
      />

      {/* Footer: char count + progress */}
      <div className="memory-panel-footer">
        <div className="memory-charbar">
          <div className="memory-charbar-track">
            <div
              className="memory-charbar-fill"
              style={{ width: `${pct}%`, background: barColor }}
            />
          </div>
          <span className="memory-charcount" style={{ color: barColor }}>
            {charCount.toLocaleString()} / {limit.toLocaleString()}
          </span>
        </div>
        {msg && (
          <span className="memory-msg" style={{ color: msg.ok ? "var(--success)" : "var(--error)" }}>
            {msg.text}
          </span>
        )}
        {overLimit && (
          <span className="memory-msg" style={{ color: "var(--error)" }}>
            超出上限，无法保存
          </span>
        )}
      </div>
    </div>
  );
}

// ─── MemoryPage ───────────────────────────────────────────────────────────────

export default function MemoryPage() {
  return (
    <div className="memory-page">
      <div className="memory-page-header">
        <span className="memory-page-icon">
          <Icon name="brain" size={22} />
        </span>
        <div>
          <div className="memory-page-title ui-font">Agent Memory</div>
          <div className="memory-page-subtitle">编辑 Agent 的记忆文件，超出上限时禁止保存</div>
        </div>
      </div>
      <div className="memory-panels">
        <MemoryPanel
          filename="MEMORY.md"
          label="MEMORY.md"
          description="Agent 自身知识笔记 · 上限 2200 字符"
        />
        <MemoryPanel
          filename="USER.md"
          label="USER.md"
          description="用户偏好 & 习惯 · 上限 1375 字符"
        />
      </div>
    </div>
  );
}
