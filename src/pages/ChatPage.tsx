import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { flushSync } from "react-dom";
import { useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Session, Message, StreamChunk, HermesStatus } from "../types";
import Sidebar from "../components/Sidebar";
import TopBar from "../components/topbar/TopBar";
import ChatView from "../components/ChatView";
import TerminalPanel from "../components/TerminalPanel";
import SnapshotPanel from "../components/SnapshotPanel";
import WorkingDirBar from "../components/WorkingDirBar";
import FileTreePanel from "../components/FileTreePanel";
import { getLastUserText } from "../utils/messageActions";
import { applyChunk } from "../utils/chunkReducer";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function waitForUiPaint(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame !== "function") {
      window.setTimeout(resolve, 0);
      return;
    }

    requestAnimationFrame(() => {
      window.setTimeout(resolve, 0);
    });
  });
}

// Split a text string on <think>...</think> tags (or unclosed <think>),
// appending TextBlock / ThinkBlock entries into `out` in document order.
function pushTextWithThinkTags(text: string, out: Message["blocks"]): void {
  const THINK_RE = /<think>([\s\S]*?)(?:<\/think>|$)/gi;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = THINK_RE.exec(text)) !== null) {
    const before = text.slice(last, m.index).trim();
    if (before) out.push({ type: "text", content: before });
    const thinkContent = m[1].trim();
    if (thinkContent) out.push({ type: "think", content: thinkContent });
    last = m.index + m[0].length;
  }
  const rest = text.slice(last).trim();
  if (rest) out.push({ type: "text", content: rest });
}

function parseHistoryMessages(raw: unknown): Message[] {
  let items: unknown[];
  if (Array.isArray(raw)) {
    items = raw;
  } else if (raw && typeof raw === "object" && "messages" in raw) {
    const m = (raw as Record<string, unknown>).messages;
    items = Array.isArray(m) ? m : [];
  } else {
    return [];
  }

  const messages: Message[] = [];
  // Maps tool_call_id → { msgIdx, blockIdx } for filling tool results
  const toolCallLocations = new Map<string, { msgIdx: number; blockIdx: number }>();

  for (const item of items as Record<string, unknown>[]) {
    const role = item.role as string;

    if (role === "user" || role === "assistant") {
      const content = item.content;
      const imageAttachments = Array.isArray(item.image_attachments)
        ? (item.image_attachments as unknown[]).filter((u): u is string => typeof u === "string")
        : [];

      const blocks: Message["blocks"] = [];

      if (role === "assistant") {
        // reasoning / reasoning_content: hermes persists DeepSeek/OpenAI
        // reasoning tokens here. Show as a collapsible think block first.
        const reasoning =
          typeof item.reasoning === "string" && item.reasoning.trim()
            ? item.reasoning.trim()
            : typeof item.reasoning_content === "string" && item.reasoning_content.trim()
            ? item.reasoning_content.trim()
            : null;
        if (reasoning) blocks.push({ type: "think", content: reasoning });

        // Array content: Anthropic extended-thinking format or standard content blocks.
        // Each block can be type "thinking" (native thinking), "text", or others.
        if (Array.isArray(content)) {
          for (const b of content as Record<string, unknown>[]) {
            if (b.type === "thinking" && typeof b.thinking === "string" && b.thinking.trim()) {
              blocks.push({ type: "think", content: b.thinking.trim() });
            } else if (b.type === "text" && typeof b.text === "string" && b.text.trim()) {
              pushTextWithThinkTags(b.text, blocks);
            }
          }
        } else if (typeof content === "string" && content.trim()) {
          // Plain string content may contain <think>...</think> regions (e.g. DeepSeek R1).
          pushTextWithThinkTags(content, blocks);
        }
      } else {
        // User messages: plain text only.
        let text = "";
        if (typeof content === "string") {
          text = content.trim();
        } else if (Array.isArray(content)) {
          text = (content as Record<string, unknown>[])
            .filter((b) => b.type === "text")
            .map((b) => String(b.text ?? ""))
            .join("\n")
            .trim();
        }
        if (text) blocks.push({ type: "text", content: text });
      }

      if (role === "assistant" && Array.isArray(item.tool_calls)) {
        const msgIdx = messages.length;
        for (const tc of item.tool_calls as Record<string, unknown>[]) {
          const fn = tc.function as Record<string, unknown> | undefined;
          const blockIdx = blocks.length;
          blocks.push({
            type: "tool",
            name: String(fn?.name ?? "tool"),
            input: String(fn?.arguments ?? ""),
            output: "",
            outputDone: false,
          });
          const callId = tc.id as string;
          if (callId) toolCallLocations.set(callId, { msgIdx, blockIdx });
        }
      }

      for (const dataUrl of imageAttachments) {
        blocks.push({ type: "image", dataUrl });
      }

      if (blocks.length === 0) continue;

      const timestamp =
        item.timestamp ?? item.created_at ?? item.createdAt ?? item.time ?? item.updated_at;

      messages.push({
        id: uid(),
        role: role as "user" | "assistant",
        blocks,
        timestamp: typeof timestamp === "string" ? timestamp : "",
        status: "done",
      });
    } else if (role === "tool") {
      const toolCallId = item.tool_call_id as string;
      const loc = toolCallLocations.get(toolCallId);
      if (loc) {
        const block = messages[loc.msgIdx]?.blocks[loc.blockIdx];
        if (block?.type === "tool") {
          const output = typeof item.content === "string"
            ? item.content
            : JSON.stringify(item.content);
          messages[loc.msgIdx].blocks[loc.blockIdx] = { ...block, output, outputDone: true };
        }
        toolCallLocations.delete(toolCallId);
      }
    }
  }

  return messages;
}

function formatTokenCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function parseTokenCount(s: string): number {
  const m = s.match(/^([\d.]+)([KMB]?)$/i);
  if (!m) return 0;
  const n = parseFloat(m[1]);
  switch (m[2].toUpperCase()) {
    case "K": return n * 1_000;
    case "M": return n * 1_000_000;
    default:  return n;
  }
}

function parseStatusLine(line: string): Partial<HermesStatus> | null {
  const parts = line.split(/[│|]/).map((s) => s.trim()).filter(Boolean);
  if (parts.length < 2) return null;

  const modelPart = parts[0].replace(/^[⚕⚡\s]+/, "").trim();
  const tokenPart = parts.find((p) => /[\d.]+[KMB]?\/[\d.]+[KMB]?/.test(p)) || "";
  const tokenMatch = tokenPart.match(/([\d.]+[KMB]?)\/([\d.]+[KMB]?)/);
  const costPart = parts.find((p) => p.startsWith("$")) || "";
  const durationPart = parts.reverse().find((p) => /^\d+[smh]/.test(p.trim())) || "";

  return {
    model: modelPart,
    tokensUsed: tokenMatch?.[1] || "",
    tokensMax: tokenMatch?.[2] || "",
    cost: costPart,
    duration: durationPart.trim(),
    raw: line,
  };
}

// ─── ChatPage ─────────────────────────────────────────────────────────────────

