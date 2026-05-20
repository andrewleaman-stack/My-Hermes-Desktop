import { useState, useEffect } from "react";

export type FontSize = "small" | "medium" | "large";

export const FONT_SIZES: FontSize[] = ["small", "medium", "large"];

export const FONT_SIZE_LABELS: Record<FontSize, string> = {
  small: "小",
  medium: "中",
  large: "大",
};

const TERMINAL_FONT_PX: Record<FontSize, number> = { small: 11, medium: 13, large: 15 };
const FILE_TREE_FONT_PX: Record<FontSize, number> = { small: 11, medium: 12, large: 14 };

function readStorage(key: string, def: FontSize): FontSize {
  try {
    const v = localStorage.getItem(key) as FontSize;
    return FONT_SIZES.includes(v) ? v : def;
  } catch {
    return def;
  }
}

export function useFontSize() {
  const [uiFontSize, setUiFontSize] = useState<FontSize>(() =>
    readStorage("hermes-ui-font-size", "medium")
  );
  const [terminalFontSize, setTerminalFontSize] = useState<FontSize>(() =>
    readStorage("hermes-terminal-font-size", "medium")
  );
  const [fileTreeFontSize, setFileTreeFontSize] = useState<FontSize>(() =>
    readStorage("hermes-file-tree-font-size", "medium")
  );

  useEffect(() => {
    if (uiFontSize === "medium") {
      document.documentElement.removeAttribute("data-ui-size");
    } else {
      document.documentElement.setAttribute("data-ui-size", uiFontSize);
    }
    try { localStorage.setItem("hermes-ui-font-size", uiFontSize); } catch {}
  }, [uiFontSize]);

  useEffect(() => {
    try { localStorage.setItem("hermes-terminal-font-size", terminalFontSize); } catch {}
  }, [terminalFontSize]);

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--file-tree-font-size",
      `${FILE_TREE_FONT_PX[fileTreeFontSize]}px`
    );
    try { localStorage.setItem("hermes-file-tree-font-size", fileTreeFontSize); } catch {}
  }, [fileTreeFontSize]);

  return {
    uiFontSize, setUiFontSize,
    terminalFontSize, setTerminalFontSize,
    terminalFontPx: TERMINAL_FONT_PX[terminalFontSize],
    fileTreeFontSize, setFileTreeFontSize,
  };
}
