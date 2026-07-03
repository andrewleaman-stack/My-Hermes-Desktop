import { useState, useEffect, useRef } from "react";
import Icon, { type IconName } from "../Icon";

interface Personality {
  id: string;
  name: string;
  icon: IconName;
  description: string;
  /** Natural-language prompt sent to the model when switching personalities. In single-process mode, slash commands are not routed by the CLI, so natural language is required.*/
  prompt: string;
}

const PERSONALITIES: Personality[] = [
  {
    id: "helpful", name: "Assistant", icon: "bot",
    description: "Balanced, professional, default personality",
    prompt: "From now on, answer the next messages in the default assistant style: balanced, professional, and moderately information-dense.",
  },
  {
    id: "concise", name: "Concise", icon: "scissors",
    description: "Minimal replies, less fluff",
    prompt: "From now on, answer the next messages in a minimal style: give the conclusion directly, no greetings, no restating the question, and never use two sentences when one will do.",
  },
  {
    id: "mentor", name: "Mentor", icon: "graduation",
    description: "Patient guidance with Socratic prompts",
    prompt: "From now on, answer the next messages in a mentor style: guide patiently, use questions to help me think, and avoid giving the final answer immediately.",
  },
  {
    id: "engineer", name: "Engineer", icon: "code",
    description: "Focused on code and implementation details",
    prompt: "From now on, answer the next messages in a senior engineer style: discuss code, implementation details, and executable steps directly. Include code blocks when useful and avoid empty talk.",
  },
  {
    id: "scholar", name: "Scholar", icon: "book",
    description: "Rigorous and source-aware",
    prompt: "From now on, answer the next messages in a scholar style: be rigorous, cite sources when possible using [source], explain principles and background, and avoid unsupported claims.",
  },
  {
    id: "creative", name: "Creative", icon: "palette",
    description: "Imaginative and divergent",
    prompt: "From now on, answer the next messages in a creative style: think divergently, offer multiple unconventional angles, and use metaphors and analogies.",
  },
  {
    id: "skeptic", name: "Skeptic", icon: "search",
    description: "Challenges assumptions and finds holes",
    prompt: "From now on, answer the next messages in a skeptic style: challenge my assumptions first, list counterexamples and risks, then give recommendations.",
  },
  {
    id: "pirate", name: "Pirate", icon: "flag",
    description: "Pirate voice, playful and relaxed",
    prompt: "From now on, answer the next messages in a pirate voice: rough, funny, full of nautical terms and 'Arrr', while keeping the content correct.",
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
        title={`Current personality: ${currentPersona.name}`}
        aria-label="Switch personality"
      >
        <span className="personality-trigger-icon">
          <Icon name={currentPersona.icon} size={13} />
        </span>
        <span>Personality</span>
      </button>

      {open && (
        <div className="personality-popover">
          <div className="personality-popover-header ui-font">Choose Personality</div>
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
            Current <span>{currentPersona.name}</span>
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
            title="Reset to default"
          >
            <Icon name="close" size={11} />
          </button>
        </div>
      )}
    </div>
  );
}
