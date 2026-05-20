import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { PrismLight as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import fileSvg from "material-icon-theme/icons/file.svg?url";
import folderSvg from "material-icon-theme/icons/folder.svg?url";
import folderOpenSvg from "material-icon-theme/icons/folder-open.svg?url";
import folderConfigSvg from "material-icon-theme/icons/folder-config.svg?url";
import folderConfigOpenSvg from "material-icon-theme/icons/folder-config-open.svg?url";
import folderDistSvg from "material-icon-theme/icons/folder-dist.svg?url";
import folderDistOpenSvg from "material-icon-theme/icons/folder-dist-open.svg?url";
import folderDocsSvg from "material-icon-theme/icons/folder-docs.svg?url";
import folderDocsOpenSvg from "material-icon-theme/icons/folder-docs-open.svg?url";
import folderGithubSvg from "material-icon-theme/icons/folder-github.svg?url";
import folderGithubOpenSvg from "material-icon-theme/icons/folder-github-open.svg?url";
import folderNodeSvg from "material-icon-theme/icons/folder-node.svg?url";
import folderNodeOpenSvg from "material-icon-theme/icons/folder-node-open.svg?url";
import folderPublicSvg from "material-icon-theme/icons/folder-public.svg?url";
import folderPublicOpenSvg from "material-icon-theme/icons/folder-public-open.svg?url";
import folderScriptsSvg from "material-icon-theme/icons/folder-scripts.svg?url";
import folderScriptsOpenSvg from "material-icon-theme/icons/folder-scripts-open.svg?url";
import folderSrcTauriSvg from "material-icon-theme/icons/folder-src-tauri.svg?url";
import folderSrcTauriOpenSvg from "material-icon-theme/icons/folder-src-tauri-open.svg?url";
import folderTargetSvg from "material-icon-theme/icons/folder-target.svg?url";
import folderTargetOpenSvg from "material-icon-theme/icons/folder-target-open.svg?url";
import folderTestSvg from "material-icon-theme/icons/folder-test.svg?url";
import folderTestOpenSvg from "material-icon-theme/icons/folder-test-open.svg?url";
import folderUiSvg from "material-icon-theme/icons/folder-ui.svg?url";
import folderUiOpenSvg from "material-icon-theme/icons/folder-ui-open.svg?url";
import folderVscodeSvg from "material-icon-theme/icons/folder-vscode.svg?url";
import folderVscodeOpenSvg from "material-icon-theme/icons/folder-vscode-open.svg?url";
import bashSvg from "material-icon-theme/icons/console.svg?url";
import cssSvg from "material-icon-theme/icons/css.svg?url";
import gitSvg from "material-icon-theme/icons/git.svg?url";
import htmlSvg from "material-icon-theme/icons/html.svg?url";
import imageSvg from "material-icon-theme/icons/image.svg?url";
import jsSvg from "material-icon-theme/icons/javascript.svg?url";
import jsonSvg from "material-icon-theme/icons/json.svg?url";
import licenseSvg from "material-icon-theme/icons/license.svg?url";
import lockSvg from "material-icon-theme/icons/lock.svg?url";
import markdownSvg from "material-icon-theme/icons/markdown.svg?url";
import npmSvg from "material-icon-theme/icons/npm.svg?url";
import pdfSvg from "material-icon-theme/icons/pdf.svg?url";
import pnpmSvg from "material-icon-theme/icons/pnpm.svg?url";
import pythonSvg from "material-icon-theme/icons/python.svg?url";
import reactSvg from "material-icon-theme/icons/react.svg?url";
import reactTsSvg from "material-icon-theme/icons/react_ts.svg?url";
import rustSvg from "material-icon-theme/icons/rust.svg?url";
import sassSvg from "material-icon-theme/icons/sass.svg?url";
import tauriSvg from "material-icon-theme/icons/tauri.svg?url";
import tomlSvg from "material-icon-theme/icons/toml.svg?url";
import tsSvg from "material-icon-theme/icons/typescript.svg?url";
import xmlSvg from "material-icon-theme/icons/xml.svg?url";
import yamlSvg from "material-icon-theme/icons/yaml.svg?url";
import zipSvg from "material-icon-theme/icons/zip.svg?url";

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
import java from "react-syntax-highlighter/dist/esm/languages/prism/java";
import kotlin from "react-syntax-highlighter/dist/esm/languages/prism/kotlin";
import swift from "react-syntax-highlighter/dist/esm/languages/prism/swift";
import go from "react-syntax-highlighter/dist/esm/languages/prism/go";
import ruby from "react-syntax-highlighter/dist/esm/languages/prism/ruby";
import cpp from "react-syntax-highlighter/dist/esm/languages/prism/cpp";
import csharp from "react-syntax-highlighter/dist/esm/languages/prism/csharp";
import php from "react-syntax-highlighter/dist/esm/languages/prism/php";
import scala from "react-syntax-highlighter/dist/esm/languages/prism/scala";
import lua from "react-syntax-highlighter/dist/esm/languages/prism/lua";
import powershell from "react-syntax-highlighter/dist/esm/languages/prism/powershell";
import batch from "react-syntax-highlighter/dist/esm/languages/prism/batch";
import docker from "react-syntax-highlighter/dist/esm/languages/prism/docker";
import groovy from "react-syntax-highlighter/dist/esm/languages/prism/groovy";
import sql from "react-syntax-highlighter/dist/esm/languages/prism/sql";

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
SyntaxHighlighter.registerLanguage("java", java);
SyntaxHighlighter.registerLanguage("kotlin", kotlin);
SyntaxHighlighter.registerLanguage("swift", swift);
SyntaxHighlighter.registerLanguage("go", go);
SyntaxHighlighter.registerLanguage("ruby", ruby);
SyntaxHighlighter.registerLanguage("cpp", cpp);
SyntaxHighlighter.registerLanguage("csharp", csharp);
SyntaxHighlighter.registerLanguage("php", php);
SyntaxHighlighter.registerLanguage("scala", scala);
SyntaxHighlighter.registerLanguage("lua", lua);
SyntaxHighlighter.registerLanguage("powershell", powershell);
SyntaxHighlighter.registerLanguage("batch", batch);
SyntaxHighlighter.registerLanguage("docker", docker);
SyntaxHighlighter.registerLanguage("groovy", groovy);
SyntaxHighlighter.registerLanguage("sql", sql);

// ── Types ─────────────────────────────────────────────────────────────────────

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
  onAddToChat?: (text: string) => void;
}