export default function ChatPage({ apiKeyConfigured = true }: { apiKeyConfigured?: boolean }) {
  const navigate = useNavigate();

  // Global app state
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [hermesVersion, setHermesVersion] = useState<string>("");
  const [workingDir, setWorkingDir] = useState<string | null>(() => localStorage.getItem("hermes_working_dir"));
  const [fileTreeOpen, setFileTreeOpen] = useState(false);
  const [showTools, setShowTools] = useState<boolean>(() => localStorage.getItem("hermes_show_tools") === "true");
  const [repliesCollapsed, setRepliesCollapsed] = useState<boolean>(
    () =>
      localStorage.getItem("hermes_replies_collapsed") === "true" ||
      localStorage.getItem("hermes_compare_view") === "true"
  );
  const [showThink, setShowThink] = useState<boolean>(() => localStorage.getItem("hermes_show_think") !== "false");
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [snapshotPanelOpen, setSnapshotPanelOpen] = useState(false);
  const [snapshotCreateCount, setSnapshotCreateCount] = useState(0);
  const [snapshotPanelTab, setSnapshotPanelTab] = useState<"snapshot" | "background">("snapshot");
  const [bgRunningCount, setBgRunningCount] = useState(0);
  const [pendingInputAppend, setPendingInputAppend] = useState<{ id: number; text: string } | null>(null);

  // Per-session states
  const [sessionMessages, setSessionMessages] = useState<Record<string, Message[]>>({});
  const [sessionQueues, setSessionQueues] = useState<Record<string, string[]>>({});
  const [streamingSessions, setStreamingSessions] = useState<Set<string>>(new Set());
  const [sessionStatus, setSessionStatus] = useState<Record<string, HermesStatus>>({});
  const [sessionErrors, setSessionErrors] = useState<Record<string, string | null>>({});
  // Live agent activity per session ("tool:<name>" | "thinking" | null) — drives April
  const [sessionAgentActivity, setSessionAgentActivity] = useState<Record<string, string | null>>({});
  // Bumped when a background task completes — April reacts to the change
  const [bgDoneSignal, setBgDoneSignal] = useState(0);
const [sessionBadges, setSessionBadges] = useState<Record<string, "running" | "queued" | "done">>({});

  // Memory state (for feat-211 / feat-213)
  const [memoryLoaded, setMemoryLoaded] = useState<boolean | null>(null);

  // Goal active state (for TopBar button visibility)
  const [goalActive, setGoalActive] = useState(() => {
    try { return !!JSON.parse(localStorage.getItem("hermes-goal-state") ?? "null"); }
    catch { return false; }
  });

  useEffect(() => {
    const handler = (e: Event) => setGoalActive((e as CustomEvent<boolean>).detail);
    window.addEventListener("goal-changed", handler);
    return () => window.removeEventListener("goal-changed", handler);
  }, []);

  // Refs
  const justFinishedRef = useRef<Record<string, boolean>>({});
  const prevStreamingRef = useRef<Set<string>>(new Set());
  const activeSessionIdRef = useRef(activeSessionId);
  const prevStreamingForQueueRef = useRef<Set<string>>(new Set());
  const activePtyId = useRef(`pty-${Date.now()}`);
  const pendingPtyCommandRef = useRef<string | null>(null);
  // Breaks the handleSlashCommand → handleRetryLastMessage → sendToSession → handleSlashCommand cycle
  const handleRetryRef = useRef<() => void>(() => {});
  // Stable ref to current session status — lets handleSlashCommand read it without extra deps
  const sessionStatusRef = useRef(sessionStatus);

  // Derived values for current active session
  const activeSession = activeSessionId ? sessions.find((s) => s.id === activeSessionId) : null;
  const messages = activeSessionId ? (sessionMessages[activeSessionId] ?? []) : [];
  const queue = activeSessionId ? (sessionQueues[activeSessionId] ?? []) : [];
  const streaming = activeSessionId ? streamingSessions.has(activeSessionId) : false;
  const status = activeSessionId ? (sessionStatus[activeSessionId] ?? null) : null;
  const error = activeSessionId ? (sessionErrors[activeSessionId] ?? null) : null;

  // Branch sessions are now registered in hermes SQLite on creation, so --resume works.
  const tuiSessionId = activeSessionId;

  const contextPct = useMemo(() => {
    if (typeof status?.contextPercent === "number") {
      return Math.min(1, status.contextPercent / 100);
    }
    if (!status?.tokensUsed || !status?.tokensMax) return undefined;
    const used = parseTokenCount(status.tokensUsed);
    const max  = parseTokenCount(status.tokensMax);
    return max > 0 ? Math.min(1, used / max) : undefined;
  }, [status?.contextPercent, status?.tokensUsed, status?.tokensMax]);

  const tokenDisplay = useMemo((): { input: string; output: string } | null => {
    const msgs = activeSessionId ? (sessionMessages[activeSessionId] ?? []) : [];
    if (msgs.length === 0) return null;
    let inputChars = 0;
    let outputChars = 0;
    for (const msg of msgs) {
      if (msg.role === "user") {
        for (const block of msg.blocks) {
          if (block.type === "text") inputChars += block.content.length;
        }
      } else {
        for (const block of msg.blocks) {
          if (block.type === "text" || block.type === "think") outputChars += block.content.length;
          else if (block.type === "tool") {
            outputChars += block.input.length;
            inputChars += block.output.length;
          }
        }
      }
    }
    const fmt = (n: number) => {
      if (n < 100) return null;
      if (n >= 1_000_000) return `~${(n / 1_000_000).toFixed(1)}M`;
      if (n >= 1_000) return `~${(n / 1_000).toFixed(1)}K`;
      return `~${n}`;
    };
    const inStr = fmt(Math.round(inputChars / 2));
    const outStr = fmt(Math.round(outputChars / 2));
    if (!inStr && !outStr) return null;
    return { input: inStr ?? "—", output: outStr ?? "—" };
  }, [activeSessionId, sessionMessages]);

  activeSessionIdRef.current = activeSessionId;
  sessionStatusRef.current = sessionStatus;

  const checkMemory = useCallback(async () => {
    try {
      const loaded = await invoke<boolean>("check_memory_loaded");
      setMemoryLoaded(loaded);
    } catch {
      setMemoryLoaded(false);
    }
  }, []);

  const loadSessions = useCallback(async () => {
    try {
      const s = await invoke<Session[]>("list_sessions");
      setSessions(s);
    } catch (e) {
      setSessionErrors((prev) => ({ ...prev, global: String(e) }));
    }
  }, []);

  const loadHermesInfo = useCallback(async () => {
    try {
      const info = await invoke<{ version: string }>("get_hermes_info");
      setHermesVersion(info.version);
    } catch {
      setHermesVersion("not found");
    }
  }, []);

  useEffect(() => {
    loadSessions();
    loadHermesInfo();
    checkMemory();
  }, []);

  useEffect(() => {
    checkMemory();
  }, [activeSessionId]);

  // Sync streaming state to the tray icon
  useEffect(() => {
    const status = streamingSessions.size > 0 ? "running" : "idle";
    invoke("update_tray_status", { status }).catch(() => {});
  }, [streamingSessions]);

  // Auto-refresh sessions after any streaming session finishes
  useEffect(() => {
    const prev = prevStreamingRef.current;
    const current = streamingSessions;

    prev.forEach((sessionId) => {
      if (!current.has(sessionId) && justFinishedRef.current[sessionId]) {
        justFinishedRef.current[sessionId] = false;
        loadSessions();
        const t = setTimeout(() => loadSessions(), 1500);
        return () => clearTimeout(t);
      }
    });

    prevStreamingRef.current = new Set(current);
  }, [streamingSessions, loadSessions]);

  const handleSelectSession = useCallback(async (id: string) => {
    setActiveSessionId(id);
    setSessionErrors((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setSessionBadges((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    const session = sessions.find((s) => s.id === id);
    if (session?.model) {
      setSessionStatus((prev) => ({
        ...prev,
        [id]: { ...(prev[id] ?? ({} as HermesStatus)), model: session.model! },
      }));
    }

      if (sessionMessages[id]?.length > 0) return;

    try {
      const raw = await invoke<unknown>("get_session_history", { sessionId: id });
      setSessionMessages((prev) => ({ ...prev, [id]: parseHistoryMessages(raw) }));
    } catch (e) {
      setSessionErrors((prev) => ({ ...prev, [id]: String(e) }));
    }
  }, [sessions, sessionMessages]);

  const handleNewSession = useCallback(() => {
    setActiveSessionId(null);
    setSessionErrors((prev) => {
      const next = { ...prev };
      delete next.global;
      return next;
    });
    setSessionStatus((prev) => {
      const next = { ...prev };
      delete next[activeSessionId ?? ""];
      return next;
    });
  }, [activeSessionId]);

  // Listen for the tray "New Session" menu item and global Cmd+N hotkey after handleNewSession is defined
  useEffect(() => {
    const unlisten = listen("new-session-from-tray", () => {
      handleNewSession();
    });
    const hotkeyHandler = () => handleNewSession();
    const terminalHandler = () => setTerminalOpen((value) => !value);
    const snapshotHandler = () => {
      setSnapshotPanelOpen((value) => !value);
      setFileTreeOpen(false);
    };
    const fileTreeHandler = () => {
      setFileTreeOpen((value) => !value);
      setSnapshotPanelOpen(false);
    };
    const stopHandler = () => {
      const id = activeSessionIdRef.current;
      if (id) invoke("kill_session", { sessionTag: id }).catch(() => {});
    };
    window.addEventListener("new-session-hotkey", hotkeyHandler);
    window.addEventListener("toggle-terminal", terminalHandler);
    window.addEventListener("toggle-snapshot", snapshotHandler);
    window.addEventListener("toggle-file-tree", fileTreeHandler);
    window.addEventListener("stop-active-session", stopHandler);
    return () => {
      unlisten.then((fn) => fn());
      window.removeEventListener("new-session-hotkey", hotkeyHandler);
      window.removeEventListener("toggle-terminal", terminalHandler);
      window.removeEventListener("toggle-snapshot", snapshotHandler);
      window.removeEventListener("toggle-file-tree", fileTreeHandler);
      window.removeEventListener("stop-active-session", stopHandler);
    };
  }, [handleNewSession]);

  // Background task completion notification → refresh the session list and navigate
  useEffect(() => {
    const unlisten = listen<{ task_id: string; session_id: string | null; status: string }>(
      "bg-task-done",
      async ({ payload }) => {
        setBgDoneSignal(Date.now());
        await loadSessions();
        if (payload.session_id) {
          setActiveSessionId(payload.session_id);
        } else {
          setSnapshotPanelTab("background");
          setSnapshotPanelOpen(true);
        }
      }
    );
    return () => { unlisten.then((fn) => fn()); };
  }, [loadSessions]);

  const handleDeleteSession = useCallback(
    async (id: string) => {
      try {
        await invoke("delete_session", { sessionId: id });
        if (activeSessionId === id) handleNewSession();
        setSessionMessages((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
        setSessionQueues((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
        setStreamingSessions((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        setSessionStatus((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
        setSessionErrors((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
        setSessionBadges((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
        await loadSessions();
      } catch (e) {
        setSessionErrors((prev) => ({ ...prev, global: String(e) }));
      }
    },
    [activeSessionId, handleNewSession, loadSessions]
  );

  const handleRenameSession = useCallback(
    async (title: string): Promise<boolean> => {
      if (!activeSessionId) return false;
      const nextTitle = title.trim();
      if (!nextTitle) return false;

      setSessionErrors((prev) => {
        const next = { ...prev };
        delete next[activeSessionId];
        return next;
      });
      setSessions((prev) =>
        prev.map((session) =>
          session.id === activeSessionId ? { ...session, title: nextTitle } : session
        )
      );

      try {
        await invoke("rename_session", { sessionId: activeSessionId, title: nextTitle });
        await loadSessions();
        return true;
      } catch (e) {
        setSessionErrors((prev) => ({ ...prev, [activeSessionId]: String(e) }));
        await loadSessions();
        return false;
      }
    },
    [activeSessionId, loadSessions]
  );

  // ─── PTY write ───────────────────────────────────────────────────────────────

  const writeToPty = useCallback((data: string) => {
    invoke("pty_write", { ptyId: activePtyId.current, data }).catch(() => {});
    setTimeout(() => invoke("pty_write", { ptyId: activePtyId.current, data: "\r" }).catch(() => {}), 150);
    setTimeout(() => invoke("pty_write", { ptyId: activePtyId.current, data: "\r" }).catch(() => {}), 300);
  }, []);

  const handlePtyWrite = useCallback((data: string) => {
    if (!terminalOpen) {
      // Open the terminal automatically and cache the command until the TUI is ready
      pendingPtyCommandRef.current = data;
      setTerminalOpen(true);
      return;
    }
    writeToPty(data);
  }, [terminalOpen, writeToPty]);

  // When the terminal just opened with a pending command, watch PTY output and send after 500ms of quiet
  useEffect(() => {
    if (!terminalOpen || !pendingPtyCommandRef.current) return;

    const cmd = pendingPtyCommandRef.current;
    pendingPtyCommandRef.current = null;

    let unlistenFn: (() => void) | null = null;
    let sent = false;

    const sendCmd = () => {
      if (sent) return;
      sent = true;
      if (unlistenFn) { unlistenFn(); unlistenFn = null; }
      clearTimeout(fallback);
      // After detecting readiness, wait 100ms before sending so the TUI is stable
      setTimeout(() => writeToPty(cmd), 100);
    };

    // Treat "ready" in the TUI status bar as readiness
    listen<string>(`pty:${activePtyId.current}`, (event) => {
      if (event.payload.includes("ready")) {
        sendCmd();
      }
    }).then((u) => { unlistenFn = u; });

    // Fallback: send after 8s regardless
    const fallback = setTimeout(sendCmd, 8000);

    return () => {
      clearTimeout(fallback);
      if (unlistenFn) unlistenFn();
    };
  }, [terminalOpen, writeToPty]);

  // ─── Background tasks ────────────────────────────────────────────────────────

  const handleRunBackground = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    try {
      await invoke<string>("bg_start", { prompt: trimmed });
      setSnapshotPanelTab("background");
      setSnapshotPanelOpen(true);
    } catch (e) {
      setSessionErrors((prev) => ({ ...prev, global: `Background task failed to start: ${e}` }));
    }
  }, []);

  // Poll bg running count even when panel is closed (for input badge)
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const n = await invoke<number>("bg_running_count");
        if (!cancelled) setBgRunningCount(n);
      } catch {
        /* ignore */
      }
    };
    tick();
    const id = setInterval(tick, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);


  const injectLocalMessage = useCallback((content: string) => {
    if (!activeSessionId) return;
    const msg: Message = {
      id: uid(),
      role: "assistant",
      blocks: [{ type: "text", content }],
      timestamp: new Date().toISOString(),
      status: "done",
    };
    setSessionMessages((prev) => ({
      ...prev,
      [activeSessionId]: [...(prev[activeSessionId] ?? []), msg],
    }));
  }, [activeSessionId]);

  const handleUndoLastTurn = useCallback(async () => {
    if (!activeSessionId) return;
    try {
      await invoke("undo_last_turn", { sessionId: activeSessionId });
      // Directly trim UI state: remove last user message and everything after it,
      // matching what undo_last_turn does to the file. get_session_history would
      // call hermes sessions export (which reads its own state, not the modified file).
      setSessionMessages((prev) => {
        const msgs = prev[activeSessionId] ?? [];
        const lastUserIdx = msgs.map((m, i) => ({ m, i })).reverse().find(({ m }) => m.role === "user")?.i;
        if (lastUserIdx === undefined) return prev;
        return { ...prev, [activeSessionId]: msgs.slice(0, lastUserIdx) };
      });
    } catch (e) {
      setSessionErrors((prev) => ({ ...prev, [activeSessionId]: String(e) }));
    }
  }, [activeSessionId]);

  const handleSlashCommand = useCallback((text: string): boolean => {
    const parts = text.trim().split(/\s+/);
    const cmd = parts[0].toLowerCase();
    if (!cmd.startsWith("/")) return false;
    if (cmd === "/clear" || cmd === "/new") {
      handleNewSession();
      return true;
    }
    if (cmd === "/title") {
      const name = text.trim().slice("/title".length).trim();
      if (name) void handleRenameSession(name);
      return true;
    }
    if (cmd === "/retry") {
      handleRetryRef.current();
      return true;
    }
    if (cmd === "/undo") {
      void handleUndoLastTurn();
      return true;
    }
    if (cmd === "/background") {
      const prompt = text.trim().slice("/background".length).trim();
      if (prompt) void handleRunBackground(prompt);
      return true;
    }
    if (cmd === "/status") {
      const sid = activeSessionId ?? "—";
      const st = sessionStatusRef.current[sid];
      const lines = [
        `**Session ID**: \`${sid}\``,
        st?.model ? `**Model**: ${st.model}` : null,
        st?.tokensUsed ? `**Token**：${st.tokensUsed}${st.tokensMax ? ` / ${st.tokensMax}` : ""}` : null,
        st?.duration ? `**Duration**: ${st.duration}` : null,
      ].filter(Boolean).join("\n\n");
      injectLocalMessage(lines || `**Session ID**: \`${sid}\``);
      return true;
    }
    if (cmd === "/save") {
      injectLocalMessage("Session saved automatically. Hermes persists each conversation after every exchange, so manual saves are not needed.");
      return true;
    }
    if (cmd === "/branch" || cmd === "/compress") {
      handlePtyWrite(text.trim());
      return true;
    }
    return false;
  }, [
    handleNewSession,
    handleRenameSession,
    handleUndoLastTurn,
    handleRunBackground,
    injectLocalMessage,
    activeSessionId,
    handlePtyWrite,
  ]);

  const sendToSession = useCallback(
    async (
      text: string,
      targetSessionId: string | null,
      options?: { hideUserMessage?: boolean; image?: string; imageFilename?: string; skills?: string[] }
    ) => {
      if (!text.trim()) return;

      const rawId = targetSessionId?.trim() || null;
      // Placeholder IDs generated by the frontend (new_${timestamp}) are not valid
      // hermes session IDs. Treat them as null so the backend starts a new CLI run
      // instead of passing --resume with an unknown ID.
      const realSessionId = rawId?.startsWith("new_") ? null : rawId;
      const sessionTag = realSessionId ?? `new_${Date.now()}`;

      if (streamingSessions.has(sessionTag)) {
        setSessionQueues((prev) => ({
          ...prev,
          [sessionTag]: [...(prev[sessionTag] ?? []), text.trim()],
        }));
        setSessionBadges((prev) => ({ ...prev, [sessionTag]: "queued" }));
        return;
      }

      if (handleSlashCommand(text)) return;

      // Track /snapshot create to keep SnapshotPanel in sync
      if (text.trim() === "/snapshot create") {
        setSnapshotCreateCount((c) => c + 1);
      }

      const userBlocks: Message["blocks"] = [{ type: "text", content: text.trim() }];
      if (options?.image) {
        userBlocks.push({ type: "image", dataUrl: options.image, filename: options.imageFilename });
      }
      const userMsg: Message = {
        id: uid(),
        role: "user",
        blocks: userBlocks,
        timestamp: new Date().toISOString(),
        status: "done",
      };

      const assistantId = uid();
      const assistantMsg: Message = {
        id: assistantId,
        role: "assistant",
        blocks: [],
        timestamp: new Date().toISOString(),
        status: "streaming",
      };

      flushSync(() => {
        if (!realSessionId) {
          setActiveSessionId(sessionTag);
          // Insert a placeholder session entry so the new chat appears in the
          // sidebar immediately. It will be migrated to the real id when the
          // "new_session_id" chunk arrives, then replaced by loadSessions().
          const placeholderTitle = text.trim().slice(0, 60);
          const nowIso = new Date().toISOString();
          setSessions((prev) =>
            prev.some((s) => s.id === sessionTag)
              ? prev
              : [
                  {
                    id: sessionTag,
                    title: placeholderTitle,
                    created_at: nowIso,
                    updated_at: nowIso,
                    message_count: 1,
                  },
                  ...prev,
                ]
          );
          setSessionBadges((prev) => ({ ...prev, [sessionTag]: "running" }));
        }

        setSessionMessages((prev) => ({
          ...prev,
          [sessionTag]: options?.hideUserMessage
            ? [...(prev[sessionTag] ?? []), assistantMsg]
            : [...(prev[sessionTag] ?? []), userMsg, assistantMsg],
        }));
        setStreamingSessions((prev) => new Set(prev).add(sessionTag));
        setSessionBadges((prev) => {
          const next = { ...prev };
          delete next[sessionTag];
          return next;
        });
        setSessionErrors((prev) => {
          const next = { ...prev };
          delete next[sessionTag];
          return next;
        });
      });

      await waitForUiPaint();

      try {
        await invoke("send_message", {
          sessionId: realSessionId,
          message: text.trim(),
          sessionTag,
          image: options?.image ?? null,
          workingDir: workingDir ?? null,
          skills: options?.skills ?? null,
        });
      } catch (e) {
        const message = String(e);
        setSessionErrors((prev) => ({ ...prev, [sessionTag]: message }));
        setStreamingSessions((prev) => {
          const next = new Set(prev);
          next.delete(sessionTag);
          return next;
        });
        setSessionMessages((prev) => {
          const msgs = [...(prev[sessionTag] ?? [])];
          const lastAssistantIdx = [...msgs].reverse().findIndex((m) => m.role === "assistant");
          if (lastAssistantIdx >= 0) {
            const idx = msgs.length - 1 - lastAssistantIdx;
            msgs[idx] = {
              ...msgs[idx],
              rawOutput: msgs[idx].rawOutput ? `${msgs[idx].rawOutput}\n${message}` : message,
              status: "error",
            };
          }
          return { ...prev, [sessionTag]: msgs };
        });
      }
    },
    [streamingSessions, handleSlashCommand, workingDir]
  );

  // Auto-send queued messages when a session finishes
  useEffect(() => {
    const prev = prevStreamingForQueueRef.current;
    const current = streamingSessions;

    prev.forEach((sessionId) => {
      if (!current.has(sessionId)) {
        const queue = sessionQueues[sessionId];
        if (queue && queue.length > 0) {
          const text = queue[0];
          setSessionQueues((prevQs) => ({
            ...prevQs,
            [sessionId]: prevQs[sessionId]?.slice(1) ?? [],
          }));
          setTimeout(() => {
            sendToSession(text, sessionId);
          }, 100);
        }
      }
    });

    prevStreamingForQueueRef.current = new Set(current);
  }, [streamingSessions, sessionQueues, sendToSession]);

  const handleSendMessage = useCallback(
    async (
      text: string,
      options?: { hideUserMessage?: boolean; image?: string; imageFilename?: string; skills?: string[] }
    ) => {
      if (!activeSessionId && !text.trim().startsWith("/")) {
        await sendToSession(text, null, options);
        return;
      }
      await sendToSession(text, activeSessionId, options);
    },
    [activeSessionId, sendToSession]
  );

  const handleStopSession = useCallback(() => {
    if (!activeSessionId) return;
    invoke("kill_session", { sessionTag: activeSessionId }).catch(() => {});
  }, [activeSessionId]);

  const handleRetryLastMessage = useCallback(() => {
    if (!activeSessionId || streaming) return;
    const msgs = sessionMessages[activeSessionId] ?? [];
    const lastUserText = getLastUserText(msgs);
    if (!lastUserText) return;

    const removeLastAssistant = () =>
      setSessionMessages((prev) => {
        const sessionMsgs = [...(prev[activeSessionId] ?? [])];
        const lastAssistantIdx = [...sessionMsgs].reverse().findIndex((m) => m.role === "assistant");
        if (lastAssistantIdx < 0) return prev;
        return {
          ...prev,
          [activeSessionId]: sessionMsgs.slice(0, sessionMsgs.length - 1 - lastAssistantIdx),
        };
      });

    const resend = () => {
      removeLastAssistant();
      sendToSession(lastUserText, activeSessionId, { hideUserMessage: true });
    };
    resend();
  }, [activeSessionId, streaming, sessionMessages, sendToSession]);

  // Keep the ref in sync so handleSlashCommand can call handleRetryLastMessage without a circular dep
  handleRetryRef.current = handleRetryLastMessage;

  // ─── Global listener (registered once on mount) ─────────────────────────────

  useEffect(() => {
    let unlistenFn: (() => void) | null = null;
    let cancelled = false;

    const setup = async () => {
      const unlisten = await listen<StreamChunk>("hermes:chunk", (event) => {
        const chunk = event.payload;
        const sessionId = chunk.session_id;
        if (!sessionId) return;

        // Transcript-shaping chunks go through the pure reducer (tested in
        // chunkReducer.test.ts); session-level chunks are handled below.
        setSessionMessages((prev) => {
          const current = prev[sessionId] ?? [];
          const next = applyChunk(current, chunk);
          return next === current ? prev : { ...prev, [sessionId]: next };
        });

        if (chunk.kind === "error") {
          setSessionErrors((ePrev) => ({ ...ePrev, [sessionId]: chunk.content }));
        }

        // Done cleanup runs unconditionally — must not be inside setSessionMessages
        // because an early-return (lastAssistantIdx < 0) would skip these operations,
        // leaving the session permanently stuck in "streaming" state.
        if (chunk.kind === "done") {
          justFinishedRef.current[sessionId] = true;
          setStreamingSessions((sPrev) => {
            const next = new Set(sPrev);
            next.delete(sessionId);
            return next;
          });
          setSessionBadges((bPrev) => {
            if (activeSessionIdRef.current === sessionId) return bPrev;
            return { ...bPrev, [sessionId]: "done" };
          });
          setSessionStatus((sPrev) => {
            const current = sPrev[sessionId];
            if (!current?.activity) return sPrev;
            return { ...sPrev, [sessionId]: { ...current, activity: undefined } };
          });

          // Streaming accumulates text by line-trim + chunk-stitch, which loses
          // code-block indentation and splits markdown across blocks when tool
          // calls interleave. The hermes-saved JSON is the canonical source —
          // reload it to render with full fidelity (same path as session switch).
          // Small delay lets hermes flush its final write to disk.
          setTimeout(async () => {
            try {
              const raw = await invoke<unknown>("get_session_history", {
                sessionId,
              });
              const reloaded = parseHistoryMessages(raw);
              if (reloaded.length === 0) return;
              setSessionMessages((prev) => {
                const current = prev[sessionId] ?? [];
                // Preserve any messages already started for the next queued turn
                // (a fresh user+streaming-assistant pair appended after this done).
                // Find the earliest still-streaming assistant; everything from the
                // user before it onward belongs to the next round.
                const streamingIdx = current.findIndex(
                  (m) => m.role === "assistant" && m.status === "streaming"
                );
                if (streamingIdx < 0) {
                  return { ...prev, [sessionId]: reloaded };
                }
                const splitIdx =
                  streamingIdx > 0 && current[streamingIdx - 1].role === "user"
                    ? streamingIdx - 1
                    : streamingIdx;
                return {
                  ...prev,
                  [sessionId]: [...reloaded, ...current.slice(splitIdx)],
                };
              });
            } catch {
              // ignore — keep streamed blocks as fallback
            }
          }, 300);
        }

        if (chunk.kind === "status") {
          const parsed = parseStatusLine(chunk.content);
          if (parsed) {
            setSessionStatus((prev) => ({
              ...prev,
              [sessionId]: { ...(prev[sessionId] ?? ({} as HermesStatus)), ...parsed } as HermesStatus,
            }));
          }
        }

        // Live agent activity for April: what is Hermes doing right now?
        if (chunk.kind === "tool_name") {
          setSessionAgentActivity((prev) => ({ ...prev, [sessionId]: `tool:${chunk.content || "tool"}` }));
        } else if (chunk.kind === "think_start" || chunk.kind === "think") {
          setSessionAgentActivity((prev) =>
            prev[sessionId] === "thinking" ? prev : { ...prev, [sessionId]: "thinking" }
          );
        } else if (
          chunk.kind === "text" ||
          chunk.kind === "tool_output_end" ||
          chunk.kind === "think_end" ||
          chunk.kind === "done" ||
          chunk.kind === "error"
        ) {
          setSessionAgentActivity((prev) =>
            prev[sessionId] == null ? prev : { ...prev, [sessionId]: null }
          );
        }

        // Structured stats from the persistent gateway's session.info events
        if (chunk.kind === "status_json") {
          try {
            const s = JSON.parse(chunk.content) as {
              model?: string;
              context_used?: number;
              context_max?: number;
              context_percent?: number;
            };
            setSessionStatus((prev) => {
              const current = prev[sessionId] ?? ({} as HermesStatus);
              const next: HermesStatus = { ...current };
              if (s.model) next.model = s.model;
              if (typeof s.context_used === "number" && s.context_used > 0) {
                next.tokensUsed = formatTokenCount(s.context_used);
              }
              if (typeof s.context_max === "number" && s.context_max > 0) {
                next.tokensMax = formatTokenCount(s.context_max);
              }
              if (typeof s.context_percent === "number") {
                next.contextPercent = s.context_percent;
              }
              return { ...prev, [sessionId]: next };
            });
          } catch {
            // malformed payload — keep last known status
          }
        }

        // Transient gateway activity (context compression progress, etc.)
        if (chunk.kind === "gateway_status") {
          try {
            const s = JSON.parse(chunk.content) as { kind?: string; text?: string };
            const isBusy = s.kind === "compacting" || s.kind === "compressing";
            setSessionStatus((prev) => {
              const current = prev[sessionId] ?? ({} as HermesStatus);
              const activity = isBusy ? (s.text || "Compressing context…") : undefined;
              if ((current.activity ?? undefined) === activity) return prev;
              return { ...prev, [sessionId]: { ...current, activity } };
            });
          } catch {
            // malformed payload — ignore
          }
        }

        if (chunk.kind === "session_stat") {
          const line = chunk.content;
          setSessionStatus((prev) => {
            const current = prev[sessionId] ?? ({} as HermesStatus);
            if (line.startsWith("Duration:")) {
              return {
                ...prev,
                [sessionId]: {
                  ...current,
                  duration: line.replace(/^Duration:\s*/, "").trim(),
                } as HermesStatus,
              };
            } else if (line.startsWith("Messages:")) {
              return {
                ...prev,
                [sessionId]: {
                  ...current,
                  msgCount: line.replace(/^Messages:\s*/, "").trim(),
                } as HermesStatus,
              };
            }
            return prev;
          });
        }

        if (chunk.kind === "new_session_id") {
          const realId = chunk.content;
          setSessionMessages((prev) => {
            const msgs = prev[sessionId];
            if (!msgs) return prev;
            const next = { ...prev };
            delete next[sessionId];
            next[realId] = msgs;
            return next;
          });
          setSessionQueues((prev) => {
            const q = prev[sessionId];
            if (!q) return prev;
            const next = { ...prev };
            delete next[sessionId];
            next[realId] = q;
            return next;
          });
          setStreamingSessions((prev) => {
            const next = new Set(prev);
            next.delete(sessionId);
            next.add(realId);
            return next;
          });
          setSessionStatus((prev) => {
            const s = prev[sessionId];
            if (!s) return prev;
            const next = { ...prev };
            delete next[sessionId];
            next[realId] = s;
            return next;
          });
          setSessionErrors((prev) => {
            const e = prev[sessionId];
            if (!e) return prev;
            const next = { ...prev };
            delete next[sessionId];
            next[realId] = e;
            return next;
          });
          setSessionBadges((prev) => {
            const b = prev[sessionId];
            if (!b) return prev;
            const next = { ...prev };
            delete next[sessionId];
            next[realId] = b;
            return next;
          });
          setSessions((prev) => {
            // Migrate the placeholder sidebar entry to the real id. The
            // subsequent loadSessions() call will then refresh full metadata.
            const idx = prev.findIndex((s) => s.id === sessionId);
            if (idx < 0) return prev;
            const next = [...prev];
            next[idx] = { ...next[idx], id: realId };
            return next;
          });
          setActiveSessionId((current) => (current === sessionId ? realId : current));
        }
      });

      if (cancelled) {
        unlisten();
        return;
      }
      unlistenFn = unlisten;
    };

    setup();

    return () => {
      cancelled = true;
      if (unlistenFn) unlistenFn();
    };
  }, []);

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="app-layout">
      <TopBar
        streaming={streaming}
        status={status}
        hermesVersion={hermesVersion}
        sessionTitle={activeSession?.title ?? null}
        onOpenTerminal={() => setTerminalOpen(true)}
        onOpenSnapshot={() => {
            setSnapshotPanelOpen((v) => !v);
            setFileTreeOpen(false);
          }}
        tokenDisplay={tokenDisplay}
        showTools={showTools}
        onToggleTools={() => {
          setShowTools((v) => {
            const next = !v;
            localStorage.setItem("hermes_show_tools", String(next));
            return next;
          });
        }}
        repliesCollapsed={repliesCollapsed}
        onToggleRepliesCollapsed={() => {
          setRepliesCollapsed((v) => {
            const next = !v;
            localStorage.setItem("hermes_replies_collapsed", String(next));
            localStorage.removeItem("hermes_compare_view");
            return next;
          });
        }}
        showThink={showThink}
        onToggleThink={() => {
          setShowThink((v) => {
            const next = !v;
            localStorage.setItem("hermes_show_think", String(next));
            return next;
          });
        }}
        onSendMessage={handleSendMessage}
        onNewSession={handleNewSession}
        onRenameSession={handleRenameSession}
        goalActive={goalActive}
      />
      <Sidebar
        sessions={sessions}
        activeId={activeSessionId}
        onSelect={handleSelectSession}
        onNew={handleNewSession}
        onDelete={handleDeleteSession}
        onRefresh={loadSessions}
        badges={sessionBadges}
      />
      <div className="content-area">
        <WorkingDirBar
          workingDir={workingDir}
          onDirChange={(dir) => {
            setWorkingDir(dir);
            if (dir) localStorage.setItem("hermes_working_dir", dir);
            else localStorage.removeItem("hermes_working_dir");
          }}
          fileTreeOpen={fileTreeOpen}
          onToggleFileTree={() => {
            setFileTreeOpen((v) => !v);
            if (!fileTreeOpen) setSnapshotPanelOpen(false);
          }}
          messageCount={messages.length}
          memoryLoaded={memoryLoaded}
        />
        {terminalOpen && (
          <TerminalPanel ptyId={activePtyId.current} sessionId={tuiSessionId} onClose={() => setTerminalOpen(false)} />
        )}
        {fileTreeOpen && (
          <FileTreePanel
            initialPath={workingDir ?? ""}
            onClose={() => setFileTreeOpen(false)}
            onAddToChat={(text) => setPendingInputAppend({ id: Date.now(), text })}
          />
        )}
        {snapshotPanelOpen && (
          <SnapshotPanel
            onSend={handleSendMessage}
            onClose={() => setSnapshotPanelOpen(false)}
            externalCreateCount={snapshotCreateCount}
            sessionTitle={activeSession?.title ?? "Untitled session"}
            initialTab={snapshotPanelTab}
            onBgCountChange={setBgRunningCount}
          />
        )}
        {!apiKeyConfigured && (
          <div className="config-guide-card">
            <span className="config-guide-icon">⚠</span>
            <div className="config-guide-body">
              <div className="config-guide-title">API key not configured</div>
              <div className="config-guide-desc">Hermes needs at least one provider API key to run.</div>
            </div>
            <button className="config-guide-btn" onClick={() => navigate("/dashboard")}>
              Configure
            </button>
          </div>
        )}
        <ChatView
          messages={messages}
          streaming={streaming}
          memoryLoaded={memoryLoaded}
          currentModel={status?.model ?? null}
          onSend={handleSendMessage}
          onQueue={(text) => {
            if (!activeSessionId) return;
            setSessionQueues((prev) => ({
              ...prev,
              [activeSessionId]: [...(prev[activeSessionId] ?? []), text],
            }));
            setSessionBadges((prev) => ({ ...prev, [activeSessionId]: "queued" }));
          }}
          onCancelQueue={(index) => {
            if (!activeSessionId) return;
            setSessionQueues((prev) => ({
              ...prev,
              [activeSessionId]: prev[activeSessionId]?.filter((_, i) => i !== index) ?? [],
            }));
            setSessionBadges((prev) => {
              const q = sessionQueues[activeSessionId] ?? [];
              if (q.length <= 1) {
                const next = { ...prev };
                delete next[activeSessionId];
                return next;
              }
              return prev;
            });
          }}
          onClearQueue={() => {
            if (!activeSessionId) return;
            setSessionQueues((prev) => {
              const next = { ...prev };
              delete next[activeSessionId];
              return next;
            });
            setSessionBadges((prev) => {
              const next = { ...prev };
              delete next[activeSessionId];
              return next;
            });
          }}
          queue={queue}
          onRetryLastMessage={handleRetryLastMessage}
          onStop={handleStopSession}
          error={error}
          onGoToDashboard={() => navigate("/dashboard")}
          hasSession={activeSessionId !== null || messages.length > 0}
          onRunBackground={handleRunBackground}
          bgRunningCount={bgRunningCount}
          onPtyWrite={handlePtyWrite}
          pendingInputAppend={pendingInputAppend}
          workingDir={workingDir}
          showTools={showTools}
          repliesCollapsed={repliesCollapsed}
          showThink={showThink}
          contextPct={contextPct}
          agentActivity={activeSessionId ? (sessionAgentActivity[activeSessionId] ?? null) : null}
          compressing={status?.activity ?? null}
          bgDoneSignal={bgDoneSignal}
          onCompress={() => handlePtyWrite("/compress")}
        />
      </div>
    </div>
  );
}
