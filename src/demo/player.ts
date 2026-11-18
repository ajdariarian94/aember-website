import type { Heartbeat, Recording, RecordingEvent } from "./types";

/** Idle stretches longer than this play back in this time. */
export const MAX_GAP_MS = 1500;

export interface PlayerCallbacks {
  /** Text for the console (ANSI included). */
  onConsole(data: string): void;
  onHeartbeat(heartbeat: Heartbeat): void;
  /** Clear the console: playback starts over or jumps. */
  onReset(): void;
  onProgress?(positionMs: number): void;
  onEnd?(): void;
}

export interface Clock {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(id: unknown): void;
}

const browserClock: Clock = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (id) => globalThis.clearTimeout(id as ReturnType<typeof setTimeout>),
};

/** Playback time of every event, with long gaps shortened to @p maxGap. */
export function timeline(events: RecordingEvent[], maxGap = MAX_GAP_MS): number[] {
  const times: number[] = [];
  let prevReal = 0;
  let prevPlay = 0;
  for (const e of events) {
    const gap = Math.max(0, e.t - prevReal);
    prevPlay += Math.min(gap, maxGap);
    prevReal = e.t;
    times.push(prevPlay);
  }
  return times;
}

/**
 * Replays a recording: console text and heartbeats at their (shortened)
 * times, at a chosen speed, with pause and seek.
 */
export class ReplayPlayer {
  private readonly times: number[];
  private next = 0; // index of the next event to emit
  private positionMs = 0;
  private timer: unknown = null;
  private speedFactor = 1;
  private isPlaying = false;

  constructor(
    private readonly recording: Recording,
    private readonly cb: PlayerCallbacks,
    private readonly clock: Clock = browserClock,
  ) {
    this.times = timeline(recording.events);
  }

  get duration(): number {
    return this.times.length ? this.times[this.times.length - 1] : 0;
  }
  get position(): number {
    return this.positionMs;
  }
  get playing(): boolean {
    return this.isPlaying;
  }
  get speed(): number {
    return this.speedFactor;
  }
  get ended(): boolean {
    return this.next >= this.recording.events.length;
  }

  setSpeed(speed: number): void {
    if (!(speed > 0)) throw new RangeError("speed must be > 0");
    this.speedFactor = speed;
    if (this.isPlaying) this.schedule();
  }

  play(): void {
    if (this.isPlaying) return;
    if (this.ended) this.seek(0);
    this.isPlaying = true;
    this.schedule();
  }

  pause(): void {
    this.isPlaying = false;
    this.cancel();
  }

  restart(): void {
    this.seek(0);
    this.play();
  }

  /** Jump to @p ms: the console is rebuilt up to there, the last heartbeat shown. */
  seek(ms: number): void {
    this.cancel();
    const target = Math.max(0, Math.min(ms, this.duration));
    this.cb.onReset();
    let text = "";
    let heartbeat: Heartbeat | null = null;
    let i = 0;
    const events = this.recording.events;
    while (i < events.length && this.times[i] <= target) {
      const e = events[i];
      if (e.type === "console") text += e.data;
      else heartbeat = e.data;
      i++;
    }
    if (text) this.cb.onConsole(text);
    if (heartbeat) this.cb.onHeartbeat(heartbeat);
    this.next = i;
    this.positionMs = target;
    this.cb.onProgress?.(target);
    if (this.isPlaying) this.schedule();
  }

  dispose(): void {
    this.pause();
  }

  private cancel(): void {
    if (this.timer !== null) {
      this.clock.clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private schedule(): void {
    this.cancel();
    if (!this.isPlaying) return;
    if (this.ended) {
      this.isPlaying = false;
      this.cb.onEnd?.();
      return;
    }
    const wait = Math.max(0, (this.times[this.next] - this.positionMs) / this.speedFactor);
    this.timer = this.clock.setTimeout(() => {
      this.timer = null;
      this.step();
    }, wait);
  }

  private step(): void {
    const events = this.recording.events;
    const now = this.times[this.next];
    // Everything due at this moment goes out together.
    while (this.next < events.length && this.times[this.next] <= now) {
      const e = events[this.next++];
      if (e.type === "console") this.cb.onConsole(e.data);
      else this.cb.onHeartbeat(e.data);
    }
    this.positionMs = now;
    this.cb.onProgress?.(now);
    this.schedule();
  }
}
