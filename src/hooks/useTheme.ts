import { useState, useEffect } from "react";

export type Theme = "claude" | "apple" | "warp";
/** Color mode is independent of the brand theme: auto follows the OS. */
export type Mode = "auto" | "light" | "dark";

const STORAGE_KEY = "hermes-theme";
const MODE_STORAGE_KEY = "hermes-mode";
const THEME_EVENT = "hermes-theme-changed";
const MODE_EVENT = "hermes-mode-changed";

export const THEMES: Theme[] = ["claude", "apple", "warp"];
export const MODES: Mode[] = ["auto", "light", "dark"];

function systemPrefersDark(): boolean {
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  } catch {
    return false;
  }
}

function applyTheme(theme: Theme) {
  if (theme === "apple" || theme === "warp") {
    document.documentElement.setAttribute("data-theme", theme);
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
}

function applyMode(mode: Mode) {
  const resolved = mode === "auto" ? (systemPrefersDark() ? "dark" : "light") : mode;
  document.documentElement.setAttribute("data-mode", resolved);
}

function readTheme(): Theme {
  try {
    const saved = localStorage.getItem(STORAGE_KEY) as Theme;
    return THEMES.includes(saved) ? saved : "claude";
  } catch {
    return "claude";
  }
}

function readMode(): Mode {
  try {
    const saved = localStorage.getItem(MODE_STORAGE_KEY) as Mode;
    return MODES.includes(saved) ? saved : "auto";
  } catch {
    return "auto";
  }
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(readTheme);
  const [mode, setModeState] = useState<Mode>(readMode);

  useEffect(() => {
    applyTheme(theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {}
  }, [theme]);

  useEffect(() => {
    applyMode(mode);
    try {
      localStorage.setItem(MODE_STORAGE_KEY, mode);
    } catch {}
    if (mode !== "auto") return;
    // Follow live OS appearance changes while in auto
    try {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      const onChange = () => applyMode("auto");
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    } catch {
      return;
    }
  }, [mode]);

  // Keep multiple hook instances (Settings page, App shell, …) in sync
  useEffect(() => {
    const onTheme = () => setThemeState(readTheme());
    const onMode = () => setModeState(readMode());
    window.addEventListener(THEME_EVENT, onTheme);
    window.addEventListener(MODE_EVENT, onMode);
    return () => {
      window.removeEventListener(THEME_EVENT, onTheme);
      window.removeEventListener(MODE_EVENT, onMode);
    };
  }, []);

  const setTheme = (next: Theme) => {
    setThemeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {}
    window.dispatchEvent(new CustomEvent(THEME_EVENT));
  };

  const setMode = (next: Mode) => {
    setModeState(next);
    try {
      localStorage.setItem(MODE_STORAGE_KEY, next);
    } catch {}
    window.dispatchEvent(new CustomEvent(MODE_EVENT));
  };

  const toggle = () =>
    setTheme(THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length]);

  return { theme, setTheme, mode, setMode, toggle };
}
