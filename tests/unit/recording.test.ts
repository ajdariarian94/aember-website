import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadRecording, loadSceneIndex, validateRecording } from "../../src/demo/recording";
import type { Recording } from "../../src/demo/types";

const DIR = join(__dirname, "../../public/recordings");

describe("validateRecording", () => {
  const ok: Recording = {
    format: 1,
    scene: "s",
    title: "t",
    description: "d",
    recorded: "2026-11-18",
    source: "x",
    duration_ms: 1,
    events: [
      { t: 0, type: "console", data: "x" },
      { t: 1, type: "heartbeat", data: { pid1: null, network: null, services: [] } },
    ],
  };
  it("accepts a valid recording", () => {
    expect(validateRecording(ok)).toEqual([]);
  });
  it("reports what is wrong", () => {
    expect(validateRecording(null)).toEqual(["not an object"]);
    expect(validateRecording({ ...ok, format: 2 })).toContain("unsupported format 2");
    expect(validateRecording({ ...ok, title: "" })).toContain("missing title");
    expect(
      validateRecording({ ...ok, events: [{ t: 5, type: "console", data: "a" }, { t: 1, type: "console", data: "b" }] }),
    ).toContain("event 1: time goes backwards");
    expect(validateRecording({ ...ok, events: [{ t: 0, type: "video", data: "" }] })).toContain(
      "event 0: unknown type video",
    );
    expect(validateRecording({ ...ok, events: [{ t: 0, type: "heartbeat", data: {} }] })).toContain(
      "event 0: heartbeat without services",
    );
  });
});

describe("the recordings shipped in public/recordings", () => {
  const index = JSON.parse(readFileSync(join(DIR, "index.json"), "utf8")) as { scenes: string[] };
  const files = readdirSync(DIR).filter((f) => f.endsWith(".json") && f !== "index.json");

  it("are all listed in index.json, in story order", () => {
    expect([...index.scenes].sort()).toEqual(files.map((f) => f.replace(".json", "")).sort());
    expect(index.scenes.slice(0, 3)).toEqual(["boot", "kill-service", "debug-shell"]);
  });

  it.each(files)("%s is valid and shows a real session", (file) => {
    const rec = JSON.parse(readFileSync(join(DIR, file), "utf8"));
    expect(validateRecording(rec)).toEqual([]);
    const text = rec.events
      .filter((e: { type: string }) => e.type === "console")
      .map((e: { data: string }) => e.data)
      .join("");
    expect(text).toContain("Aember Init System started successfully");
    expect(text).not.toContain("[aember-monitor]"); // heartbeats became events
    const beats = rec.events.filter((e: { type: string }) => e.type === "heartbeat");
    expect(beats.length).toBeGreaterThan(5);
    const last = beats.at(-1).data;
    expect(last.pid1.pid).toBe(1);
    expect(last.services.map((s: { name: string }) => s.name)).toContain("aember-netd");
  });

  it("kill-service shows the restarts", () => {
    const rec = JSON.parse(readFileSync(join(DIR, "kill-service.json"), "utf8")) as Recording;
    const echo = rec.events
      .filter((e) => e.type === "heartbeat")
      .map((e) => (e.type === "heartbeat" ? e.data.services.find((s) => s.name === "aember-echo")?.state : ""));
    const failed = echo.indexOf("failed");
    expect(failed).toBeGreaterThan(-1);
    expect(echo.slice(failed)).toContain("running"); // came back
  });

  it("debug-shell opens a shell", () => {
    const rec = JSON.parse(readFileSync(join(DIR, "debug-shell.json"), "utf8")) as Recording;
    const text = rec.events.map((e) => (e.type === "console" ? e.data : "")).join("");
    expect(text).toMatch(/~ #/);
    expect(text).toContain("ls /etc/aember");
    expect(text).toContain("services.json");
  });
});

describe("loading", () => {
  const fake = (body: unknown, ok = true) =>
    (async () => ({ ok, status: ok ? 200 : 404, json: async () => body })) as unknown as typeof fetch;

  it("loads and checks a recording", async () => {
    const rec = JSON.parse(readFileSync(join(DIR, "boot.json"), "utf8"));
    await expect(loadRecording("boot", fake(rec))).resolves.toMatchObject({ scene: "boot" });
    await expect(loadRecording("boot", fake({ format: 9 }))).rejects.toThrow(/unsupported format/);
    await expect(loadRecording("boot", fake(null, false))).rejects.toThrow(/HTTP 404/);
  });

  it("loads the scene index", async () => {
    await expect(loadSceneIndex(fake({ scenes: ["a", 1, "b"] }))).resolves.toEqual(["a", "b"]);
    await expect(loadSceneIndex(fake({}))).rejects.toThrow(/no scenes/);
  });
});
