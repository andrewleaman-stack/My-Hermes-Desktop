import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Session, Message, StreamChunk, HermesStatus } from "./types";
import Sidebar from "./components/Sidebar";
import TopBar from "./components/topbar/TopBar";
import ChatView from "./components/ChatView";
import TerminalPanel from "./components/TerminalPanel";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function parseHistoryMessages(raw: unknown): Message[] {
  // Session file is a JSON object with a top-level "messages" key,
  // or JSONL which the backend already converts to an array.
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
  for (const item of items as Record<string, unknown>[]) {
    const role = item.role as string;
    if (role !== "user" && role !== "assistant") continue;

    let text = "";
    const content = item.content;
    if (typeof content === "string") {
      text = content.trim();
    } else if (Array.isArray(content)) {
      text = (content as Record<string, unknown>[])
        .filter((b) => b.type === "text")
        .map((b) => String(b.text ?? ""))
        .join("\n")
        .trim();
    }
    if (!text) continue;

    messages.push({
      id: uid(),
      role: role as "user" | "assistant",
      blocks: [{ type: "text", content: text }],
      timestamp: String(item.timestamp ?? new Date().toISOString()),
      status: "done",
    });
  }
  return messages;
}

function parseStatusLine(line: string): Partial<HermesStatus> | null {
  // ⚕ model │ 12.4K/200K │ [████] 6% │ $0.06 │ 15m
  // hermes may use │ (U+2502) or | (ASCII)
  const parts = line.split(/[│|]/).map((s) => s.trim()).filter(Boolean);
  if (parts.length < 2) return null;

  const modelPart = parts[0].replace(/^[⚕⚡\s]+/, "").trim();
  const tokenPart = parts.find((p) => /[\d.]+[KMB]?\/[\d.]+[KMB]?/.test(p)) || "";
  const tokenMatch = tokenPart.match(/([\d.]+[KMB]?)\/([\d.]+[KMB]?)/);
  const costPart = parts.find((p) => p.startsWith("$")) || "";
  // Duration is the last part that looks like time (15m, 1m30s, 23s)
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

// ─── App ─────────────────────────────────────────────────────────────────────

export default function App() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [status, setStatus] = useState<HermesStatus | null>(null);
  const [hermesVersion, setHermesVersion] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [terminalOpen, setTerminalOpen] = useState(false);

  const unlistenRef = useRef<(() => void) | null>(null);
  const justFinishedRef = useRef(false);

  const loadSessions = useCallback(async () => {
    try {
      const s = await invoke<Session[]>("list_sessions");
      setSessions(s);
    } catch (e) {
      setError(String(e));
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

  // ── Load sessions on mount ──
  useEffect(() => {
    loadSessions();
    loadHermesInfo();
  }, []);

  // ── Refresh sidebar after streaming ends ──
  useEffect(() => {
    if (!streaming && justFinishedRef.current) {
      justFinishedRef.current = false;
      loadSessions();
      // Retry once in case hermes writes the session file slightly late
      const t = setTimeout(() => loadSessions(), 1500);
      return () => clearTimeout(t);
    }
  }, [streaming, loadSessions]);

  // ── Sync model from sessions list into status ──
  useEffect(() => {
    if (!activeSessionId) return;
    const session = sessions.find((s) => s.id === activeSessionId);
    if (session?.model) {
      setStatus((s) => ({ ...(s ?? {} as HermesStatus), model: session.model! }));
    }
  }, [sessions, activeSessionId]);

  // ── Select session ──
  const handleSelectSession = useCallback(async (id: string) => {
    setActiveSessionId(id);
    setMessages([]);
    setError(null);
    // Show model from session metadata immediately
    const session = sessions.find((s) => s.id === id);
    if (session?.model) {
      setStatus((s) => ({ ...(s ?? {} as HermesStatus), model: session.model! }));
    }
    try {
      const raw = await invoke<unknown>("get_session_history", { sessionId: id });
      setMessages(parseHistoryMessages(raw));
    } catch (e) {
      setError(String(e));
    }
  }, [sessions]);

  // ── New session ──
  const handleNewSession = useCallback(() => {
    setActiveSessionId(null);
    setMessages([]);
    setError(null);
  }, []);

  // ── Delete session ──
  const handleDeleteSession = useCallback(
    async (id: string) => {
      try {
        await invoke("delete_session", { sessionId: id });
        if (activeSessionId === id) handleNewSession();
        await loadSessions();
      } catch (e) {
        setError(String(e));
      }
    },
    [activeSessionId, handleNewSession, loadSessions]
  );

  // ── Slash command handler ──
  // /clear is handled locally; all other slash commands are forwarded to
  // hermes via PTY (interactive mode), where the REPL processes them natively.
  const handleSlashCommand = useCallback((text: string): boolean => {
    const cmd = text.trim().toLowerCase();
    if (!cmd.startsWith("/")) return false;
    if (cmd.split(/\s+/)[0] === "/clear") {
      handleNewSession();
      return true;
    }
    return false; // pass through to hermes
  }, [handleNewSession]);

  // ── Send message ──
  const handleSendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || streaming) return;
      setError(null);

      // Intercept slash commands before sending to hermes
      if (handleSlashCommand(text)) return;

      const userMsg: Message = {
        id: uid(),
        role: "user",
        blocks: [{ type: "text", content: text.trim() }],
        timestamp: new Date().toISOString(),
        status: "done",
      };

      // Placeholder for streaming assistant message
      const assistantId = uid();
      const assistantMsg: Message = {
        id: assistantId,
        role: "assistant",
        blocks: [],
        timestamp: new Date().toISOString(),
        status: "streaming",
      };

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setStreaming(true);

      // ── Set up event listener ──
      if (unlistenRef.current) {
        unlistenRef.current();
        unlistenRef.current = null;
      }

      const unlisten = await listen<StreamChunk>("hermes:chunk", (event) => {
        const chunk = event.payload;

        setMessages((prev) => {
          const msgs = [...prev];
          const idx = msgs.findIndex((m) => m.id === assistantId);
          if (idx === -1) return prev;

          const msg = { ...msgs[idx] };
          const blocks = [...msg.blocks];

          switch (chunk.kind) {
            case "text": {
              const last = blocks[blocks.length - 1];
              if (last?.type === "text") {
                blocks[blocks.length - 1] = {
                  ...last,
                  content: last.content + "\n" + chunk.content,
                };
              } else {
                blocks.push({ type: "text", content: chunk.content });
              }
              break;
            }

            case "think_start":
              blocks.push({ type: "think", content: "" });
              break;

            case "think": {
              const last = blocks[blocks.length - 1];
              if (last?.type === "think") {
                blocks[blocks.length - 1] = {
                  ...last,
                  content: last.content + (last.content ? "\n" : "") + chunk.content,
                };
              }
              break;
            }

            case "think_end":
              break; // think block is already present

            case "tool_name":
              blocks.push({
                type: "tool",
                name: chunk.content || "tool",
                input: "",
                output: "",
                outputDone: false,
              });
              break;

            case "tool_input": {
              const last = blocks[blocks.length - 1];
              if (last?.type === "tool") {
                blocks[blocks.length - 1] = {
                  ...last,
                  input: last.input + (last.input ? "\n" : "") + chunk.content,
                };
              }
              break;
            }

            case "tool_output": {
              const last = blocks[blocks.length - 1];
              if (last?.type === "tool") {
                blocks[blocks.length - 1] = {
                  ...last,
                  output: last.output + (last.output ? "\n" : "") + chunk.content,
                };
              }
              break;
            }

            case "tool_output_end": {
              const last = blocks[blocks.length - 1];
              if (last?.type === "tool") {
                blocks[blocks.length - 1] = { ...last, outputDone: true };
              }
              break;
            }

            case "status": {
              const parsed = parseStatusLine(chunk.content);
              if (parsed) setStatus((s) => ({ ...(s ?? {}), ...parsed } as HermesStatus));
              break;
            }

            case "session_stat": {
              // "Duration: 23s" or "Messages: 54 (8 user, 38 tool calls)"
              const line = chunk.content;
              if (line.startsWith("Duration:")) {
                const val = line.replace(/^Duration:\s*/, "").trim();
                setStatus((s) => ({ ...(s ?? {}), duration: val } as HermesStatus));
              } else if (line.startsWith("Messages:")) {
                const val = line.replace(/^Messages:\s*/, "").trim();
                setStatus((s) => ({ ...(s ?? {}), msgCount: val } as HermesStatus));
              }
              break;
            }

            case "new_session_id":
              setActiveSessionId(chunk.content);
              break;

            case "error":
              setError(chunk.content);
              break;

            case "done":
              msg.status = "done";
              justFinishedRef.current = true;
              setStreaming(false);
              break;
          }

          msgs[idx] = { ...msg, blocks };
          return msgs;
        });
      });

      unlistenRef.current = unlisten;

      // ── Invoke command ──
      try {
        await invoke("send_message", {
          sessionId: activeSessionId,
          message: text.trim(),
        });
      } catch (e) {
        setError(String(e));
        setStreaming(false);
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, status: "error" } : m))
        );
      }
    },
    [streaming, activeSessionId, loadSessions, handleSlashCommand]
  );

  return (
    <div className="app-layout">
      <TopBar
        streaming={streaming}
        status={status}
        hermesVersion={hermesVersion}
        onOpenTerminal={() => setTerminalOpen(true)}
      />
      <Sidebar
        sessions={sessions}
        activeId={activeSessionId}
        onSelect={handleSelectSession}
        onNew={handleNewSession}
        onDelete={handleDeleteSession}
      />
      {/* Main content: terminal panel (top) + chat (bottom) */}
      <div className="content-area">
        {terminalOpen && (
          <TerminalPanel
            sessionId={activeSessionId}
            onClose={() => setTerminalOpen(false)}
          />
        )}
        <ChatView
          messages={messages}
          streaming={streaming}
          onSend={handleSendMessage}
          error={error}
          hasSession={activeSessionId !== null || messages.length > 0}
        />
      </div>  {/* content-area */}
    </div>
  );
}
