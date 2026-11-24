import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppRoutes, PAGES, ROUTER_FUTURE } from "../../src/App";

const DIR = join(__dirname, "../../public/recordings");

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]} future={ROUTER_FUTURE}>
      <AppRoutes />
    </MemoryRouter>,
  );
}

describe("pages", () => {
  // The Install page asks GitHub for the latest release: never the network here.
  beforeEach(() => {
    vi.stubGlobal("fetch", async () => ({ ok: false, status: 404, json: async () => ({}) }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it.each(PAGES.filter((p) => p.path !== "/demo"))("$path renders", ({ path }) => {
    renderAt(path);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Main" })).toBeInTheDocument();
  });

  it("unknown paths go home", () => {
    renderAt("/nope");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("aember");
  });
});

describe("demo page", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", async (url: string) => {
      const file = join(DIR, url.replace("recordings/", ""));
      return { ok: true, status: 200, json: async () => JSON.parse(readFileSync(file, "utf8")) };
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("loads the scenes and plays the boot into the console and the screen", async () => {
    renderAt("/demo");
    await waitFor(() => expect(screen.getByRole("tab", { name: "boot" })).toBeInTheDocument());
    expect(screen.getByRole("tab", { name: "kill-service" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("heading", { level: 2, name: "Boot" })).toBeInTheDocument());
    const terminal = screen.getByTestId("terminal");
    await waitFor(() => expect(terminal.textContent).toMatch(/Linux version/), { timeout: 5000 });
    const video = screen.getByTestId("screen").querySelector("video")!;
    const sources = [...video.querySelectorAll("source")].map((s) => s.getAttribute("src"));
    expect(sources).toEqual(["recordings/boot.webm", "recordings/boot.mp4"]);
    // jump to the end: the screen shows its last frame
    const slider = screen.getByLabelText("Position") as HTMLInputElement;
    await act(async () => {
      fireEvent.change(slider, { target: { value: slider.max } });
    });
    await waitFor(() => expect(video).not.toHaveClass("off"));
    expect(terminal.textContent).toContain("Aember Init System started successfully");
  });
});
