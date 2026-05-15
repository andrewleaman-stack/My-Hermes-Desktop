import { useEffect, useRef, useState, KeyboardEvent, ClipboardEvent, DragEvent } from "react";
import { Message } from "../types";
import Icon from "./Icon";
import GuideBot from "./chat/GuideBot";
import MessageBubble from "./chat/MessageBubble";
import GoalBar from "./chat/GoalBar";
import PersonalityPicker from "./chat/PersonalityPicker";

interface AttachedImage {
  dataUrl: string;
  filename?: string;
}

interface Props {
  messages: Message[];
  streaming: boolean;
  onSend: (
    text: string,
    options?: { image?: string; imageFilename?: string }
  ) => void;
  onQueue: (text: string) => void;
  onCancelQueue: (index: number) => void;
  onClearQueue: () => void;
  queue: string[];
  onRetryLastMessage: () => void;
  error: string | null;
  hasSession: boolean;
  contextPct?: number;
  onCompress?: () => void;
  onRunBackground?: (text: string) => void;
  bgRunningCount?: number;
}

const SUPPORTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp", "image/bmp"];

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
  error,
  hasSession,
  contextPct,
  onCompress,
  onRunBackground,
  bgRunningCount = 0,
}: Props) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // isTyping: user is actively typing in the textarea
  const [isTyping, setIsTyping] = useState(false);

  const [attachedImage, setAttachedImage] = useState<AttachedImage | null>(null);
  const [isDragging, setIsDragging] = useState(false);

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

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-focus input on mount
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  const submit = () => {
    const text = textareaRef.current?.value.trim();
    if (!text && !attachedImage) return;
    const payload = text ?? "";
    if (streaming) {
      // Queued sends do not yet carry images (image lives on the next live turn).
      onQueue(payload);
    } else if (attachedImage) {
      onSend(payload, { image: attachedImage.dataUrl, imageFilename: attachedImage.filename });
    } else {
      onSend(payload);
    }
    if (textareaRef.current) {
      textareaRef.current.value = "";
      textareaRef.current.style.height = "auto";
    }
    setIsTyping(false);
    setAttachedImage(null);
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

  // Auto-resize textarea + track isTyping
  const handleInput = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 160) + "px";
    setIsTyping(ta.value.length > 0);
  };

  const focusInput = () => {
    textareaRef.current?.focus();
  };

  const lastAssistantIdx = [...messages]
    .reverse()
    .findIndex((m) => m.role === "assistant");
  const lastAssistantId =
    lastAssistantIdx >= 0
      ? messages[messages.length - 1 - lastAssistantIdx].id
      : null;

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
            <div className="chat-empty-hint">
              Hermes is a self-improving agent — it learns from your interactions
              and creates skills from patterns it observes.
              <br />
              <br />
              Type a message below to begin.
            </div>
          </div>
        </div>
      ) : (
        <div className="chat-messages">
          {messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              isLastAssistant={msg.id === lastAssistantId}
              streaming={streaming}
              onRetry={onRetryLastMessage}
            />
          ))}
          {error && (
            <div className="error-banner fade-in">
              <Icon name="alert" size={15} />
              <span>{error}</span>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      )}

      {/* Error (when no messages) */}
      {error && messages.length === 0 && (
        <div className="error-banner" style={{ margin: "8px 16px" }}>
          <Icon name="alert" size={15} />
          <span>{error}</span>
        </div>
      )}

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
            <span>松开以附加图片</span>
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

        {attachedImage && (
          <div className="image-attachment-row">
            <div className="image-attachment">
              <img src={attachedImage.dataUrl} alt={attachedImage.filename ?? "attached"} />
              <button
                type="button"
                className="image-attachment-remove"
                onClick={() => setAttachedImage(null)}
                title="移除图片"
              >
                <Icon name="close" size={12} />
              </button>
            </div>
            <span className="image-attachment-name">
              {attachedImage.filename ?? "粘贴的图片"}
            </span>
          </div>
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
                排队 ⏸
              </>
            ) : (
              <>
                Send
                <Icon name="send" size={14} />
              </>
            )}
          </button>
        </div>

        {queue.length > 0 && (
          <div className="queue-list">
            <div className="queue-header">
              <span className="queue-label">排队中（{queue.length} 条）：</span>
              <button className="queue-clear" onClick={onClearQueue} title="全部取消">
                全部取消
              </button>
            </div>
            {queue.map((text, index) => (
              <div key={index} className="queue-item">
                <span className="queue-index">{index + 1}.</span>
                <span className="queue-text">{text}</span>
                <button
                  className="queue-cancel"
                  onClick={() => onCancelQueue(index)}
                  title="移除此条"
                >
                  <Icon name="close" size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="input-hints ui-font">
          <div className="input-shortcuts">
            <PersonalityPicker onSend={onSend} />
            {onRunBackground && (
              <button
                type="button"
                className="bg-run-btn ui-font"
                onClick={submitBackground}
                disabled={!isTyping}
                title="把当前输入作为独立任务在后台运行（不影响当前会话）"
              >
                <Icon name="bot" size={13} />
                后台运行
                {bgRunningCount > 0 && (
                  <span className="bg-run-badge">{bgRunningCount}</span>
                )}
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
