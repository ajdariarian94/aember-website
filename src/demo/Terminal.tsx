import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

export interface TerminalHandle {
  write(data: string): void;
  reset(): void;
}

/** The serial console, as xterm.js shows it (read-only). */
export const Terminal = forwardRef<TerminalHandle>(function Terminal(_props, ref) {
  const host = useRef<HTMLDivElement>(null);
  const term = useRef<XTerm | null>(null);

  useEffect(() => {
    const t = new XTerm({
      convertEol: false,
      disableStdin: true,
      cursorBlink: false,
      fontFamily: '"JetBrains Mono", "Fira Code", Menlo, Consolas, monospace',
      fontSize: 13,
      scrollback: 5000,
      theme: { background: "#0d1117", foreground: "#d1d7e0" },
    });
    const fit = new FitAddon();
    t.loadAddon(fit);
    if (host.current) t.open(host.current);
    const resize = () => {
      try {
        fit.fit();
      } catch {
        /* not laid out yet */
      }
    };
    resize();
    window.addEventListener("resize", resize);
    term.current = t;
    return () => {
      window.removeEventListener("resize", resize);
      t.dispose();
      term.current = null;
    };
  }, []);

  useImperativeHandle(ref, () => ({
    write: (data) => term.current?.write(data),
    reset: () => term.current?.reset(),
  }));

  return <div className="terminal" ref={host} data-testid="terminal" aria-label="aember console" />;
});
