import { useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";

interface Props {
  sessionId: string | null;
  onClose: () => void;
}

export default function TerminalPanel({ sessionId, onClose }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const ptyId = useRef(`pty-${Date.now()}`);
  const unlistenRef = useRef<(() => void) | null>(null);

  const doClose = useCallback(() => {
    invoke("pty_close", { ptyId: ptyId.current }).catch(() => {});
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      fontFamily: '"JetBrains Mono", "Fira Code", monospace',
      fontSize: 13,
      lineHeight: 1.3,
      theme: {
        background: "#0d1117",
        foreground: "#e6edf3",
        cursor: "#58a6ff",
        selectionBackground: "#264f78",
        black: "#0d1117", red: "#ff7b72", green: "#3fb950",
        yellow: "#d29922", blue: "#58a6ff", magenta: "#bc8cff",
        cyan: "#39c5cf", white: "#e6edf3",
        brightBlack: "#6e7681", brightRed: "#ffa198", brightGreen: "#56d364",
        brightYellow: "#e3b341", brightBlue: "#79c0ff", brightMagenta: "#d2a8ff",
        brightCyan: "#56d4dd", brightWhite: "#f0f6fc",
      },
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(new WebLinksAddon());
    term.open(containerRef.current);
    fitAddon.fit();
    termRef.current = term;
    fitAddonRef.current = fitAddon;

    const { rows, cols } = term;
    invoke("pty_open", { ptyId: ptyId.current, sessionId, rows, cols })
      .catch((e) => term.writeln(`\r\n\x1b[31mFailed to open terminal: ${e}\x1b[0m`));

    listen<string>(`pty:${ptyId.current}`, (event) => {
      term.write(event.payload);
    }).then((u) => { unlistenRef.current = u; });

    term.onData((data) => {
      invoke("pty_write", { ptyId: ptyId.current, data }).catch(() => {});
    });

    const ro = new ResizeObserver(() => {
      fitAddon.fit();
      const { rows, cols } = term;
      invoke("pty_resize", { ptyId: ptyId.current, rows, cols }).catch(() => {});
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      unlistenRef.current?.();
      invoke("pty_close", { ptyId: ptyId.current }).catch(() => {});
      term.dispose();
    };
  }, [sessionId]);

  return (
    <div className="terminal-panel">
      <div className="terminal-panel-header">
        <span className="terminal-panel-title">⚡ Hermes Terminal</span>
        <span className="terminal-panel-hint">支持所有 slash 命令（/compact、/help 等）</span>
        <button className="terminal-panel-close" onClick={doClose} title="关闭终端">✕</button>
      </div>
      <div ref={containerRef} className="terminal-panel-body" />
    </div>
  );
}
