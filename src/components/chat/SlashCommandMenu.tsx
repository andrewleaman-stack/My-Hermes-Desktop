import { useEffect, useRef } from "react";

export interface SlashCommand {
  command: string;
  description: string;
  group: string;
  args?: string;
  directSend?: boolean;
}

export const SLASH_COMMANDS: SlashCommand[] = [
  // Session
  { command: "/new",        description: "New Session",                group: "Session",       directSend: true },
  { command: "/branch",     description: "Branch the current conversation to explore a different direction", group: "Session",       args: "[name]" },
  { command: "/title",      description: "Rename the current session",            group: "Session",       args: "[name]" },
  { command: "/save",       description: "Save the current conversation",              group: "Session",       directSend: true },
  // Context
  { command: "/compress",   description: "Compress context (save tokens)",  group: "Context",     args: "[focus]" },
  { command: "/retry",      description: "Retry the previous message",            group: "Context",     directSend: true },
  { command: "/undo",       description: "Undo the previous chat round",            group: "Context",     directSend: true },
  // Goals & Tasks
  { command: "/goal",       description: "Set persistent goal",              group: "Goals & Tasks", args: "[text | pause | resume | clear | status]" },
  { command: "/subgoal",    description: "Add a sub-goal condition",            group: "Goals & Tasks", args: "[text | remove N | clear]" },
  { command: "/background", description: "Run task in background",              group: "Goals & Tasks", args: "<prompt>" },
  { command: "/queue",      description: "Queue the next message",            group: "Goals & Tasks", args: "<prompt>" },
  // Snapshots
  { command: "/snapshot",   description: "Save or restore state snapshots",        group: "Snapshots",       args: "[create | restore <id> | prune]" },
  { command: "/rollback",   description: "Roll back file changes",              group: "Snapshots",       args: "[number]" },
  // Info
  { command: "/status",     description: "View current session info",          group: "Info",       directSend: true },
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
