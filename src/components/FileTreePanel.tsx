import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-shell";
import { Light as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";

// Register only commonly needed languages to keep bundle small
import ts from "react-syntax-highlighter/dist/esm/languages/prism/typescript";
import tsx from "react-syntax-highlighter/dist/esm/languages/prism/tsx";
import js from "react-syntax-highlighter/dist/esm/languages/prism/javascript";
import jsx from "react-syntax-highlighter/dist/esm/languages/prism/jsx";
import rust from "react-syntax-highlighter/dist/esm/languages/prism/rust";
import python from "react-syntax-highlighter/dist/esm/languages/prism/python";
import json from "react-syntax-highlighter/dist/esm/languages/prism/json";
import yaml from "react-syntax-highlighter/dist/esm/languages/prism/yaml";
import toml from "react-syntax-highlighter/dist/esm/languages/prism/toml";
import markdown from "react-syntax-highlighter/dist/esm/languages/prism/markdown";
import bash from "react-syntax-highlighter/dist/esm/languages/prism/bash";
import css from "react-syntax-highlighter/dist/esm/languages/prism/css";

SyntaxHighlighter.registerLanguage("typescript", ts);
SyntaxHighlighter.registerLanguage("tsx", tsx);
SyntaxHighlighter.registerLanguage("javascript", js);
SyntaxHighlighter.registerLanguage("jsx", jsx);
SyntaxHighlighter.registerLanguage("rust", rust);
SyntaxHighlighter.registerLanguage("python", python);
SyntaxHighlighter.registerLanguage("json", json);
SyntaxHighlighter.registerLanguage("yaml", yaml);
SyntaxHighlighter.registerLanguage("toml", toml);
SyntaxHighlighter.registerLanguage("markdown", markdown);
SyntaxHighlighter.registerLanguage("bash", bash);
SyntaxHighlighter.registerLanguage("css", css);

interface FileEntry {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
}

interface TreeNode extends FileEntry {
  children?: TreeNode[];
  expanded?: boolean;
}

interface Props {
  initialPath: string;
  onClose: () => void;
}

// ── Language detection from extension ────────────────────────────────────────

const EXT_LANG: Record<string, string> = {
  ts: "typescript", tsx: "tsx",
  js: "javascript", jsx: "jsx",
  rs: "rust",
  py: "python",
  json: "json",
  yaml: "yaml", yml: "yaml",
  toml: "toml",
  md: "markdown", mdx: "markdown",
  sh: "bash", zsh: "bash",
  css: "css", scss: "css",
};

const TEXT_EXTENSIONS = new Set([
  "ts", "tsx", "js", "jsx", "rs", "py", "json", "yaml", "yml",
  "toml", "md", "mdx", "sh", "zsh", "bash", "css", "scss",
  "html", "htm", "xml", "txt", "env", "gitignore", "lock",
  "Makefile", "Dockerfile", "sql", "graphql", "gql",
]);

function getExt(name: string): string {
  const parts = name.split(".");
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : name;
}

function isTextFile(name: string): boolean {
  return TEXT_EXTENSIONS.has(getExt(name));
}

function getLang(name: string): string {
  return EXT_LANG[getExt(name)] ?? "text";
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toDisplayPath(absPath: string): string {
  const parts = absPath.split("/");
  const home = parts.slice(0, 3).join("/");
  return absPath.startsWith(home) ? absPath.replace(home, "~") : absPath;
}

function parentPath(p: string): string {
  return p.split("/").slice(0, -1).join("/") || "/";
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function FileTreePanel({ initialPath, onClose }: Props) {
  const [currentPath, setCurrentPath] = useState(initialPath);
  const [nodes, setNodes] = useState<TreeNode[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [loadingDir, setLoadingDir] = useState<string | null>(null);
  const [loadingFile, setLoadingFile] = useState(false);

  const loadDir = useCallback(async (path: string) => {
    setLoadingDir(path);
    try {
      const entries = await invoke<FileEntry[]>("list_dir", { path });
      setNodes(entries.map((e) => ({ ...e })));
      setCurrentPath(path);
      setSelectedPath(null);
      setFileContent(null);
      setPreviewError(null);
    } catch (e) {
      setPreviewError(String(e));
    } finally {
      setLoadingDir(null);
    }
  }, []);

  useEffect(() => {
    if (initialPath) {
      loadDir(initialPath);
    } else {
      invoke<string>("get_home_dir").then((home) => loadDir(home));
    }
  }, [initialPath]);

  async function toggleDir(node: TreeNode) {
    if (!node.is_dir) return;
    if (node.expanded) {
      setNodes((prev) => collapseNode(prev, node.path));
      return;
    }
    setLoadingDir(node.path);
    try {
      const children = await invoke<FileEntry[]>("list_dir", { path: node.path });
      setNodes((prev) =>
        expandNode(prev, node.path, children.map((e) => ({ ...e })))
      );
    } catch {
      // ignore
    } finally {
      setLoadingDir(null);
    }
  }

  async function selectFile(node: TreeNode) {
    setSelectedPath(node.path);
    setFileContent(null);
    setPreviewError(null);

    if (!isTextFile(node.name)) {
      setPreviewError("binary");
      return;
    }
    setLoadingFile(true);
    try {
      const content = await invoke<string>("read_text_file", { path: node.path });
      setFileContent(content);
    } catch (e) {
      setPreviewError(String(e));
    } finally {
      setLoadingFile(false);
    }
  }

  async function openWithSystem(path: string) {
    try {
      await open(path);
    } catch (e) {
      console.error("open failed:", e);
    }
  }

  const displayPath = toDisplayPath(currentPath);
  const canGoUp = currentPath !== "/" && currentPath !== "";

  return (
    <div style={panelStyle}>
      {/* ── Header ── */}
      <div style={headerStyle}>
        <button
          onClick={() => canGoUp && loadDir(parentPath(currentPath))}
          disabled={!canGoUp}
          title="上级目录"
          style={{ ...iconBtn, opacity: canGoUp ? 0.8 : 0.3 }}
        >
          ←
        </button>
        <span
          title={currentPath}
          style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "12px", opacity: 0.7 }}
        >
          {displayPath}
        </span>
        <button onClick={onClose} style={{ ...iconBtn, opacity: 0.6 }}>✕</button>
      </div>

      {/* ── Body: tree + preview ── */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* File tree */}
        <div style={treeColStyle}>
          {nodes.length === 0 && loadingDir === currentPath && (
            <div style={emptyStyle}>加载中…</div>
          )}
          {nodes.length === 0 && loadingDir !== currentPath && (
            <div style={emptyStyle}>空目录</div>
          )}
          {nodes.map((node) => (
            <TreeRow
              key={node.path}
              node={node}
              selected={selectedPath === node.path}
              loading={loadingDir === node.path}
              onToggleDir={toggleDir}
              onSelectFile={selectFile}
              depth={0}
            />
          ))}
        </div>

        {/* Divider */}
        <div style={{ width: "1px", background: "var(--border)", flexShrink: 0 }} />

        {/* Preview pane */}
        <div style={previewColStyle}>
          {!selectedPath && (
            <div style={emptyStyle}>点击文件预览内容</div>
          )}
          {selectedPath && loadingFile && (
            <div style={emptyStyle}>读取中…</div>
          )}
          {selectedPath && previewError === "binary" && (
            <BinaryPrompt path={selectedPath} onOpen={openWithSystem} />
          )}
          {selectedPath && previewError && previewError !== "binary" && (
            <div style={{ ...emptyStyle, color: "var(--error, #e06c6c)" }}>
              {previewError}
              <button
                onClick={() => openWithSystem(selectedPath)}
                style={{ ...actionBtn, marginTop: "12px" }}
              >
                用系统应用打开
              </button>
            </div>
          )}
          {fileContent !== null && !previewError && (
            <FilePreview
              path={selectedPath!}
              content={fileContent}
              onOpenSystem={() => openWithSystem(selectedPath!)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ── TreeRow ───────────────────────────────────────────────────────────────────

function TreeRow({
  node, selected, loading, onToggleDir, onSelectFile, depth,
}: {
  node: TreeNode;
  selected: boolean;
  loading: boolean;
  onToggleDir: (n: TreeNode) => void;
  onSelectFile: (n: TreeNode) => void;
  depth: number;
}) {
  function handleClick() {
    if (node.is_dir) onToggleDir(node);
    else onSelectFile(node);
  }

  return (
    <>
      <button
        onClick={handleClick}
        title={node.path}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "5px",
          width: "100%",
          background: selected ? "var(--accent-bg, rgba(192,122,90,0.15))" : "none",
          border: "none",
          borderRadius: "4px",
          padding: `3px 8px 3px ${8 + depth * 14}px`,
          cursor: "pointer",
          color: selected ? "var(--text-primary, #eee)" : "var(--text-secondary, #aaa)",
          fontSize: "12px",
          textAlign: "left",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          flexShrink: 0,
        }}
      >
        <span style={{ flexShrink: 0, fontSize: "11px", opacity: 0.7 }}>
          {node.is_dir
            ? (loading ? "⟳" : node.expanded ? "▾" : "▸")
            : fileIcon(node.name)}
        </span>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
          {node.name}
        </span>
      </button>
      {node.expanded && node.children?.map((child) => (
        <TreeRow
          key={child.path}
          node={child}
          selected={selected && child.path === node.path}
          loading={loading}
          onToggleDir={onToggleDir}
          onSelectFile={onSelectFile}
          depth={depth + 1}
        />
      ))}
    </>
  );
}

// ── FilePreview ───────────────────────────────────────────────────────────────

function FilePreview({ path, content, onOpenSystem }: {
  path: string;
  content: string;
  onOpenSystem: () => void;
}) {
  const name = path.split("/").slice(-1)[0] ?? "";
  const lang = getLang(name);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Preview header */}
      <div style={{
        display: "flex", alignItems: "center", gap: "8px",
        padding: "6px 12px",
        borderBottom: "1px solid var(--border)",
        fontSize: "11px",
        flexShrink: 0,
      }}>
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", opacity: 0.7 }}>
          {name}
        </span>
        <span style={{
          background: "var(--bg-secondary, rgba(255,255,255,0.06))",
          borderRadius: "3px",
          padding: "1px 5px",
          opacity: 0.6,
          flexShrink: 0,
        }}>
          {lang}
        </span>
        <button onClick={onOpenSystem} title="用系统应用打开" style={iconBtn}>↗</button>
      </div>

      {/* Code */}
      <div style={{ flex: 1, overflow: "auto" }}>
        <SyntaxHighlighter
          language={lang}
          style={vscDarkPlus}
          showLineNumbers
          customStyle={{
            margin: 0,
            padding: "12px",
            background: "transparent",
            fontSize: "11.5px",
            lineHeight: "1.6",
            minHeight: "100%",
          }}
          lineNumberStyle={{ opacity: 0.3, userSelect: "none", minWidth: "2.5em" }}
        >
          {content}
        </SyntaxHighlighter>
      </div>
    </div>
  );
}

// ── BinaryPrompt ──────────────────────────────────────────────────────────────

function BinaryPrompt({ path, onOpen }: { path: string; onOpen: (p: string) => void }) {
  const name = path.split("/").slice(-1)[0] ?? "";
  return (
    <div style={{ ...emptyStyle, gap: "12px" }}>
      <span style={{ fontSize: "28px", opacity: 0.4 }}>📄</span>
      <span style={{ fontSize: "12px", opacity: 0.6 }}>{name}</span>
      <span style={{ fontSize: "11px", opacity: 0.4 }}>无法预览此文件类型</span>
      <button onClick={() => onOpen(path)} style={actionBtn}>用系统应用打开</button>
    </div>
  );
}

// ── Tree state helpers ────────────────────────────────────────────────────────

function expandNode(nodes: TreeNode[], targetPath: string, children: TreeNode[]): TreeNode[] {
  return nodes.map((n) => {
    if (n.path === targetPath) return { ...n, expanded: true, children };
    if (n.children) return { ...n, children: expandNode(n.children, targetPath, children) };
    return n;
  });
}

function collapseNode(nodes: TreeNode[], targetPath: string): TreeNode[] {
  return nodes.map((n) => {
    if (n.path === targetPath) return { ...n, expanded: false, children: undefined };
    if (n.children) return { ...n, children: collapseNode(n.children, targetPath) };
    return n;
  });
}

// ── File icon by extension ────────────────────────────────────────────────────

function fileIcon(name: string): string {
  const ext = getExt(name);
  if (["ts", "tsx"].includes(ext)) return "𝘛";
  if (["js", "jsx"].includes(ext)) return "𝘑";
  if (ext === "rs") return "𝗥";
  if (ext === "py") return "𝗣";
  if (ext === "json") return "{ }";
  if (["md", "mdx"].includes(ext)) return "𝗠";
  if (["yaml", "yml"].includes(ext)) return "𝗬";
  if (["sh", "zsh", "bash"].includes(ext)) return "$";
  return "·";
}

// ── Styles ────────────────────────────────────────────────────────────────────

const panelStyle: React.CSSProperties = {
  position: "fixed",
  top: 0,
  right: 0,
  bottom: 0,
  width: "640px",
  display: "flex",
  flexDirection: "column",
  background: "var(--bg-primary, #1e1e1e)",
  borderLeft: "1px solid var(--border)",
  zIndex: 100,
  boxShadow: "-4px 0 24px rgba(0,0,0,0.3)",
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  padding: "8px 12px",
  borderBottom: "1px solid var(--border)",
  flexShrink: 0,
  color: "var(--text-secondary, #aaa)",
};

const treeColStyle: React.CSSProperties = {
  width: "220px",
  flexShrink: 0,
  overflowY: "auto",
  padding: "6px 4px",
};

const previewColStyle: React.CSSProperties = {
  flex: 1,
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
};

const emptyStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  height: "100%",
  color: "var(--text-secondary, #666)",
  fontSize: "12px",
  gap: "6px",
};

const iconBtn: React.CSSProperties = {
  background: "none",
  border: "none",
  cursor: "pointer",
  color: "inherit",
  fontSize: "14px",
  padding: "2px 4px",
  flexShrink: 0,
};

const actionBtn: React.CSSProperties = {
  background: "var(--accent, #c07a5a)",
  border: "none",
  borderRadius: "6px",
  color: "#fff",
  fontSize: "12px",
  padding: "6px 14px",
  cursor: "pointer",
};