// ── Language / text detection ─────────────────────────────────────────────────

const EXT_LANG: Record<string, string> = {
  ts: "typescript", tsx: "tsx",
  js: "javascript", jsx: "jsx",
  rs: "rust",
  py: "python",
  json: "json",
  yaml: "yaml", yml: "yaml",
  toml: "toml",
  md: "markdown", mdx: "markdown",
  sh: "bash", zsh: "bash", bash: "bash",
  css: "css", scss: "css",
  java: "java",
  kt: "kotlin", kts: "kotlin",
  swift: "swift",
  go: "go",
  rb: "ruby",
  cpp: "cpp", cc: "cpp", cxx: "cpp", h: "cpp", hpp: "cpp",
  cs: "csharp",
  php: "php",
  scala: "scala",
  lua: "lua",
  ps1: "powershell", psm1: "powershell", psd1: "powershell",
  cmd: "batch", bat: "batch",
  groovy: "groovy", gradle: "groovy",
  sql: "sql",
};

const TEXT_EXTENSIONS = new Set([
  "ts", "tsx", "js", "jsx", "rs", "py", "json", "yaml", "yml",
  "toml", "md", "mdx", "sh", "zsh", "bash", "css", "scss",
  "html", "htm", "xml", "txt", "env", "lock", "sql", "graphql", "gql",
  "gitignore", "gitattributes", "editorconfig", "prettierrc", "eslintrc",
  "java", "kt", "kts", "swift", "go", "rb",
  "cpp", "cc", "cxx", "h", "hpp", "cs", "php", "scala", "lua",
  "ps1", "psm1", "psd1", "cmd", "bat",
  "groovy", "gradle",
  "makefile", "cmake", "dockerfile",
  "vue", "svelte", "astro",
  "ini", "cfg", "conf", "properties",
  "tf", "tfvars",
]);

function getExt(name: string): string {
  // handle dotfiles like .gitignore
  if (name.startsWith(".") && !name.slice(1).includes(".")) return name.slice(1);
  const parts = name.split(".");
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : "";
}

const SPECIAL_FILENAMES = new Set([
  "dockerfile", "makefile", "gemfile", "rakefile", "procfile",
  "vagrantfile", "jenkinsfile",
]);

