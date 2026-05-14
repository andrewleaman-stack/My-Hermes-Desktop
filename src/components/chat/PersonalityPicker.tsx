import { useState, useEffect, useRef } from "react";
import Icon, { type IconName } from "../Icon";

interface Personality {
  id: string;
  name: string;
  icon: IconName;
  description: string;
  /** 用于切换时发送给模型的自然语言提示词（一次性进程模式下，slash 命令不会被 CLI 路由，必须改用自然语言）*/
  prompt: string;
}

const PERSONALITIES: Personality[] = [
  {
    id: "helpful", name: "助手", icon: "bot",
    description: "均衡、专业，默认人格",
    prompt: "从现在起请恢复默认的助手风格回答接下来的对话：均衡、专业、信息密度适中。",
  },
  {
    id: "concise", name: "简洁", icon: "scissors",
    description: "极简回复，少废话",
    prompt: "从现在起请以极简风格回答接下来的对话：直接给结论，不寒暄，不复述问题，能一句说清绝不两句。",
  },
  {
    id: "mentor", name: "导师", icon: "graduation",
    description: "耐心引导，提问式启发",
    prompt: "从现在起请以导师风格回答接下来的对话：耐心引导、用反问启发我自己思考、不要直接给出最终答案。",
  },
  {
    id: "engineer", name: "工程师", icon: "code",
    description: "直击代码与实现细节",
    prompt: "从现在起请以高级工程师风格回答接下来的对话：直接讨论代码、实现细节与可执行步骤，必要时给出代码块，避免空话。",
  },
  {
    id: "scholar", name: "学者", icon: "book",
    description: "严谨、引经据典",
    prompt: "从现在起请以学者风格回答接下来的对话：严谨、引用来源（可标注 [来源]）、给出原理与背景，避免主观断言。",
  },
  {
    id: "creative", name: "创意", icon: "palette",
    description: "天马行空、富有想象力",
    prompt: "从现在起请以创意者风格回答接下来的对话：天马行空、敢于发散、给出多个非常规视角，鼓励比喻和类比。",
  },
  {
    id: "skeptic", name: "质疑者", icon: "search",
    description: "挑战假设、找漏洞",
    prompt: "从现在起请以质疑者风格回答接下来的对话：先挑战我的假设、列出反例与潜在风险，再给建议。",
  },
  {
    id: "pirate", name: "海盗", icon: "flag",
    description: "海盗腔调，趣味放松",
    prompt: "从现在起请以海盗腔调回答接下来的对话：风格粗犷诙谐，多用航海术语和 'Arrr'，但回答内容仍要正确。",
  },
];

const STORAGE_KEY = "hermes-personality";
const DEFAULT_ID = "helpful";

interface Props {
  onSend: (text: string) => void;
}

function loadPersonality(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) || DEFAULT_ID;
  } catch {
    return DEFAULT_ID;
  }
}

export default function PersonalityPicker({ onSend }: Props) {
  const [current, setCurrent] = useState<string>(loadPersonality);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, current);
    } catch {
      /* ignore */
    }
  }, [current]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const currentPersona = PERSONALITIES.find((p) => p.id === current) ?? PERSONALITIES[0];
  const isDefault = current === DEFAULT_ID;

  const sendPrompt = (id: string) => {
    const persona = PERSONALITIES.find((p) => p.id === id);
    if (persona) onSend(persona.prompt);
  };

  const select = (id: string) => {
    setOpen(false);
    if (id === current) return;
    setCurrent(id);
    sendPrompt(id);
  };

  const reset = () => {
    if (current === DEFAULT_ID) return;
    setCurrent(DEFAULT_ID);
    sendPrompt(DEFAULT_ID);
  };

  return (
    <div className="personality-picker" ref={ref}>
      <button
        className="personality-trigger"
        onClick={() => setOpen((o) => !o)}
        title={`当前人格：${currentPersona.name}`}
        aria-label="切换人格"
      >
        <span className="personality-trigger-icon">
          <Icon name={currentPersona.icon} size={13} />
        </span>
        <span>人格</span>
      </button>

      {open && (
        <div className="personality-popover">
          <div className="personality-popover-header ui-font">选择人格</div>
          <div className="personality-grid">
            {PERSONALITIES.map((p) => (
              <button
                key={p.id}
                className={`personality-card personality-card-${p.id}${p.id === current ? " active" : ""}`}
                onClick={() => select(p.id)}
              >
                <span className="personality-card-icon" aria-hidden="true">
                  <Icon name={p.icon} size={18} />
                </span>
                <span className="personality-card-copy">
                  <span className="personality-card-name ui-font">{p.name}</span>
                  <span className="personality-card-desc">{p.description}</span>
                </span>
                {p.id === current && <Icon name="check" size={14} className="personality-card-check" />}
              </button>
            ))}
          </div>
          <div className="personality-popover-hint">
            当前 <span>{currentPersona.name}</span>
          </div>
        </div>
      )}

      {!isDefault && (
        <div className="personality-current-tag ui-font">
          <Icon name={currentPersona.icon} size={12} />
          <span className="personality-current-name">{currentPersona.name}</span>
          <button
            className="personality-current-clear"
            onClick={reset}
            title="重置为默认"
          >
            <Icon name="close" size={11} />
          </button>
        </div>
      )}
    </div>
  );
}
