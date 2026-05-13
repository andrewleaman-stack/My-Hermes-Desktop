import { useState, useRef, useEffect } from "react";

const MODEL_GROUPS = [
  {
    provider: "anthropic",
    models: ["claude-opus-4", "claude-sonnet-4", "claude-haiku-4-5"],
  },
  {
    provider: "openrouter",
    models: [
      "google/gemini-2.5-pro",
      "deepseek/deepseek-r1",
      "meta-llama/llama-3.3-70b-instruct",
    ],
  },
];

interface Props {
  currentModel: string | undefined;
  onSendMessage: (text: string) => void;
}

export default function ModelPicker({ currentModel, onSendMessage }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [custom, setCustom] = useState("");
  const ref = useRef<HTMLDivElement>(null);

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

  const handleSelect = (provider: string, model: string) => {
    onSendMessage(`/model ${provider}:${model}`);
    setOpen(false);
    setSearch("");
  };

  const handleCustom = () => {
    const val = custom.trim();
    if (!val) return;
    onSendMessage(`/model ${val}`);
    setOpen(false);
    setCustom("");
  };

  const q = search.toLowerCase();
  const filtered = MODEL_GROUPS.map((g) => ({
    ...g,
    models: g.models.filter(
      (m) => !q || m.includes(q) || g.provider.includes(q)
    ),
  })).filter((g) => g.models.length > 0);

  return (
    <div className="model-picker" ref={ref}>
      <button
        className="model-picker-btn"
        onClick={() => setOpen((o) => !o)}
        title="切换模型"
      >
        <span className="model-picker-label">{currentModel || "—"}</span>
        <svg
          className="model-picker-chevron"
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
        >
          <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="model-picker-dropdown">
          <input
            className="model-picker-search"
            placeholder="搜索模型..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
            autoFocus
          />

          <div className="model-picker-list">
            {filtered.map((group) => (
              <div key={group.provider} className="model-picker-group">
                <div className="model-picker-group-label">{group.provider}</div>
                {group.models.map((model) => {
                  const isCurrent =
                    currentModel === `${group.provider}:${model}` ||
                    currentModel?.endsWith(model);
                  return (
                    <button
                      key={model}
                      className={`model-picker-item${isCurrent ? " active" : ""}`}
                      onClick={() => handleSelect(group.provider, model)}
                    >
                      <span className="model-picker-check">
                        {isCurrent ? "●" : ""}
                      </span>
                      {model}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

          <div className="model-picker-custom">
            <input
              className="model-picker-search"
              placeholder="自定义: provider:model"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCustom();
                if (e.key === "Escape") setOpen(false);
              }}
            />
            <button
              className="btn-confirm ui-font"
              onClick={handleCustom}
              disabled={!custom.trim()}
              style={{ height: 28, padding: "0 12px", fontSize: 12 }}
            >
              切换
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
