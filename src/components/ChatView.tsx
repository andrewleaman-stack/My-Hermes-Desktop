import { useEffect, useMemo, useRef, useState, KeyboardEvent, ClipboardEvent, DragEvent, useCallback } from "react";
import { open as openFileDialog } from "@tauri-apps/plugin-dialog";
import { Message } from "../types";
import Icon from "./Icon";
import GuideBot from "./chat/GuideBot";
import MessageBubble from "./chat/MessageBubble";
import GoalBar from "./chat/GoalBar";
import PersonalityPicker from "./chat/PersonalityPicker";
import SlashCommandMenu, { SLASH_COMMANDS, SlashCommand } from "./chat/SlashCommandMenu";
import RefPickerPanel from "./chat/RefPickerPanel";
import { buildConversationGroups } from "../utils/conversationGroups";
import { RefItem } from "./chat/AtMentionMenu";

interface AttachedImage {
  dataUrl: string;
  filename?: string;
}

interface AttachedFile {
  name: string;
  path: string;
}

interface Props {
  messages: Message[];
  streaming: boolean;
  onSend: (
    text: string,
    options?: { image?: string; imageFilename?: string; skills?: string[] }
  ) => void;
  onQueue: (text: string) => void;
  onCancelQueue: (index: number) => void;
  onClearQueue: () => void;
  queue: string[];
  onRetryLastMessage: () => void;
  onStop?: () => void;
  error: string | null;
  hasSession: boolean;
  contextPct?: number;
  onCompress?: () => void;
  onRunBackground?: (text: string) => void;
  bgRunningCount?: number;
  onPtyWrite?: (data: string) => void;
  pendingInputAppend?: { id: number; text: string } | null;
  onGoToDashboard?: () => void;
  workingDir?: string | null;
  showTools?: boolean;
  repliesCollapsed?: boolean;
  showThink?: boolean;
  memoryLoaded?: boolean | null;
  currentModel?: string | null;
}

const SUPPORTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp", "image/bmp"];

const ATTACHMENT_EXTENSIONS = ["pdf", "docx", "doc", "xlsx", "xls", "pptx", "ppt", "txt", "md", "csv", "png", "jpg", "jpeg", "gif", "webp", "bmp"];

const DAILY_PROMPTS = [
  // Action prompts — files and organization
  "Organize my Downloads folder into subfolders by file type",
  "Scan my Desktop and list files not modified in more than 30 days",
  "Batch rename the images in this folder using a date-based format",
  "Analyze the current project folder and find duplicate or redundant files",
  "Find and summarize all TODO comments under the current directory",
  // Action prompts — writing and documents
  "Write a meeting-notes template with time, participants, decisions, and action items",
  "Turn the following into a slide deck outline, organized by sections:\n\n",
  "Turn this into a clearly structured Markdown document:\n\n",
  "Draft a professional business email to:",
  "Turn what I said into a concise work report:\n\n",
  // Action prompts — schedule and tasks
  "Create a weekly work-plan template and save it to the Desktop",
  "Create a daily task-list file dated today",
  "Set a reminder for 30 minutes from now that says:",
  "List today's three most important tasks in priority order",
  // Query prompts — live information
  "What is the weather like today, and is it a good day to go out?",
  "What domestic and international news is worth watching today?",
  "How are the major global stock markets performing today?",
  "What is today's exchange rate?",
  "What important tech or AI developments happened recently?",
  "What major sports stories happened today?",
  // Query prompts — knowledge and entertainment
  "What major events happened on this day in history?",
  "Give me an interesting piece of trivia",
  "Explain an interesting science concept in simple terms",
  "Recommend some recent books worth reading",
  "Recommend a recent well-reviewed movie or show",
  "Write me a short poem about today",
  // Query prompts — health and life
  "What kind of workout makes sense today?",
  "Suggest a quick, healthy lunch recipe",
  "Share one small tip for improving sleep quality",
  "Give me one tiny habit change I can do today",
];

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

