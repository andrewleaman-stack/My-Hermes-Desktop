import { useState, useEffect } from "react";

export type TerminalBg = "dark" | "glass" | "ocean" | "sunset" | "forest";

export const TERMINAL_BGS: TerminalBg[] = ["dark", "glass", "ocean", "sunset", "forest"];

const STORAGE_KEY = "hermes-terminal-bg";

export function xtermBackground(bg: TerminalBg): string {
  if (bg === "dark") return "#0d1117";
  // glass: a translucent dark overlay sits on the gradient background to create depth
  if (bg === "glass") return "rgba(13, 17, 23, 0.52)";
  // other gradient modes: fully transparent so the gradient shows through directly
  return "rgba(0, 0, 0, 0)";
}

export function useTerminalBg() {
  const [terminalBg, setTerminalBg] = useState<TerminalBg>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as TerminalBg;
      return TERMINAL_BGS.includes(saved) ? saved : "dark";
    } catch {
      return "dark";
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, terminalBg);
    } catch {}
  }, [terminalBg]);

  return { terminalBg, setTerminalBg };
}
