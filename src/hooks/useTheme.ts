import { useState, useEffect } from "react";

export type Theme = "claude" | "apple" | "warp";

const STORAGE_KEY = "hermes-theme";
const CYCLE: Theme[] = ["claude", "apple", "warp"];

function applyTheme(theme: Theme) {
  if (theme === "apple" || theme === "warp") {
    document.documentElement.setAttribute("data-theme", theme);
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as Theme;
      return CYCLE.includes(saved) ? saved : "claude";
    } catch {
      return "claude";
    }
  });

  useEffect(() => {
    applyTheme(theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {}
  }, [theme]);

  const toggle = () =>
    setTheme((t) => CYCLE[(CYCLE.indexOf(t) + 1) % CYCLE.length]);

  return { theme, toggle };
}
