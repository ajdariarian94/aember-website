import { describe, expect, it, vi } from "vitest";
import { MAX_GAP_MS, ReplayPlayer, timeline } from "../../src/demo/player";
import type { Recording, RecordingEvent } from "../../src/demo/types";

function recording(events: RecordingEvent[]): Recording {
  return {
    format: 2,
    scene: "t",
    title: "t",
    description: "t",
    recorded: "2026-11-18T00:00:00Z",
    source: "test",
    duration_ms: events.at(-1)?.t ?? 0,
    events,
  };
}

const EVENTS: RecordingEvent[] = [
  { t: 0, type: "console", data: "a" },
  { t: 100, type: "console", data: "b" },
  { t: 100, type: "screen", data: 1 },
  { t: 10_100, type: "console", data: "c" }, // 10 s idle: shortened
  { t: 10_300, type: "screen", data: 2 },
];

/** A clock the test advances by hand. */
function fakeClock() {
  let now = 0;
  let id = 0;
  const timers = new Map<number, { at: number; fn: () => void }>();
  return {
    clock: {
      setTimeout: (fn: () => void, ms: number) => {
        timers.set(++id, { at: now + ms, fn });
        return id;
      },
      clearTimeout: (t: unknown) => timers.delete(t as number),
    },
    advance(ms: number) {
      const end = now + ms;
      for (;;) {
        const due = [...timers.entries()]
          .filter(([, t]) => t.at <= end)
          .sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        timers.delete(due[0]);
        now = due[1].at;
        due[1].fn();
      }
      now = end;
    },
  };
}

function setup(events = EVENTS) {
  const out: string[] = [];
  const beats: number[] = [];
  const cb = {
    onConsole: (d: string) => out.push(d),
    onScreen: (frame: number) => beats.push(frame),
    onReset: vi.fn(() => {
      out.length = 0;
      beats.length = 0;
    }),
    onEnd: vi.fn(),
    onProgress: vi.fn(),
  };
  const f = fakeClock();
  const player = new ReplayPlayer(recording(events), cb, f.clock);
  return { player, out, beats, cb, ...f };
}

describe("timeline", () => {
  it("keeps short gaps and shortens long ones", () => {
    expect(timeline(EVENTS)).toEqual([0, 100, 100, 100 + MAX_GAP_MS, 300 + MAX_GAP_MS]);
  });
  it("handles an empty recording", () => {
    expect(timeline([])).toEqual([]);
  });
});

describe("ReplayPlayer", () => {
  it("plays events in order at their times", () => {
    const { player, out, beats, advance, cb } = setup();
    player.play();
    advance(0);
    expect(out).toEqual(["a"]);
    advance(100);
    expect(out).toEqual(["a", "b"]);
    expect(beats).toEqual([1]);
    advance(MAX_GAP_MS - 1);
    expect(out).toEqual(["a", "b"]);
    advance(1);
    expect(out.join("")).toBe("abc");
    advance(200);
    expect(beats).toEqual([1, 2]);
    expect(cb.onEnd).toHaveBeenCalledTimes(1);
    expect(player.playing).toBe(false);
    expect(player.duration).toBe(300 + MAX_GAP_MS);
  });

  it("pauses and resumes where it was", () => {
    const { player, out, advance } = setup();
    player.play();
    advance(50);
    player.pause();
    advance(10_000);
    expect(out).toEqual(["a"]);
    player.play();
    advance(100);
    expect(out).toEqual(["a", "b"]);
  });

  it("plays faster at a higher speed", () => {
    const { player, out, advance } = setup();
    player.setSpeed(4);
    player.play();
    advance(25);
    expect(out).toEqual(["a", "b"]);
    expect(() => player.setSpeed(0)).toThrow(RangeError);
  });

  it("seek rebuilds the console up to the position", () => {
    const { player, out, beats, cb } = setup();
    player.seek(200 + MAX_GAP_MS);
    expect(cb.onReset).toHaveBeenCalled();
    expect(out).toEqual(["abc"]); // one write, not one per event
    expect(beats).toEqual([1]); // only the last frame matters
    expect(player.position).toBe(200 + MAX_GAP_MS);
    player.seek(-5);
    expect(player.position).toBe(0);
    expect(out).toEqual(["a"]);
    player.seek(1e9);
    expect(player.position).toBe(player.duration);
  });

  it("play after the end starts over; restart too", () => {
    const { player, out, advance } = setup();
    player.play();
    advance(10_000);
    expect(player.ended).toBe(true);
    player.play();
    advance(0);
    expect(out).toEqual(["a"]);
    player.restart();
    advance(0);
    expect(out).toEqual(["a"]);
  });

  it("dispose stops playback", () => {
    const { player, out, advance } = setup();
    player.play();
    advance(0);
    player.dispose();
    advance(10_000);
    expect(out).toEqual(["a"]);
  });
});
