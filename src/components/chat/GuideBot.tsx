import { useState, useEffect } from "react";
import type { Message } from "../../types";

import aprilAnnoyed from "../../assets/images/guidebot/april-v4/annoyed.png";
import aprilCelebrate from "../../assets/images/guidebot/april-v4/celebrate.png";
import aprilConfused from "../../assets/images/guidebot/april-v4/confused.png";
import aprilError from "../../assets/images/guidebot/april-v4/error.png";
import aprilExcited from "../../assets/images/guidebot/april-v4/excited.png";
import aprilHeartHands from "../../assets/images/guidebot/april-v4/heart_hands.png";
import aprilIdle0 from "../../assets/images/guidebot/april-v4/idle_0.png";
import aprilIdle1 from "../../assets/images/guidebot/april-v4/idle_1.png";
import aprilLove from "../../assets/images/guidebot/april-v4/love.png";
import aprilPeace from "../../assets/images/guidebot/april-v4/peace.png";
import aprilResponding0 from "../../assets/images/guidebot/april-v4/responding_0.png";
import aprilResponding1 from "../../assets/images/guidebot/april-v4/responding_1.png";
import aprilSad from "../../assets/images/guidebot/april-v4/sad.png";
import aprilShrug from "../../assets/images/guidebot/april-v4/shrug.png";
import aprilShush from "../../assets/images/guidebot/april-v4/shush.png";
import aprilShy from "../../assets/images/guidebot/april-v4/shy.png";
import aprilSleepy0 from "../../assets/images/guidebot/april-v4/sleepy_0.png";
import aprilSleepy1 from "../../assets/images/guidebot/april-v4/sleepy_1.png";
import aprilSmug from "../../assets/images/guidebot/april-v4/smug.png";
import aprilSuccess from "../../assets/images/guidebot/april-v4/success.png";
import aprilSurprised from "../../assets/images/guidebot/april-v4/surprised.png";
import aprilTalk0 from "../../assets/images/guidebot/april-v4/talk_0.png";
import aprilTalk1 from "../../assets/images/guidebot/april-v4/talk_1.png";
import aprilThinking0 from "../../assets/images/guidebot/april-v4/thinking_0.png";
import aprilThinking1 from "../../assets/images/guidebot/april-v4/thinking_1.png";
import aprilThinkingHand from "../../assets/images/guidebot/april-v4/thinking_hand.png";
import aprilThumbsUp from "../../assets/images/guidebot/april-v4/thumbs_up.png";
import aprilTool0 from "../../assets/images/guidebot/april-v4/tool_0.png";
import aprilTool1 from "../../assets/images/guidebot/april-v4/tool_1.png";
import aprilWave from "../../assets/images/guidebot/april-v4/wave.png";

export type GuideBotAppearance = "classic" | "voxel" | "anime" | "cyber" | "pod" | "april-v4";
export type GuideBotSize = "small" | "medium" | "large" | "x-large";
export type GuideBotDisplay = "dock" | "companion";

export const GUIDE_BOT_DISPLAYS: Array<{
  id: GuideBotDisplay;
  name: string;
  description: string;
}> = [
  { id: "dock", name: "Dock", description: "April sits beside the composer with a compact status line" },
  { id: "companion", name: "Companion", description: "Large April above the composer, speaking replies in a speech bubble" },
];

export const GUIDE_BOT_SIZES: Array<{
  id: GuideBotSize;
  name: string;
  description: string;
}> = [
  { id: "small", name: "Small", description: "Tiny desk gremlin" },
  { id: "medium", name: "Medium", description: "Current size" },
  { id: "large", name: "Large", description: "More visible" },
  { id: "x-large", name: "X-Large", description: "Maximum April. Questionable power." },
];

export const GUIDE_BOT_APPEARANCES: Array<{
  id: GuideBotAppearance;
  name: string;
  description: string;
}> = [
  { id: "classic", name: "Classic Screen", description: "The original lightweight, restrained composer-side guide" },
  { id: "voxel", name: "Voxel Block", description: "Blocky shell with a stronger toy-like feel and crisp screen" },
  { id: "anime", name: "Anime Companion", description: "Manga/game style with friendlier, more visible expressions" },
  { id: "cyber", name: "Cyber Armor", description: "More aggressive futuristic tech with neon contours" },
  { id: "pod", name: "Heartbeat Pod", description: "Round-screen pod form; quiet, professional, medical-instrument feel" },
  { id: "april-v4", name: "April v4", description: "Deadpan chibi April with lifecycle states, talking animation, and reaction moods" },
];

