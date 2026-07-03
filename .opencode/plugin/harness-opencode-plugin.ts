// OpenCode harness plugin equivalent to Claude Code SessionStart and Stop hooks.
// Installed automatically by install.sh into .opencode/plugin/.
// Loaded automatically by OpenCode; no manual action required.

export const HarnessOpenCodePlugin = {
  name: "harness-opencode-plugin",
  description: "Loads harness context at session start and reminds agents to close sessions cleanly.",
};

export default HarnessOpenCodePlugin;
