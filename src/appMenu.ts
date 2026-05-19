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
    label: "文件",
    items: [
      { label: "新建会话", action: "new-session", shortcut: "Ctrl+N" },
      { label: "保存快照", action: "toggle-snapshot" },
      { label: "退出", action: "quit" },
    ],
  },
  {
    label: "编辑",
    items: [
      { label: "停止运行", action: "stop-agent" },
      { label: "快捷键", action: "show-shortcuts", shortcut: "Ctrl+/" },
    ],
  },
  {
    label: "查看",
    items: [
      { label: "对话", action: "open-chat" },
      { label: "记忆", action: "open-memory" },
      { label: "文件树", action: "open-files" },
      { label: "管理面板", action: "open-dashboard" },
      { label: "设置", action: "open-settings" },
      { label: "终端", action: "toggle-terminal" },
    ],
  },
  {
    label: "Agent",
    items: [
      { label: "压缩上下文", action: "show-shortcuts" },
      { label: "后台任务", action: "toggle-snapshot" },
    ],
  },
  {
    label: "窗口",
    items: [
      { label: "隐藏到托盘", action: "hide-window" },
      { label: "快照时间线", action: "toggle-snapshot" },
    ],
  },
  {
    label: "帮助",
    items: [
      { label: "安装与配置", action: "open-dashboard" },
      { label: "关于 Hermes Desktop", action: "open-settings" },
    ],
  },
];

export function getWindowMenu(platform: PlatformKind): AppMenuSection[] {
  return shouldShowWindowMenu(platform) ? APP_MENU : [];
}
