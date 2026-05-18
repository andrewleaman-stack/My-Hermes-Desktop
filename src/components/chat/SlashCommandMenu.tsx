import { useEffect, useRef } from "react";

export interface SlashCommand {
  command: string;
  description: string;
  group: string;
  args?: string;
  directSend?: boolean;
}

export const SLASH_COMMANDS: SlashCommand[] = [
  // 会话
  { command: "/new",        description: "新建会话",                group: "会话",       directSend: true },
  { command: "/branch",     description: "分支当前对话，探索不同方向", group: "会话",       args: "[name]" },
  { command: "/title",      description: "重命名当前会话",            group: "会话",       args: "[name]" },
  { command: "/save",       description: "保存当前对话",              group: "会话",       directSend: true },
  // 上下文
  { command: "/compress",   description: "压缩上下文（节省 token）",  group: "上下文",     args: "[focus]" },
  { command: "/retry",      description: "重试上一条消息",            group: "上下文",     directSend: true },
  { command: "/undo",       description: "撤销上一轮对话",            group: "上下文",     directSend: true },
  // 目标与任务
  { command: "/goal",       description: "设置持久目标",              group: "目标与任务", args: "[text | pause | resume | clear | status]" },
  { command: "/subgoal",    description: "添加子目标条件",            group: "目标与任务", args: "[text | remove N | clear]" },
  { command: "/background", description: "后台运行任务",              group: "目标与任务", args: "<prompt>" },
  { command: "/queue",      description: "排队下一条消息",            group: "目标与任务", args: "<prompt>" },
  // 快照
  { command: "/snapshot",   description: "保存或恢复状态快照",        group: "快照",       args: "[create | restore <id> | prune]" },
  { command: "/rollback",   description: "回滚文件变更",              group: "快照",       args: "[number]" },
  // 信息
  { command: "/status",     description: "查看当前会话信息",          group: "信息",       directSend: true },
];

interface Props {
  items: SlashCommand[];
  selectedIndex: number;
  onSelect: (cmd: SlashCommand) => void;
}

export default function SlashCommandMenu({ items, selectedIndex, onSelect }: Props) {
  const selectedRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  if (items.length === 0) return null;

  const groups = Array.from(new Set(items.map((c) => c.group)));
  let globalIdx = 0;

  return (
    <div className="slash-menu">
      {groups.map((group) => {
        const cmds = items.filter((c) => c.group === group);
        return (
          <div key={group} className="slash-menu-section">
            <div className="slash-menu-group">{group}</div>
            {cmds.map((cmd) => {
              const idx = globalIdx++;
              const isSelected = idx === selectedIndex;
              return (
                <button
                  key={cmd.command}
                  ref={isSelected ? selectedRef : null}
                  className={`slash-menu-item${isSelected ? " selected" : ""}`}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault(); // keep textarea focus
                    onSelect(cmd);
                  }}
                >
                  <span className="slash-menu-cmd">{cmd.command}</span>
                  {cmd.args && <span className="slash-menu-args">{cmd.args}</span>}
                  <span className="slash-menu-desc">{cmd.description}</span>
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