export default function ChatView({
  messages,
  streaming,
  onSend,
  onQueue,
  onCancelQueue,
  onClearQueue,
  queue,
  onRetryLastMessage,
  onStop,
  error,
  hasSession,
  contextPct,
  onCompress,
  onRunBackground,
  bgRunningCount = 0,
  onPtyWrite,
  pendingInputAppend,
  onGoToDashboard,
  workingDir,
  showTools = true,
  repliesCollapsed = false,
  showThink = true,
  memoryLoaded = null,
  currentModel = null,
}: Props) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const wasAtBottomRef = useRef(true);

  // Identify Hermes error types and return a structured description; unknown errors return null
  function parseErrorCard(msg: string | null): { title: string; desc: string; dashboard?: string } | null {
    if (!msg) return null;
    const m = msg.toLowerCase();
    if (m.includes("401") || m.includes("unauthorized") || m.includes("invalid api key") || m.includes("authentication"))
      return { title: "API key is invalid or not configured", desc: "Go to Dashboard to check or re-enter your API key.", dashboard: "dashboard" };
    if (m.includes("429") || m.includes("rate limit") || m.includes("too many requests"))
      return { title: "Rate limit exceeded", desc: "API usage has hit the limit. Try again later or upgrade your plan.", dashboard: "dashboard" };
    if (m.includes("model not found") || m.includes("invalid model") || m.includes("does not exist"))
      return { title: "Model unavailable", desc: "The selected model cannot be accessed. Change the model configuration in Dashboard.", dashboard: "dashboard" };
    if (m.includes("mcp") || m.includes("tool error") || m.includes("tool call"))
      return { title: "MCP tool call failed", desc: "An MCP tool failed during this run. Check MCP configuration in Dashboard.", dashboard: "dashboard" };
    return null;
  }
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // isTyping: user is actively typing in the textarea
  const [isTyping, setIsTyping] = useState(false);

  const [attachedImage, setAttachedImage] = useState<AttachedImage | null>(null);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  const [slashOpen, setSlashOpen] = useState(false);
  const [slashQuery, setSlashQuery] = useState("");
  const [slashIdx, setSlashIdx] = useState(0);

  const [atOpen, setAtOpen] = useState(false);
  const [atQuery, setAtQuery] = useState("");
  const [selectedRefs, setSelectedRefs] = useState<RefItem[]>([]);
  const atTriggerPosRef = useRef<number>(0);

  const [isRecording, setIsRecording] = useState(false);
  const [expandedReplyGroups, setExpandedReplyGroups] = useState<Set<string>>(() => new Set());
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);

  const toggleRecording = useCallback(() => {
    if (isRecording && recognitionRef.current) {
      recognitionRef.current.stop();
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!SR) {
      alert("Speech recognition is not supported here. Grant microphone access in System Settings → Privacy & Security → Microphone, then restart the app.");
      return;
    }
    const recognition = new SR();
    recognition.lang = "zh-CN";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onstart = () => setIsRecording(true);
    recognition.onend = () => { setIsRecording(false); recognitionRef.current = null; };
    recognition.onerror = () => { setIsRecording(false); recognitionRef.current = null; };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (e: any) => {
      const transcript: string = e.results[0][0].transcript;
      const ta = textareaRef.current;
      if (!ta) return;
      ta.value = ta.value + transcript;
      ta.style.height = "auto";
      ta.style.height = Math.min(ta.scrollHeight, 160) + "px";
      ta.focus();
      setIsTyping(ta.value.length > 0);
    };
    recognitionRef.current = recognition;
    recognition.start();
  }, [isRecording]);

  const handleAtSelect = useCallback((item: RefItem) => {
    setAtOpen(false);
    // Remove the @query trigger text from the textarea
    const ta = textareaRef.current;
    if (ta) {
      const val = ta.value;
      const triggerEnd = atTriggerPosRef.current + 1 + atQuery.length;
      ta.value = val.slice(0, atTriggerPosRef.current) + val.slice(triggerEnd);
      ta.style.height = "auto";
      ta.style.height = Math.min(ta.scrollHeight, 160) + "px";
      setIsTyping(ta.value.length > 0);
    }
    textareaRef.current?.focus();
    setSelectedRefs((prev) => {
      if (prev.some((r) => r.type === item.type && r.name === item.name)) return prev;
      return [...prev, item];
    });
  }, [atQuery]);

  const openAtMenu = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    const pos = ta.selectionStart ?? ta.value.length;
    const val = ta.value;
    ta.value = val.slice(0, pos) + "@" + val.slice(pos);
    ta.focus();
    const newPos = pos + 1;
    ta.setSelectionRange(newPos, newPos);
    atTriggerPosRef.current = pos;
    setAtOpen(true);
    setAtQuery("");
    setIsTyping(ta.value.length > 0);
  }, []);

  const attachImageFile = async (file: File) => {
    if (!SUPPORTED_IMAGE_TYPES.includes(file.type)) return false;
    try {
      const dataUrl = await readFileAsDataURL(file);
      setAttachedImage({ dataUrl, filename: file.name || undefined });
      return true;
    } catch {
      return false;
    }
  };

  const handleAttachClick = async () => {
    const selected = await openFileDialog({
      multiple: true,
      filters: [{ name: "Files", extensions: ATTACHMENT_EXTENSIONS }],
    });
    if (!selected) return;
    const paths = Array.isArray(selected) ? selected : [selected];
    for (const p of paths) {
      const name = p.split("/").pop() ?? p;
      setAttachedFiles((prev) => {
        if (prev.some((f) => f.path === p)) return prev;
        return [...prev, { name, path: p }];
      });
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.kind === "file" && item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          attachImageFile(file);
          return;
        }
      }
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (Array.from(e.dataTransfer.types).includes("Files")) {
      e.preventDefault();
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    if (e.currentTarget === e.target) setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) attachImageFile(file);
  };

  // justFinished: briefly true when streaming transitions from true → false
  const [justFinished, setJustFinished] = useState(false);
  const prevStreaming = useRef(streaming);

  useEffect(() => {
    if (!streaming && prevStreaming.current) {
      setJustFinished(true);
    }
    prevStreaming.current = streaming;
  }, [streaming]);

  // longTask: heuristic — more than 6 user messages in this session
  const longTask = messages.filter((m) => m.role === "user").length >= 6;

  // Sticky scroll: instantly follow output if user was already at the bottom.
  // Tracks position before the messages state change via onScroll.
  useEffect(() => {
    if (wasAtBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "instant" });
    }
  }, [messages]);

  const handleMessagesScroll = () => {
    const el = scrollContainerRef.current;
    if (!el) return;
    wasAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  };

  // Auto-focus input on mount
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!pendingInputAppend) return;
    const ta = textareaRef.current;
    if (!ta) return;
    const current = ta.value;
    const separator = current.trim().length > 0 ? "\n\n" : "";
    const next = `${current}${separator}${pendingInputAppend.text}`;
    ta.value = next;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 160) + "px";
    ta.focus();
    ta.setSelectionRange(next.length, next.length);
    setIsTyping(next.length > 0);
  }, [pendingInputAppend]);

  const filteredSlashCmds = slashOpen
    ? SLASH_COMMANDS.filter((cmd) =>
        slashQuery === "" ||
        cmd.command.slice(1).startsWith(slashQuery.toLowerCase()) ||
        cmd.description.toLowerCase().includes(slashQuery.toLowerCase())
      )
    : [];


  const handleSlashSelect = (cmd: SlashCommand) => {
    setSlashOpen(false);
    if (cmd.directSend) {
      onSend(cmd.command);
      if (textareaRef.current) {
        textareaRef.current.value = "";
        textareaRef.current.style.height = "auto";
      }
      setIsTyping(false);
    } else {
      const fill = `${cmd.command} `;
      if (textareaRef.current) {
        textareaRef.current.value = fill;
        textareaRef.current.style.height = "auto";
        textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 160) + "px";
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(fill.length, fill.length);
      }
      setIsTyping(true);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (slashOpen && filteredSlashCmds.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSlashIdx((i) => (i + 1) % filteredSlashCmds.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSlashIdx((i) => (i - 1 + filteredSlashCmds.length) % filteredSlashCmds.length);
        return;
      }
      if (e.key === "Enter" && !e.nativeEvent.isComposing) {
        e.preventDefault();
        handleSlashSelect(filteredSlashCmds[slashIdx]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setSlashOpen(false);
        return;
      }
    }
    if (atOpen && e.key === "Escape") {
      e.preventDefault();
      setAtOpen(false);
      return;
    }
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  const submit = () => {
    const rawText = textareaRef.current?.value.trim() ?? "";
    if (!rawText && !attachedImage && selectedRefs.length === 0 && attachedFiles.length === 0) return;

    const fileRefs = selectedRefs.filter((r) => r.type === "file");
    const skillRefs = selectedRefs.filter((r) => r.type === "skill");
    const skillNames = skillRefs.map((r) => r.name);

    const fileAppend = fileRefs
      .map((r) => ` @${r.path}`)
      .join("");
    const uploadAppend = attachedFiles
      .map((f) => ` @${f.path}`)
      .join("");
    const payload = rawText + fileAppend + uploadAppend;

    const extraOpts = skillNames.length > 0 ? { skills: skillNames } : {};

    if (streaming) {
      onQueue(payload);
    } else if (attachedImage) {
      onSend(payload, { image: attachedImage.dataUrl, imageFilename: attachedImage.filename, ...extraOpts });
    } else {
      onSend(payload, Object.keys(extraOpts).length > 0 ? extraOpts : undefined);
    }
    if (textareaRef.current) {
      textareaRef.current.value = "";
      textareaRef.current.style.height = "auto";
    }
    setIsTyping(false);
    setAttachedImage(null);
    setAttachedFiles([]);
    setSelectedRefs([]);
  };

  const submitBackground = () => {
    const text = textareaRef.current?.value.trim();
    if (!text || !onRunBackground) return;
    onRunBackground(text);
    if (textareaRef.current) {
      textareaRef.current.value = "";
      textareaRef.current.style.height = "auto";
    }
    setIsTyping(false);
  };

  const submitToTui = () => {
    const text = textareaRef.current?.value.trim();
    if (!text || !onPtyWrite) return;
    onPtyWrite(text + "\r");
    if (textareaRef.current) {
      textareaRef.current.value = "";
      textareaRef.current.style.height = "auto";
    }
    setIsTyping(false);
  };

  // Auto-resize textarea + track isTyping + slash/@ menu detection
  const handleInput = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 160) + "px";
    setIsTyping(ta.value.length > 0);
    const val = ta.value;
    if (val.startsWith("/") && !val.includes(" ")) {
      setSlashOpen(true);
      setSlashQuery(val.slice(1));
      setSlashIdx(0);
    } else {
      setSlashOpen(false);
    }
    const cursorPos = ta.selectionStart ?? val.length;
    const textBeforeCursor = val.slice(0, cursorPos);
    const atMatch = textBeforeCursor.match(/@(\w*)$/);
    if (atMatch) {
      atTriggerPosRef.current = cursorPos - atMatch[0].length;
      setAtOpen(true);
      setAtQuery(atMatch[1]);
      } else {
      setAtOpen(false);
    }
  };

  const focusInput = () => {
    textareaRef.current?.focus();
  };

  const fillInput = (text: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.value = text;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 160) + "px";
    ta.focus();
    ta.setSelectionRange(text.length, text.length);
    setIsTyping(text.length > 0);
  };

  const dailyPrompts = useMemo(
    () => [...DAILY_PROMPTS].sort(() => Math.random() - 0.5).slice(0, 4),
    []
  );

  const STARTER_PROMPTS = [
    {
      icon: "terminal" as const,
      title: "Write a script",
      text: "Write me a shell script:",
    },
    {
      icon: "alert" as const,
      title: "Explain an error",
      text: "Explain this error message and tell me the cause and fix:\n\n",
    },
    {
      icon: "code" as const,
      title: "Analyze code",
      text: "Analyze the current project structure and give me a concise overview of the main modules",
    },
  ];

  const lastAssistantIdx = [...messages]
    .reverse()
    .findIndex((m) => m.role === "assistant");
  const lastAssistantId =
    lastAssistantIdx >= 0
      ? messages[messages.length - 1 - lastAssistantIdx].id
      : null;

  // Pre-compute assistantIndex per message for Grounding popover
  const assistantIndexMap = new Map<string, number>();
  let aCount = 0;
  for (const m of messages) {
    if (m.role === "assistant") {
      aCount += 1;
      assistantIndexMap.set(m.id, aCount);
    }
  }

  const conversationGroups = repliesCollapsed ? buildConversationGroups(messages) : [];

  useEffect(() => {
    if (!repliesCollapsed) setExpandedReplyGroups(new Set());
  }, [repliesCollapsed]);

  const toggleReplyGroup = (groupId: string) => {
    setExpandedReplyGroups((current) => {
      const next = new Set(current);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const renderErrorNotice = () => {
    if (!error) return null;
    const card = parseErrorCard(error);
    return card ? (
      <div className="error-card fade-in">
        <div className="error-card-header">
          <Icon name="alert" size={14} />
          <span>{card.title}</span>
        </div>
        <div className="error-card-desc">{card.desc}</div>
        {card.dashboard && onGoToDashboard && (
          <button className="error-card-btn" onClick={onGoToDashboard}>
            Go to Dashboard →
          </button>
        )}
      </div>
    ) : (
      <div className="error-banner fade-in">
        <Icon name="alert" size={15} />
        <span>{error}</span>
      </div>
    );
  };

  return (
    <div className="main-area">
      <GoalBar streaming={streaming} onSend={onSend} />
      {/* Messages */}
      {messages.length === 0 ? (
        <div className="chat-messages">
          <div className="chat-empty">
            <div className="chat-empty-icon">
              <Icon name="spark" size={34} />
            </div>
            <div className="chat-empty-title ui-font">
              {hasSession ? "Session loaded" : "Start a conversation"}
            </div>
            <div className="starter-prompts">
              {STARTER_PROMPTS.map((p) => (
                <button
                  key={p.title}
                  className="starter-prompt-card ui-font"
                  onClick={() => fillInput(p.text)}
                >
                  <Icon name={p.icon} size={15} className="starter-prompt-icon" />
                  <span>{p.title}</span>
                </button>
              ))}
            </div>
            <div className="daily-prompts-section">
              <span className="daily-prompts-label ui-font">Today's prompt</span>
              <div className="daily-prompts-grid">
                {dailyPrompts.map((q) => (
                  <button
                    key={q}
                    className="daily-prompt-card ui-font"
                    onClick={() => fillInput(q)}
                  >
                    <Icon name="message" size={12} className="daily-prompt-icon" />
                    <span>{q}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : repliesCollapsed ? (
        <div className="chat-messages conversation-outline" ref={scrollContainerRef} onScroll={handleMessagesScroll}>
          {conversationGroups.map((group) => {
            const hasStreamingReply = group.assistants.some(
              (reply) => reply.id === lastAssistantId && reply.status === "streaming"
            );
            const isExpanded = expandedReplyGroups.has(group.id) || hasStreamingReply;
            const replyCount = group.assistants.length;

            return (
              <div className="conversation-group" key={group.id}>
                {group.user ? (
                  <MessageBubble
                    message={group.user}
                    isLastAssistant={false}
                    streaming={false}
                    showTools={showTools}
                    showThink={showThink}
                    onRetry={onRetryLastMessage}
                  />
                ) : (
                  <div className="conversation-orphan-label ui-font">Hermes reply before the conversation started</div>
                )}

                {replyCount > 0 && (
                  <div className="conversation-reply-block">
                    {!isExpanded ? (
                      <button
                        type="button"
                        className="conversation-replies-toggle ui-font"
                        onClick={() => toggleReplyGroup(group.id)}
                        aria-expanded={false}
                      >
                        <Icon
                          name="chevronRight"
                          size={13}
                          className="conversation-replies-chevron"
                        />
                        <Icon name="spark" size={12} />
                        <span>Hermes replies</span>
                        {replyCount > 1 && (
                          <span className="conversation-replies-count">{replyCount} replies</span>
                        )}
                        <span className="conversation-replies-action">
                          {hasStreamingReply ? "Replying" : "Click to expand"}
                        </span>
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="conversation-replies-toggle expanded ui-font"
                          onClick={() => toggleReplyGroup(group.id)}
                          aria-expanded={true}
                        >
                          <Icon
                            name="chevronRight"
                            size={13}
                            className="conversation-replies-chevron open"
                          />
                          <Icon name="spark" size={12} />
                          <span>Hermes replies</span>
                          {replyCount > 1 && (
                            <span className="conversation-replies-count">{replyCount} replies</span>
                          )}
                          <span className="conversation-replies-action">
                            {hasStreamingReply ? "Replying" : "Collapse"}
                          </span>
                        </button>
                        <div className="conversation-replies">
                          {group.assistants.map((reply) => (
                            <MessageBubble
                              key={reply.id}
                              message={reply}
                              isLastAssistant={reply.id === lastAssistantId}
                              streaming={streaming}
                              showTools={showTools}
                              showThink={showThink}
                              onRetry={onRetryLastMessage}
                              model={currentModel}
                              memoryLoaded={memoryLoaded}
                              assistantIndex={assistantIndexMap.get(reply.id)}
                            />
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {renderErrorNotice()}
          <div ref={messagesEndRef} />
        </div>
      ) : (
        <div className="chat-messages" ref={scrollContainerRef} onScroll={handleMessagesScroll}>
          {messages.map((msg, idx) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              isLastAssistant={msg.id === lastAssistantId}
              streaming={streaming}
              showTools={showTools}
              showThink={showThink}
              onRetry={onRetryLastMessage}
              model={currentModel}
              memoryLoaded={memoryLoaded}
              assistantIndex={assistantIndexMap.get(msg.id)}
              messageIndex={idx + 1}
            />
          ))}
          {renderErrorNotice()}
          <div ref={messagesEndRef} />
        </div>
      )}

      {/* Error (when no messages) */}
      {error && messages.length === 0 && (() => {
        const card = parseErrorCard(error);
        return card ? (
          <div className="error-card" style={{ margin: "8px 16px" }}>
            <div className="error-card-header">
              <Icon name="alert" size={14} />
              <span>{card.title}</span>
            </div>
            <div className="error-card-desc">{card.desc}</div>
            {card.dashboard && onGoToDashboard && (
              <button className="error-card-btn" onClick={onGoToDashboard}>
                Go to Dashboard →
              </button>
            )}
          </div>
        ) : (
          <div className="error-banner" style={{ margin: "8px 16px" }}>
            <Icon name="alert" size={15} />
            <span>{error}</span>
          </div>
        );
      })()}

      {/* Input */}
      <div
        className={`chat-input-area${isDragging ? " is-dragging" : ""}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {isDragging && (
          <div className="image-drop-overlay">
            <Icon name="spark" size={20} />
            <span>Drop to attach image</span>
          </div>
        )}
        <GuideBot
          messages={messages}
          streaming={streaming}
          queue={queue}
          error={error}
          hasSession={hasSession}
          isTyping={isTyping}
          justFinished={justFinished}
          contextPct={contextPct}
          longTask={longTask}
          onFocusInput={focusInput}
          onRetryLastMessage={onRetryLastMessage}
          onCompress={onCompress}
        />

        {selectedRefs.length > 0 && (
          <div className="image-attachment-row">
            {selectedRefs.map((ref) => (
              <div key={`${ref.type}-${ref.name}`} className="ref-chip ui-font">
                <span className="ref-chip-icon">{ref.type === "file" ? "📄" : "⚙"}</span>
                <span className="ref-chip-name">{ref.name}</span>
                <button
                  type="button"
                  className="image-attachment-remove ref-chip-remove"
                  onClick={() =>
                    setSelectedRefs((prev) =>
                      prev.filter((r) => !(r.type === ref.type && r.name === ref.name))
                    )
                  }
                  title="Remove"
                >
                  <Icon name="close" size={10} />
                </button>
              </div>
            ))}
          </div>
        )}

        {attachedFiles.length > 0 && (
          <div className="image-attachment-row">
            {attachedFiles.map((f) => (
              <div key={f.path} className="ref-chip ui-font">
                <span className="ref-chip-icon">📎</span>
                <span className="ref-chip-name">{f.name}</span>
                <button
                  type="button"
                  className="image-attachment-remove ref-chip-remove"
                  onClick={() => setAttachedFiles((prev) => prev.filter((x) => x.path !== f.path))}
                  title="Remove"
                >
                  <Icon name="close" size={10} />
                </button>
              </div>
            ))}
          </div>
        )}

        {attachedImage && (
          <div className="image-attachment-row">
            <div className="image-attachment">
              <img src={attachedImage.dataUrl} alt={attachedImage.filename ?? "attached"} />
              <button
                type="button"
                className="image-attachment-remove"
                onClick={() => setAttachedImage(null)}
                title="Remove image"
              >
                <Icon name="close" size={12} />
              </button>
            </div>
            <span className="image-attachment-name">
              {attachedImage.filename ?? "Pasted image"}
            </span>
          </div>
        )}

        <div className="input-row-wrapper">
          {slashOpen && filteredSlashCmds.length > 0 && (
            <SlashCommandMenu
              items={filteredSlashCmds}
              selectedIndex={slashIdx}
              onSelect={handleSlashSelect}
            />
          )}
          {atOpen && (
            <RefPickerPanel
              workingDir={workingDir ?? null}
              onSelect={handleAtSelect}
              onClose={() => { setAtOpen(false); textareaRef.current?.focus(); }}
              onAsk={(text) => { setAtOpen(false); onSend(text); }}
            />
          )}
          <div className="input-row">
          <textarea
            ref={textareaRef}
            className="chat-textarea"
            placeholder={
              streaming
                ? queue.length > 0
                  ? `Queue message ${queue.length + 1}... (Enter to queue)`
                  : "Queue a message for next turn... (Enter to queue)"
                : "Message Hermes... (Enter to send, Shift+Enter for newline)"
            }
            onKeyDown={handleKeyDown}
            onInput={handleInput}
            onPaste={handlePaste}
            rows={1}
          />
          <button
            className="btn-send ui-font"
            onClick={submit}
          >
            {streaming ? (
              <>
                Queue ⏸
              </>
            ) : (
              <>
                Send
                <Icon name="send" size={14} />
              </>
            )}
          </button>
          </div>{/* input-row */}
        </div>{/* input-row-wrapper */}

        {queue.length > 0 && (
          <div className="queue-list">
            <div className="queue-header">
              <span className="queue-label">Queued ({queue.length} messages):</span>
              <button className="queue-clear" onClick={onClearQueue} title="Cancel all">
                Cancel all
              </button>
            </div>
            {queue.map((text, index) => (
              <div key={index} className="queue-item">
                <span className="queue-index">{index + 1}.</span>
                <span className="queue-text">{text}</span>
                <button
                  className="queue-cancel"
                  onClick={() => onCancelQueue(index)}
                  title="Remove this item"
                >
                  <Icon name="close" size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="input-hints ui-font">
          <div className="input-shortcuts">
            <button
              type="button"
              className="bg-run-btn ui-font"
              onClick={handleAttachClick}
              title="Add attachments (images/PDF/Word/Excel/PPT/text)"
            >
              <Icon name="paperclip" size={13} />
              Attach
            </button>
            <button
              type="button"
              className="bg-run-btn ui-font"
              onClick={openAtMenu}
              title="Reference files or skills (you can also type @)"
            >
              @
            </button>
            <PersonalityPicker onSend={onSend} />
            {streaming && onStop && (
              <button
                type="button"
                className="bg-run-btn stop-btn ui-font"
                onClick={onStop}
                title="Stop the current agent run"
              >
                <Icon name="close" size={12} />
                Stop
              </button>
            )}
            <button
              type="button"
              className={`bg-run-btn ui-font${isRecording ? " mic-recording" : ""}`}
              onClick={toggleRecording}
              title={isRecording ? "Click to stop recording" : "Voice input"}
            >
              <Icon name="mic" size={13} />
              {isRecording ? "Recording" : "Voice"}
            </button>
            {onRunBackground && (
              <button
                type="button"
                className="bg-run-btn ui-font"
                onClick={submitBackground}
                disabled={!isTyping}
                title="Run the current input as a separate background task without affecting this conversation"
              >
                <Icon name="bot" size={13} />
                Run in background
                {bgRunningCount > 0 && (
                  <span className="bg-run-badge">{bgRunningCount}</span>
                )}
              </button>
            )}
            {onPtyWrite && (
              <button
                type="button"
                className="bg-run-btn ui-font"
                onClick={submitToTui}
                disabled={!isTyping}
                title="Send the current input to the TUI terminal (PTY control test)"
              >
                <Icon name="terminal" size={13} />
                Send to TUI
              </button>
            )}
          </div>
          <div className="input-key-hints">
            <span>
              <kbd>Enter</kbd> to {streaming ? "queue" : "send"}
            </span>
            <span>
              <kbd>Shift+Enter</kbd> for newline
            </span>
          </div>
          {streaming && (
            <span className="agent-running">
              <span className="agent-running-dot" />
              Agent running...
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