const GUIDE_BOT_APPEARANCE_KEY = "hermes.guideBot.appearance";
const GUIDE_BOT_APPEARANCE_VERSION_KEY = "hermes.guideBot.appearanceVersion";
const GUIDE_BOT_APPEARANCE_EVENT = "hermes-guide-bot-appearance";
const GUIDE_BOT_SIZE_KEY = "hermes.guideBot.size";
const GUIDE_BOT_SIZE_EVENT = "hermes-guide-bot-size";
const GUIDE_BOT_DISPLAY_KEY = "hermes.guideBot.display";
const GUIDE_BOT_DISPLAY_EVENT = "hermes-guide-bot-display";
const GUIDE_BOT_DISPLAY_IDS = GUIDE_BOT_DISPLAYS.map((item) => item.id);
const GUIDE_BOT_APPEARANCE_IDS = GUIDE_BOT_APPEARANCES.map((item) => item.id);
const GUIDE_BOT_SIZE_IDS = GUIDE_BOT_SIZES.map((item) => item.id);

function readGuideBotAppearance(): GuideBotAppearance {
  try {
    const version = window.localStorage.getItem(GUIDE_BOT_APPEARANCE_VERSION_KEY);
    if (version !== "april-v4") {
      window.localStorage.setItem(GUIDE_BOT_APPEARANCE_KEY, "april-v4");
      window.localStorage.setItem(GUIDE_BOT_APPEARANCE_VERSION_KEY, "april-v4");
      return "april-v4";
    }
    const saved = window.localStorage.getItem(GUIDE_BOT_APPEARANCE_KEY) as GuideBotAppearance | null;
    return saved && GUIDE_BOT_APPEARANCE_IDS.includes(saved) ? saved : "april-v4";
  } catch {
    return "april-v4";
  }
}

export function useGuideBotAppearance() {
  const [appearance, setAppearanceState] = useState<GuideBotAppearance>(readGuideBotAppearance);

  useEffect(() => {
    const handleChange = () => setAppearanceState(readGuideBotAppearance());
    window.addEventListener(GUIDE_BOT_APPEARANCE_EVENT, handleChange);
    window.addEventListener("storage", handleChange);
    return () => {
      window.removeEventListener(GUIDE_BOT_APPEARANCE_EVENT, handleChange);
      window.removeEventListener("storage", handleChange);
    };
  }, []);

  const setAppearance = (next: GuideBotAppearance) => {
    try {
      window.localStorage.setItem(GUIDE_BOT_APPEARANCE_KEY, next);
      window.localStorage.setItem(GUIDE_BOT_APPEARANCE_VERSION_KEY, "april-v4");
    } catch {}
    setAppearanceState(next);
    window.dispatchEvent(new CustomEvent(GUIDE_BOT_APPEARANCE_EVENT));
  };

  return { appearance, setAppearance };
}

function readGuideBotSize(): GuideBotSize {
  try {
    const saved = window.localStorage.getItem(GUIDE_BOT_SIZE_KEY) as GuideBotSize | null;
    return saved && GUIDE_BOT_SIZE_IDS.includes(saved) ? saved : "medium";
  } catch {
    return "medium";
  }
}

export function useGuideBotSize() {
  const [size, setSizeState] = useState<GuideBotSize>(readGuideBotSize);

  useEffect(() => {
    const handleChange = () => setSizeState(readGuideBotSize());
    window.addEventListener(GUIDE_BOT_SIZE_EVENT, handleChange);
    window.addEventListener("storage", handleChange);
    return () => {
      window.removeEventListener(GUIDE_BOT_SIZE_EVENT, handleChange);
      window.removeEventListener("storage", handleChange);
    };
  }, []);

  const setSize = (next: GuideBotSize) => {
    try {
      window.localStorage.setItem(GUIDE_BOT_SIZE_KEY, next);
    } catch {}
    setSizeState(next);
    window.dispatchEvent(new CustomEvent(GUIDE_BOT_SIZE_EVENT));
  };

  return { size, setSize };
}

function readGuideBotDisplay(): GuideBotDisplay {
  try {
    const saved = window.localStorage.getItem(GUIDE_BOT_DISPLAY_KEY) as GuideBotDisplay | null;
    return saved && GUIDE_BOT_DISPLAY_IDS.includes(saved) ? saved : "dock";
  } catch {
    return "dock";
  }
}

