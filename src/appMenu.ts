import type { PlatformKind } from "./utils/platform";
import { shouldShowWindowMenu } from "./utils/platform";

export type AppMenuAction =
  | "new-session"
  | "open-chat"
  | "open-memory"
  | "open-files"
  | "open-dashboard"
  | "open-settings"
  | "toggle-terminal"
  | "toggle-snapshot"
  | "show-shortcuts"
  | "stop-agent"
  | "hide-window"
  | "quit";

export interface AppMenuItem {
  label: string;
  action?: AppMenuAction;
  shortcut?: string;
}

export interface AppMenuSection {
  label: string;
  items: AppMenuItem[];
}

export const APP_MENU: AppMenuSection[] = [
  {
    label: "Files",
    items: [
      { label: "New Session", action: "new-session", shortcut: "Ctrl+N" },
      { label: "Save Snapshot", action: "toggle-snapshot" },
      { label: "Quit", action: "quit" },
    ],
  },
  {
    label: "Edit",
    items: [
      { label: "Stop Running", action: "stop-agent" },
      { label: "Shortcuts", action: "show-shortcuts", shortcut: "Ctrl+/" },
    ],
  },
  {
    label: "View",
    items: [
      { label: "Chat", action: "open-chat" },
      { label: "Memory", action: "open-memory" },
      { label: "File Tree", action: "open-files" },
      { label: "Dashboard", action: "open-dashboard" },
      { label: "Settings", action: "open-settings" },
      { label: "Terminal", action: "toggle-terminal" },
    ],
  },
  {
    label: "Agent",
    items: [
      { label: "Compress Context", action: "show-shortcuts" },
      { label: "Background Tasks", action: "toggle-snapshot" },
    ],
  },
  {
    label: "Window",
    items: [
      { label: "Hide to Tray", action: "hide-window" },
      { label: "Snapshot Timeline", action: "toggle-snapshot" },
    ],
  },
  {
    label: "Help",
    items: [
      { label: "Setup & Configuration", action: "open-dashboard" },
      { label: "About My Hermes Desktop", action: "open-settings" },
    ],
  },
];

export function getWindowMenu(platform: PlatformKind): AppMenuSection[] {
  return shouldShowWindowMenu(platform) ? APP_MENU : [];
}
