import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// xterm.js measures fonts and needs a real browser; in jsdom a fake terminal
// writes the text into its host element instead (e2e tests use the real one).
vi.mock("@xterm/xterm", () => {
  class FakeTerminal {
    private el: HTMLElement | null = null;
    loadAddon() {}
    open(el: HTMLElement) {
      this.el = el;
    }
    write(data: string) {
      if (this.el) this.el.textContent = (this.el.textContent ?? "") + data;
    }
    reset() {
      if (this.el) this.el.textContent = "";
    }
    dispose() {}
  }
  return { Terminal: FakeTerminal };
});
vi.mock("@xterm/addon-fit", () => ({
  FitAddon: class {
    fit() {}
  },
}));