export function useGuideBotDisplay() {
  const [display, setDisplayState] = useState<GuideBotDisplay>(readGuideBotDisplay);

  useEffect(() => {
    const handleChange = () => setDisplayState(readGuideBotDisplay());
    window.addEventListener(GUIDE_BOT_DISPLAY_EVENT, handleChange);
    window.addEventListener("storage", handleChange);
    return () => {
      window.removeEventListener(GUIDE_BOT_DISPLAY_EVENT, handleChange);
      window.removeEventListener("storage", handleChange);
    };
  }, []);

  const setDisplay = (next: GuideBotDisplay) => {
    try {
      window.localStorage.setItem(GUIDE_BOT_DISPLAY_KEY, next);
    } catch {}
    setDisplayState(next);
    window.dispatchEvent(new CustomEvent(GUIDE_BOT_DISPLAY_EVENT));
  };

  return { display, setDisplay };
}

type GuideMood =
  | "blink"
  | "sleep"
  | "heartbeat"
  | "ok"
  | "pulse"
  | "error"
  | "typing"
  | "alert"
  | "success"
  | "tool"
  | "waiting"
  | "annoyed"
  | "confused"
  | "surprised"
  | "smug"
  | "shy"
  | "love"
  | "sad"
  | "shrug"
  | "shush"
  | "excited"
  | "celebrate"
  | "peace"
  | "heart_hands";

interface GuideAction {
  label: string;
  onClick: () => void;
}

interface Props {
  messages: Message[];
  streaming: boolean;
  queue: string[];
  error: string | null;
  hasSession: boolean;
  contextPct?: number;
  longTask?: boolean;
  isTyping?: boolean;
  justFinished?: boolean;
  onFocusInput: () => void;
  onRetryLastMessage: () => void;
  onCompress?: () => void;
  onSetGoal?: () => void;
}

const APRIL_V4_REACTION_FRAMES: Partial<Record<GuideMood, string>> = {
  ok: aprilThumbsUp,
  pulse: aprilWave,
  error: aprilError,
  alert: aprilSurprised,
  success: aprilSuccess,
  waiting: aprilAnnoyed,
  annoyed: aprilAnnoyed,
  confused: aprilConfused,
  surprised: aprilSurprised,
  smug: aprilSmug,
  shy: aprilShy,
  love: aprilLove,
  sad: aprilSad,
  shrug: aprilShrug,
  shush: aprilShush,
  excited: aprilExcited,
  celebrate: aprilCelebrate,
  peace: aprilPeace,
  heart_hands: aprilHeartHands,
  typing: aprilThinkingHand,
};

function getAprilV4Frame(mood: GuideMood, blinkOn: boolean, talkFrame: number): string {
  if (mood === "blink") return blinkOn ? aprilIdle1 : aprilIdle0;
  if (mood === "sleep") return blinkOn ? aprilSleepy1 : aprilSleepy0;
  if (mood === "heartbeat") return talkFrame === 0 ? aprilTalk0 : aprilTalk1;
  if (mood === "tool") return blinkOn ? aprilTool1 : aprilTool0;
  if (mood === "typing") return aprilThinkingHand;
  return APRIL_V4_REACTION_FRAMES[mood] ?? aprilIdle0;
}