function isTextFile(name: string): boolean {
  if (SPECIAL_FILENAMES.has(name.toLowerCase())) return true;
  return TEXT_EXTENSIONS.has(getExt(name));
}

function getLang(name: string): string {
  const lower = name.toLowerCase();
  if (lower === "dockerfile") return "docker";
  if (lower === "makefile" || lower === "cmake") return "bash";
  return EXT_LANG[getExt(name)] ?? "text";
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toDisplayPath(absPath: string): string {
  const parts = absPath.split("/");
  if (parts.length >= 3 && parts[1] === "Users") {
    return "~/" + parts.slice(3).join("/");
  }
  return absPath;
}

function parentPath(p: string): string {
  const parts = p.split("/").filter(Boolean);
  if (parts.length === 0) return "/";
  return "/" + parts.slice(0, -1).join("/");
}

function lastName(p: string): string {
  const parts = p.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? p;
}

async function openWithSystem(path: string) {
  try {
    await invoke("open_path", { path });
  } catch (e) {
    console.error("open_path failed:", e);
  }
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

// ── Main component ────────────────────────────────────────────────────────────

export default function FileTreePanel({ initialPath, onClose, onAddToChat }: Props) {
  const [currentPath, setCurrentPath] = useState(initialPath);
  const [nodes, setNodes] = useState<TreeNode[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
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
      setSelectedFile(null);
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

  // Toggle expand/collapse in-tree (triangle click)
  async function handleToggle(node: TreeNode) {
    if (node.expanded) {
      setNodes((prev) => collapseNode(prev, node.path));
      return;
    }
    setLoadingDir(node.path);
    try {
      const children = await invoke<FileEntry[]>("list_dir", { path: node.path });
      setNodes((prev) => expandNode(prev, node.path, children.map((e) => ({ ...e }))));
    } catch {
      // ignore
    } finally {
      setLoadingDir(null);
    }
  }

  // Navigate into directory (name click)
  function handleNavigate(node: TreeNode) {
    loadDir(node.path);
  }

  // Select file for preview (name click)
  async function handleSelectFile(node: TreeNode) {
    setSelectedFile(node.path);
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

  const canGoUp = currentPath !== "/" && currentPath.split("/").filter(Boolean).length > 0;

  return (
    <div style={panelStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <button
          onClick={() => canGoUp && loadDir(parentPath(currentPath))}
          disabled={!canGoUp}
          title="上级目录"
          style={{ ...iconBtn, opacity: canGoUp ? 0.75 : 0.25 }}
        >
          ←
        </button>
        <span
          title={currentPath}
          style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "var(--file-tree-font-size, 12px)", opacity: 0.65 }}
        >
          {toDisplayPath(currentPath)}
        </span>
        <CopyPathButton path={currentPath} />
        <button onClick={onClose} title="关闭" style={{ ...iconBtn, opacity: 0.5 }}>✕</button>
      </div>

      {/* Body */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Tree column */}
        <div style={treeColStyle}>
          {loadingDir === currentPath && nodes.length === 0 && (
            <div style={emptyHint}>加载中…</div>
          )}
          {loadingDir !== currentPath && nodes.length === 0 && (
            <div style={emptyHint}>空目录</div>
          )}
          {nodes.map((node) => (
            <TreeRow
              key={node.path}
              node={node}
              selected={selectedFile === node.path}
              loading={loadingDir === node.path}
              depth={0}
              onToggle={handleToggle}
              onNavigate={handleNavigate}
              onSelectFile={handleSelectFile}
              selectedFile={selectedFile}
              loadingDir={loadingDir}
            />
          ))}
        </div>

        <div style={{ width: "1px", background: "var(--border)", flexShrink: 0 }} />

        {/* Preview column */}
        <div style={previewColStyle}>
          {!selectedFile && <div style={emptyHint}>点击文件预览内容</div>}
          {selectedFile && loadingFile && <div style={emptyHint}>读取中…</div>}
          {selectedFile && previewError === "binary" && (
            <BinaryPrompt path={selectedFile} onOpen={openWithSystem} />
          )}
          {selectedFile && previewError && previewError !== "binary" && (
            <div style={{ ...emptyHint, flexDirection: "column", gap: "10px" }}>
              <span style={{ color: "var(--error, #e06c6c)", fontSize: "12px" }}>{previewError}</span>
              <button onClick={() => openWithSystem(selectedFile)} style={actionBtn}>
                用系统应用打开
              </button>
            </div>
          )}
          {fileContent !== null && !previewError && (
            <FilePreview
              path={selectedFile!}
              content={fileContent}
              onOpenSystem={() => openWithSystem(selectedFile!)}
              onAddToChat={onAddToChat}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ── TreeRow ───────────────────────────────────────────────────────────────────

function TreeRow({
  node, selected, loading, depth,
  onToggle, onNavigate, onSelectFile,
  selectedFile, loadingDir,
}: {
  node: TreeNode;
  selected: boolean;
  loading: boolean;
  depth: number;
  onToggle: (n: TreeNode) => void;
  onNavigate: (n: TreeNode) => void;
  onSelectFile: (n: TreeNode) => void;
  selectedFile: string | null;
  loadingDir: string | null;
}) {
  const isExpanded = !!node.expanded;

  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          paddingLeft: `${8 + depth * 14}px`,
          paddingRight: "6px",
          borderRadius: "4px",
          background: node.is_dir && isExpanded
            ? "var(--bg-expanded, rgba(255,255,255,0.06))"
            : selected
            ? "var(--accent-bg, rgba(192,122,90,0.15))"
            : "transparent",
          marginBottom: "1px",
        }}
      >
        {/* Triangle / expand toggle (dirs only) */}
        {node.is_dir ? (
          <button
            onClick={() => onToggle(node)}
            title={isExpanded ? "折叠" : "展开"}
            style={{
              ...iconBtn,
              fontSize: "11px",
              width: "16px",
              flexShrink: 0,
              opacity: 1,
              color: isExpanded ? "var(--accent, #c07a5a)" : "var(--text-primary, #ccc)",
            }}
          >
            {loading ? "⟳" : isExpanded ? "▾" : "▸"}
          </button>
        ) : (
          <span style={{ width: "16px", flexShrink: 0 }} />
        )}

        {/* Folder / file icon */}
        <FileTypeIcon
          src={node.is_dir ? getFolderIcon(node.name, isExpanded) : getFileIcon(node.name)}
          label={node.is_dir ? "folder" : "file"}
        />

        {/* Name — click to navigate (dir) or select (file) */}
        <button
          onClick={() => node.is_dir ? onNavigate(node) : onSelectFile(node)}
          title={node.path}
          style={{
            flex: 1,
            background: "none",
            border: "none",
            padding: "4px 0",
            cursor: "pointer",
            color: selected
              ? "var(--text-primary, #eee)"
              : node.is_dir && isExpanded
              ? "var(--text-primary, #ddd)"
              : "var(--text-secondary, #aaa)",
            fontWeight: node.is_dir && isExpanded ? 600 : 400,
            fontSize: "var(--file-tree-font-size, 12px)",
            textAlign: "left",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {node.name}
        </button>
      </div>

      {/* Children (expanded) */}
      {isExpanded && node.children?.map((child) => (
        <TreeRow
          key={child.path}
          node={child}
          selected={selectedFile === child.path}
          loading={loadingDir === child.path}
          depth={depth + 1}
          onToggle={onToggle}
          onNavigate={onNavigate}
          onSelectFile={onSelectFile}
          selectedFile={selectedFile}
          loadingDir={loadingDir}
        />
      ))}
    </>
  );
}

// ── CopyPathButton ────────────────────────────────────────────────────────────

function CopyPathButton({ path, variant = "inline" }: { path: string; variant?: "inline" | "block" }) {
  const [copied, setCopied] = useState(false);
  function handleCopy() {
    navigator.clipboard.writeText(path).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  if (variant === "block") {
    return (
      <button onClick={handleCopy} style={{
        ...actionBtn,
        background: copied ? "var(--accent, #c07a5a)" : "var(--bg-secondary, rgba(255,255,255,0.08))",
        color: copied ? "#fff" : "var(--text-secondary, #aaa)",
        border: "1px solid var(--border)",
      }}>
        {copied ? "✓ 已复制" : "复制路径"}
      </button>
    );
  }

  return (
    <button onClick={handleCopy} style={{
      background: copied ? "var(--accent, #c07a5a)" : "var(--bg-secondary, rgba(255,255,255,0.08))",
      border: "1px solid var(--border)",
      borderRadius: "4px",
      color: copied ? "#fff" : "var(--text-secondary, #aaa)",
      fontSize: "11px",
      padding: "2px 8px",
      cursor: "pointer",
      flexShrink: 0,
      whiteSpace: "nowrap",
      transition: "background 0.15s",
    }}>
      {copied ? "✓ 已复制" : "复制路径"}
    </button>
  );
}

// ── EditWithEditorButton ──────────────────────────────────────────────────────

const EDITOR_ALIASES: Record<string, string> = {
  vscode: "code", "vs code": "code", "vs-code": "code", visual: "code",
  zed: "zed", nvim: "nvim", neovim: "nvim",
};
const EDITOR_PRESETS = [
  { label: "VS Code", cmd: "code" },
  { label: "Cursor", cmd: "cursor" },
  { label: "Zed", cmd: "zed" },
  { label: "Vim", cmd: "vim" },
];

function normalizeEditor(raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  return EDITOR_ALIASES[trimmed] ?? (raw.trim() || "code");
}

function loadEditor(): string {
  return normalizeEditor(localStorage.getItem("hermes_editor") ?? "code");
}

function EditWithEditorButton({ path }: { path: string }) {
  const [editor, setEditor] = useState(loadEditor);
  const [configuring, setConfiguring] = useState(false);
  const [input, setInput] = useState(editor);
  const [error, setError] = useState("");

  async function handleOpen() {
    setError("");
    try {
      await invoke("open_with_editor", { path, editor });
    } catch (e) {
      setError(String(e));
      setConfiguring(true);
    }
  }

  function saveEditor(val?: string) {
    const cmd = normalizeEditor(val ?? input);
    setEditor(cmd);
    setInput(cmd);
    localStorage.setItem("hermes_editor", cmd);
    setConfiguring(false);
    setError("");
  }

  if (configuring) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "4px", flexShrink: 0, alignItems: "flex-start" }}>
        <div style={{ display: "flex", gap: "4px" }}>
          {EDITOR_PRESETS.map((p) => (
            <button
              key={p.cmd}
              onClick={() => saveEditor(p.cmd)}
              title={p.cmd}
              style={{
                background: editor === p.cmd ? "var(--accent,#c07a5a)" : "var(--bg-secondary, rgba(255,255,255,0.08))",
                border: "1px solid var(--border)",
                borderRadius: "4px",
                color: editor === p.cmd ? "#fff" : "var(--text-secondary, #aaa)",
                fontSize: "10px",
                padding: "2px 6px",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") saveEditor(); if (e.key === "Escape") setConfiguring(false); }}
            placeholder="自定义命令，如 code、cursor"
            title={error || "编辑器 CLI 命令"}
            autoFocus
            style={{
              width: "140px",
              background: "var(--bg-input, rgba(0,0,0,0.2))",
              border: `1px solid ${error ? "var(--error,#e06c6c)" : "var(--accent,#c07a5a)"}`,
              borderRadius: "4px",
              color: "var(--text-primary, #eee)",
              fontSize: "11px",
              padding: "2px 5px",
              outline: "none",
            }}
          />
          <button onClick={() => saveEditor()} style={{ ...iconBtn, opacity: 0.8, fontSize: "12px" }}>✓</button>
          <button onClick={() => { setConfiguring(false); setError(""); }} style={{ ...iconBtn, opacity: 0.5, fontSize: "12px" }}>✕</button>
        </div>
        {error && <span style={{ fontSize: "10px", color: "var(--error,#e06c6c)", maxWidth: "200px" }}>{error}</span>}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "2px", flexShrink: 0 }}>
      <button
        onClick={handleOpen}
        title={`用 ${editor} 打开`}
        style={{
          background: "var(--bg-secondary, rgba(255,255,255,0.08))",
          border: "1px solid var(--border)",
          borderRadius: "4px 0 0 4px",
          color: "var(--text-secondary, #aaa)",
          fontSize: "11px",
          padding: "2px 7px",
          cursor: "pointer",
          whiteSpace: "nowrap",
          borderRight: "none",
        }}
      >
        编辑
      </button>
      <button
        onClick={() => { setInput(editor); setConfiguring(true); }}
        title={`当前编辑器：${editor}，点击修改`}
        style={{
          background: "var(--bg-secondary, rgba(255,255,255,0.08))",
          border: "1px solid var(--border)",
          borderRadius: "0 4px 4px 0",
          color: "var(--text-secondary, #777)",
          fontSize: "10px",
          padding: "2px 4px",
          cursor: "pointer",
          fontFamily: "monospace",
        }}
      >
        {editor}
      </button>
    </div>
  );
}

// ── FilePreview ───────────────────────────────────────────────────────────────

function FilePreview({ path, content, onOpenSystem, onAddToChat }: {
  path: string;
  content: string;
  onOpenSystem: () => void;
  onAddToChat?: (text: string) => void;
}) {
  const name = lastName(path);
  const lang = getLang(name);
  const contentLines = content.split("\n");
  const previewRef = useRef<HTMLDivElement>(null);
  const [wordWrap, setWordWrap] = useState(() => localStorage.getItem("hermes_file_preview_word_wrap") === "true");
  const [selectionAction, setSelectionAction] = useState<{
    startLine: number;
    endLine: number;
    x: number;
    y: number;
  } | null>(null);

  function toggleWordWrap() {
    setWordWrap((prev) => {
      const next = !prev;
      localStorage.setItem("hermes_file_preview_word_wrap", String(next));
      return next;
    });
  }

  function updateSelectionAction() {
    if (!onAddToChat) return;
    const root = previewRef.current;
    const selection = window.getSelection();
    if (!root || !selection || selection.rangeCount === 0 || selection.isCollapsed) {
      setSelectionAction(null);
      return;
    }

    const range = selection.getRangeAt(0);
    if (!root.contains(range.commonAncestorContainer)) {
      setSelectionAction(null);
      return;
    }

    const text = selection.toString().trim();
    if (!text) {
      setSelectionAction(null);
      return;
    }

    const lines = getSelectedLineNumbers(root, range);
    if (!lines) {
      setSelectionAction(null);
      return;
    }

    const rect = range.getBoundingClientRect();
    const rootRect = root.getBoundingClientRect();
    setSelectionAction({
      startLine: lines.startLine,
      endLine: lines.endLine,
      x: root.scrollLeft + Math.min(Math.max(rect.left - rootRect.left, 8), Math.max(rootRect.width - 150, 8)),
      y: Math.max(rect.top - rootRect.top - 34 + root.scrollTop, 8),
    });
  }

  function addSelectionToChat() {
    if (!selectionAction || !onAddToChat) return;
    const lineRange = selectionAction.startLine === selectionAction.endLine
      ? `${selectionAction.startLine}`
      : `${selectionAction.startLine}-${selectionAction.endLine}`;
    const selectedText = getSelectedSourceText(contentLines, selectionAction.startLine, selectionAction.endLine);
    onAddToChat(`@${path},${lineRange}\n“${selectedText}”`);
    window.getSelection()?.removeAllRanges();
    setSelectionAction(null);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <div style={{
        display: "flex", alignItems: "center", gap: "6px",
        padding: "6px 10px",
        borderBottom: "1px solid var(--border)",
        fontSize: "11px",
        flexShrink: 0,
        color: "var(--text-secondary, #aaa)",
      }}>
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {name}
        </span>
        <button
          onClick={toggleWordWrap}
          title={wordWrap ? "关闭自动换行" : "开启自动换行"}
          aria-pressed={wordWrap}
          style={{
            ...previewIconBtn,
            background: wordWrap ? "rgba(192,122,90,0.18)" : "var(--bg-secondary, rgba(255,255,255,0.06))",
            color: wordWrap ? "var(--accent, #c07a5a)" : "var(--text-secondary, #777)",
            borderColor: wordWrap ? "rgba(192,122,90,0.45)" : "var(--border)",
          }}
        >
          <WrapTextIcon size={13} />
        </button>
        <span style={{
          background: "var(--bg-secondary, rgba(255,255,255,0.06))",
          borderRadius: "3px",
          padding: "1px 5px",
          opacity: 0.6,
          flexShrink: 0,
          fontFamily: "monospace",
        }}>
          {lang}
        </span>
        <EditWithEditorButton path={path} />
        <CopyPathButton path={path} />
        <button onClick={onOpenSystem} title="用系统应用打开" style={{ ...iconBtn, opacity: 0.6 }}>↗</button>
      </div>

      <div
        ref={previewRef}
        onMouseUp={updateSelectionAction}
        onKeyUp={updateSelectionAction}
        onScroll={() => setSelectionAction(null)}
        style={{ flex: 1, overflow: "auto", position: "relative" }}
      >
        {selectionAction && (
          <div
            style={{
              position: "absolute",
              left: `${selectionAction.x}px`,
              top: `${selectionAction.y}px`,
              zIndex: 3,
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "4px",
              background: "var(--bg-primary, #1e1e1e)",
              border: "1px solid var(--border)",
              borderRadius: "6px",
              boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
            }}
          >
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={addSelectionToChat}
              style={{
                ...actionBtn,
                borderRadius: "4px",
                fontSize: "11px",
                padding: "4px 8px",
                whiteSpace: "nowrap",
              }}
            >
              添加到对话
            </button>
          </div>
        )}
        <SyntaxHighlighter
          language={lang === "text" ? "bash" : lang}
          style={vscDarkPlus}
          showLineNumbers
          wrapLines
          wrapLongLines={false}
          codeTagProps={{
            style: {
              whiteSpace: wordWrap ? "pre-wrap" : "pre",
              wordBreak: "normal",
              overflowWrap: wordWrap ? "break-word" : "normal",
              textAlign: "left",
            },
          }}
          lineProps={(lineNumber) => {
            const indentColumns = wordWrap ? getLeadingColumns(contentLines[lineNumber - 1] ?? "") : 0;
            return {
              "data-preview-line": lineNumber,
              style: {
                display: "block",
                paddingLeft: indentColumns ? `${indentColumns}ch` : undefined,
                textIndent: indentColumns ? `-${indentColumns}ch` : undefined,
                whiteSpace: wordWrap ? "pre-wrap" : "pre",
                wordBreak: "normal",
                overflowWrap: wordWrap ? "break-word" : "normal",
                textAlign: "left",
              },
            };
          }}
          customStyle={{
            margin: 0,
            padding: "12px 8px",
            background: "transparent",
            fontSize: "var(--file-tree-font-size, 11.5px)",
            lineHeight: "1.6",
          }}
          lineNumberStyle={{ opacity: 0.3, userSelect: "none", minWidth: "2.5em" }}
        >
          {content}
        </SyntaxHighlighter>
      </div>
    </div>
  );
}

function WrapTextIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M4 6h16" />
      <path d="M4 11h11a3 3 0 0 1 0 6H9" />
      <path d="m11 14-3 3 3 3" />
      <path d="M4 21h9" />
    </svg>
  );
}

function getLeadingColumns(line: string): number {
  let columns = 0;
  for (const char of line) {
    if (char === " ") {
      columns += 1;
      continue;
    }
    if (char === "\t") {
      columns += 2;
      continue;
    }
    break;
  }
  return columns;
}

function getSelectedLineNumbers(root: HTMLElement, range: Range): { startLine: number; endLine: number } | null {
  const lineEls = Array.from(root.querySelectorAll<HTMLElement>("[data-preview-line]"));
  const selected = lineEls
    .filter((el) => range.intersectsNode(el))
    .map((el) => Number(el.dataset.previewLine))
    .filter((line) => Number.isFinite(line));

  if (selected.length === 0) return null;
  return {
    startLine: Math.min(...selected),
    endLine: Math.max(...selected),
  };
}

function getSelectedSourceText(lines: string[], startLine: number, endLine: number): string {
  return lines.slice(startLine - 1, endLine).join("\n").trim();
}

// ── BinaryPrompt ──────────────────────────────────────────────────────────────

function BinaryPrompt({ path, onOpen }: { path: string; onOpen: (p: string) => void }) {
  const name = lastName(path);
  return (
    <div style={{ ...emptyHint, flexDirection: "column", gap: "10px" }}>
      <FileTypeIcon src={getFileIcon(name)} label="file" size={32} opacity={0.55} />
      <span style={{ fontSize: "12px", opacity: 0.6 }}>{name}</span>
      <span style={{ fontSize: "11px", opacity: 0.4 }}>无法预览此文件类型</span>
      <div style={{ display: "flex", gap: "8px" }}>
        <button onClick={() => onOpen(path)} style={actionBtn}>用系统应用打开</button>
        <CopyPathButton path={path} variant="block" />
      </div>
    </div>
  );
}

// ── Icon helpers ──────────────────────────────────────────────────────────────

type FolderIconPair = {
  closed: string;
  open: string;
};

const FILE_ICON_BY_NAME: Record<string, string> = {
  "cargo.lock": lockSvg,
  "cargo.toml": rustSvg,
  ".gitignore": gitSvg,
  ".gitattributes": gitSvg,
  "license": licenseSvg,
  "license.md": licenseSvg,
  "license.txt": licenseSvg,
  "package.json": npmSvg,
  "package-lock.json": npmSvg,
  "pnpm-lock.yaml": pnpmSvg,
  "pnpm-workspace.yaml": pnpmSvg,
  "tauri.conf.json": tauriSvg,
  "tsconfig.json": tsSvg,
};

const FILE_ICON_BY_EXT: Record<string, string> = {
  ts: tsSvg,
  tsx: reactTsSvg,
  js: jsSvg,
  jsx: reactSvg,
  rs: rustSvg,
  py: pythonSvg,
  json: jsonSvg,
  yaml: yamlSvg,
  yml: yamlSvg,
  toml: tomlSvg,
  md: markdownSvg,
  mdx: markdownSvg,
  sh: bashSvg,
  zsh: bashSvg,
  bash: bashSvg,
  css: cssSvg,
  scss: sassSvg,
  sass: sassSvg,
  html: htmlSvg,
  htm: htmlSvg,
  xml: xmlSvg,
  png: imageSvg,
  jpg: imageSvg,
  jpeg: imageSvg,
  gif: imageSvg,
  svg: imageSvg,
  webp: imageSvg,
  pdf: pdfSvg,
  lock: lockSvg,
  zip: zipSvg,
};

const FOLDER_ICON_BY_NAME: Record<string, FolderIconPair> = {
  ".config": { closed: folderConfigSvg, open: folderConfigOpenSvg },
  ".github": { closed: folderGithubSvg, open: folderGithubOpenSvg },
  ".vscode": { closed: folderVscodeSvg, open: folderVscodeOpenSvg },
  config: { closed: folderConfigSvg, open: folderConfigOpenSvg },
  dist: { closed: folderDistSvg, open: folderDistOpenSvg },
  docs: { closed: folderDocsSvg, open: folderDocsOpenSvg },
  node_modules: { closed: folderNodeSvg, open: folderNodeOpenSvg },
  public: { closed: folderPublicSvg, open: folderPublicOpenSvg },
  scripts: { closed: folderScriptsSvg, open: folderScriptsOpenSvg },
  src: { closed: folderScriptsSvg, open: folderScriptsOpenSvg },
  "src-tauri": { closed: folderSrcTauriSvg, open: folderSrcTauriOpenSvg },
  target: { closed: folderTargetSvg, open: folderTargetOpenSvg },
  test: { closed: folderTestSvg, open: folderTestOpenSvg },
  tests: { closed: folderTestSvg, open: folderTestOpenSvg },
  ui: { closed: folderUiSvg, open: folderUiOpenSvg },
};

function getFileIcon(name: string): string {
  return FILE_ICON_BY_NAME[name.toLowerCase()] ?? FILE_ICON_BY_EXT[getExt(name)] ?? fileSvg;
}

function getFolderIcon(name: string, open: boolean): string {
  const pair = FOLDER_ICON_BY_NAME[name.toLowerCase()];
  if (pair) return open ? pair.open : pair.closed;
  return open ? folderOpenSvg : folderSvg;
}

function FileTypeIcon({
  src,
  label,
  size = 16,
  opacity = 1,
}: {
  src: string;
  label: string;
  size?: number;
  opacity?: number;
}) {
  return (
    <img
      src={src}
      alt=""
      aria-label={label}
      draggable={false}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        marginRight: "6px",
        flexShrink: 0,
        opacity,
        objectFit: "contain",
        userSelect: "none",
      }}
    />
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const panelStyle: React.CSSProperties = {
  position: "fixed",
  top: 0, right: 0, bottom: 0,
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

const emptyHint: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  height: "100%",
  color: "var(--text-secondary, #666)",
  fontSize: "12px",
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

const previewIconBtn: React.CSSProperties = {
  width: "22px",
  height: "22px",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  border: "1px solid var(--border)",
  borderRadius: "4px",
  padding: 0,
  cursor: "pointer",
  flexShrink: 0,
  transition: "background 0.15s, border-color 0.15s, color 0.15s",
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
