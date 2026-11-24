import type { Recording } from "./types";

/** Problems with @p value as a recording; empty when it is valid. */
export function validateRecording(value: unknown): string[] {
  const errors: string[] = [];
  if (typeof value !== "object" || value === null) return ["not an object"];
  const r = value as Record<string, unknown>;
  if (r.format !== 2) errors.push(`unsupported format ${String(r.format)}`);
  for (const key of ["scene", "title", "description", "recorded", "source"]) {
    if (typeof r[key] !== "string" || r[key] === "") errors.push(`missing ${key}`);
  }
  let frames = 0;
  if (r.screen !== undefined) {
    const s = r.screen as Record<string, unknown> | null;
    if (
      !s ||
      !Array.isArray(s.sources) ||
      s.sources.length === 0 ||
      !s.sources.every((v) => typeof v === "string" && /^[\w.-]+\.(webm|mp4)$/.test(v)) ||
      typeof s.fps !== "number" ||
      !(s.fps > 0) ||
      typeof s.frames !== "number"
    ) {
      errors.push("bad screen");
    } else {
      frames = s.frames;
    }
  }
  if (!Array.isArray(r.events)) return [...errors, "events must be an array"];
  let last = -Infinity;
  r.events.forEach((e: unknown, i: number) => {
    const ev = e as Record<string, unknown>;
    if (typeof ev?.t !== "number" || ev.t < 0) {
      errors.push(`event ${i}: bad time`);
      return;
    }
    if (ev.t < last) errors.push(`event ${i}: time goes backwards`);
    last = ev.t;
    if (ev.type === "console") {
      if (typeof ev.data !== "string") errors.push(`event ${i}: console data`);
    } else if (ev.type === "screen") {
      if (!Number.isInteger(ev.data) || (ev.data as number) < 0 || (ev.data as number) >= frames) {
        errors.push(`event ${i}: no such screen frame`);
      }
    } else {
      errors.push(`event ${i}: unknown type ${String(ev.type)}`);
    }
  });
  return errors;
}

/** Fetch and check one recording (relative to the page: works in a sub-path). */
export async function loadRecording(
  scene: string,
  fetchFn: typeof fetch = fetch,
): Promise<Recording> {
  const res = await fetchFn(`recordings/${scene}.json`);
  if (!res.ok) throw new Error(`recording ${scene}: HTTP ${res.status}`);
  const json: unknown = await res.json();
  const errors = validateRecording(json);
  if (errors.length) throw new Error(`recording ${scene}: ${errors.join("; ")}`);
  return json as Recording;
}

export async function loadSceneIndex(fetchFn: typeof fetch = fetch): Promise<string[]> {
  const res = await fetchFn("recordings/index.json");
  if (!res.ok) throw new Error(`recordings index: HTTP ${res.status}`);
  const json = (await res.json()) as { scenes?: unknown };
  if (!Array.isArray(json.scenes)) throw new Error("recordings index: no scenes");
  return json.scenes.filter((s): s is string => typeof s === "string");
}