export function GuideBotAvatar({
  mood,
  appearance = "classic",
  size,
}: {
  mood: GuideMood;
  appearance?: GuideBotAppearance;
  size?: GuideBotSize;
}) {
  const [blinkOn, setBlinkOn] = useState(false);
  const [talkFrame, setTalkFrame] = useState(0);
  const { size: savedSize } = useGuideBotSize();
  const avatarSize = size ?? savedSize;

  useEffect(() => {
    if (appearance !== "april-v4" || !["blink", "tool"].includes(mood)) {
      setBlinkOn(false);
      return;
    }

    let timeout: number | undefined;
    let cancelled = false;
    const scheduleBlink = () => {
      timeout = window.setTimeout(() => {
        if (cancelled) return;
        setBlinkOn(true);
        window.setTimeout(() => {
          if (!cancelled) setBlinkOn(false);
        }, 140);
        scheduleBlink();
      }, 3200 + Math.random() * 1800);
    };

    scheduleBlink();
    return () => {
      cancelled = true;
      if (timeout !== undefined) window.clearTimeout(timeout);
    };
  }, [appearance, mood]);

  useEffect(() => {
    if (appearance !== "april-v4" || mood !== "heartbeat") {
      setTalkFrame(0);
      return;
    }
    const interval = window.setInterval(() => setTalkFrame((frame) => (frame === 0 ? 1 : 0)), 190);
    return () => window.clearInterval(interval);
  }, [appearance, mood]);

  if (appearance === "april-v4") {
    const frame = getAprilV4Frame(mood, blinkOn, talkFrame);
    return (
      <div className={`guide-bot-avatar guide-bot-avatar-april-v4 guide-bot-size-${avatarSize} guide-bot-${mood}`} aria-hidden="true">
        <span className="guide-bot-v4-frame">
          <img className="guide-bot-v4-img" src={frame} alt="" draggable={false} />
          {mood === "sleep" && (
            <span className="guide-bot-v4-zzz">
              <span>z</span>
              <span>z</span>
              <span>z</span>
            </span>
          )}
        </span>
      </div>
    );
  }

  return (
    <div
      className={`guide-bot-avatar guide-bot-avatar-${appearance} guide-bot-${mood}`}
      aria-hidden="true"
    >
      <div className="guide-bot-antenna" />
      <div className="guide-bot-head">
        <div className="guide-bot-screen">
          <div className="guide-bot-pixel-grid" />
          <div className="guide-face guide-face-eyes">
            <span className="guide-eye guide-eye-left" />
            <span className="guide-eye guide-eye-right" />
            <span className="guide-mouth" />
          </div>
          <div className="guide-face guide-face-sleep">
            <span>Z</span>
            <span>Z</span>
            <span>Z</span>
          </div>
          <div className="guide-face guide-face-heartbeat">
            <svg viewBox="0 0 42 18" role="presentation">
              <path d="M2 10h8l4-6 5 12 5-9 4 3h12" />
            </svg>
          </div>
          <div className="guide-face guide-face-ok">OK</div>
          <div className="guide-face guide-face-pulse">
            <span />
            <span />
          </div>
          <div className="guide-face guide-face-error">!</div>
          <div className="guide-face guide-face-typing">
            <span className="guide-typing-eye guide-typing-eye-left" />
            <span className="guide-typing-eye guide-typing-eye-right" />
            <span className="guide-typing-mouth" />
          </div>
          <div className="guide-face guide-face-alert">
            <span className="guide-alert-eye guide-alert-eye-left" />
            <span className="guide-alert-eye guide-alert-eye-right" />
            <span className="guide-alert-mouth" />
          </div>
          <div className="guide-face guide-face-success">✓</div>
        </div>
      </div>
      <div className="guide-bot-base" />
    </div>
  );
}

function getGuideState({
  messages,
  streaming,
  queue,
  error,
  hasSession,
  contextPct,
  longTask,
  isTyping,
  showSuccess,
  onFocusInput,
  onRetryLastMessage,
  onCompress,
  onSetGoal,
}: Props & { showSuccess: boolean }): {
  mood: GuideMood;
  text: string;
  actions: GuideAction[];
} {
  // 1. error
  if (error) {
    const canRetry = messages.some((message) => message.role === "assistant");
    return {
      mood: "error",
      text: "This run hit a problem. Check the error first.",
      actions: [
        canRetry
          ? { label: "Retry", onClick: onRetryLastMessage }
          : { label: "Keep typing", onClick: onFocusInput },
      ],
    };
  }

  // 2. alert — idle but with actionable suggestion
  if (!streaming && contextPct !== undefined && contextPct >= 0.7) {
    return {
      mood: "alert",
      text: `Context is at ${Math.round(contextPct * 100)}%. Compress before this becomes soup.`,
      actions: [{ label: "Compress", onClick: onCompress ?? onFocusInput }],
    };
  }

  if (!streaming && longTask) {
    return {
      mood: "alert",
      text: "This task is getting long. Want to turn it into a standing goal?",
      actions: [{ label: "Set goal", onClick: onSetGoal ?? onFocusInput }],
    };
  }

  // 3. ok — streaming with queue
  if (streaming && queue.length > 0) {
    return {
      mood: "ok",
      text: `${queue.length} message${queue.length === 1 ? "" : "s"} queued. I’ll send them after this turn finishes.`,
      actions: [{ label: "Keep typing", onClick: onFocusInput }],
    };
  }

  // 4. heartbeat — streaming
  if (streaming) {
    return {
      mood: "heartbeat",
      text: "Hermes is working. You can keep typing; I’ll queue it for the next turn.",
      actions: [{ label: "Keep typing", onClick: onFocusInput }],
    };
  }

  // 5. success — just finished streaming
  if (showSuccess) {
    return {
      mood: "success",
      text: "Got the result.",
      actions: [],
    };
  }

  // 6. typing — user is typing
  if (isTyping) {
    return {
      mood: "typing",
      text: "Listening. Press Enter when you’re done.",
      actions: [],
    };
  }

  // 7. blink/pulse — empty session
  if (messages.length === 0) {
    return {
      mood: hasSession ? "pulse" : "blink",
      text: hasSession
        ? "This session is still quiet. Type naturally to continue."
        : "Type naturally to start. I’ll prompt the next step here.",
      actions: [{ label: "Start typing", onClick: onFocusInput }],
    };
  }

  // 8. sleep — quiet idle
  return {
    mood: "sleep",
    text: "Standing by. I’ll speak up when queueing, compression, or retry matters.",
    actions: [],
  };
}

function getMessageText(message: Message | undefined): string {
  if (!message) return "";
  return message.blocks
    .map((block) => (block.type === "text" || block.type === "think" ? block.content : ""))
    .join(" ")
    .trim();
}

// Tail of the reply currently being streamed, flattened to plain speech-bubble
// text (markdown markers stripped). Empty when nothing is streaming yet.
function getStreamingTail(messages: Message[], maxChars = 220): string {
  const last = [...messages]
    .reverse()
    .find((m) => m.role === "assistant" && m.status === "streaming");
  if (!last) return "";
  const text = last.blocks
    .map((block) => (block.type === "text" ? block.content : ""))
    .join(" ")
    .replace(/```[a-z]*\n?/gi, " ")
    .replace(/[`#*_>|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "";
  return text.length > maxChars ? `…${text.slice(-maxChars)}` : text;
}

function reactionMoodFromUserText(text: string): GuideMood | null {
  const normalized = text.toLowerCase();
  if (/(thanks|thank you|appreciate|good job|nice work|awesome|perfect)/.test(normalized)) return "smug";
  if (/(stop|pause|hold|quiet|shush)/.test(normalized)) return "shush";
  if (/(what|huh|confused|lost|unclear|not sure)/.test(normalized)) return "confused";
  if (/(yes|yep|approved|go ahead|do it|continue)/.test(normalized)) return "ok";
  return null;
}


export default function GuideBot(props: Props) {
  const [showSuccess, setShowSuccess] = useState(false);
  const [reactionMood, setReactionMood] = useState<GuideMood | null>(null);
  const { appearance: savedAppearance } = useGuideBotAppearance();
  const { display } = useGuideBotDisplay();
  // Companion mode is April herself — the frame art carries the feature, so
  // other shell appearances fall back to the april-v4 frames there.
  const appearance = display === "companion" ? "april-v4" : savedAppearance;

  useEffect(() => {
    if (props.justFinished && !showSuccess) {
      setShowSuccess(true);
      const timer = setTimeout(() => setShowSuccess(false), 1500);
      return () => clearTimeout(timer);
    }
  }, [props.justFinished]);

  useEffect(() => {
    if (props.streaming || props.error) return;
    const lastUser = [...props.messages].reverse().find((message) => message.role === "user");
    const mood = reactionMoodFromUserText(getMessageText(lastUser));
    if (!mood) return;
    setReactionMood(mood);
    const timer = window.setTimeout(() => setReactionMood(null), 1600);
    return () => window.clearTimeout(timer);
  }, [props.messages.length, props.streaming, props.error]);

  const state = getGuideState({ ...props, showSuccess });
  const canUseReaction = appearance === "april-v4" && ["blink", "sleep", "typing"].includes(state.mood);
  const effectiveMood = canUseReaction && reactionMood ? reactionMood : state.mood;

  // Companion mode: while streaming, April "speaks" the tail of the live reply
  // instead of the generic working line. The transcript stays canonical.
  const streamingTail =
    display === "companion" && props.streaming ? getStreamingTail(props.messages) : "";
  const bubbleText = streamingTail || state.text;

  return (
    <div
      className={`guide-bot guide-bot-${effectiveMood} guide-bot-display-${display}`}
      aria-live="polite"
    >
      <GuideBotAvatar mood={effectiveMood} appearance={appearance} />

      <div className="guide-bot-bubble">
        <span className="guide-bot-text">{bubbleText}</span>
        {state.actions.length > 0 && (
          <span className="guide-bot-actions">
            {state.actions.map((action) => (
              <button
                key={action.label}
                type="button"
                className="guide-bot-action"
                onClick={action.onClick}
              >
                {action.label}
              </button>
            ))}
          </span>
        )}
      </div>
    </div>
  );
}
