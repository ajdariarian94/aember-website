import type { Recording } from "./types";

/** Problems with @p value as a recording; empty when it is valid. */
export function validateRecording(value: unknown): string[] {
  const errors: string[] = [];
  if (typeof value !== "object" || value === null) return ["not an object"];
  const r = value as Record<string, unknown>;
  if (r.format !== 1) errors.push(`unsupported format ${String(r.format)}`);
  for (const key of ["scene", "title", "description", "recorded", "source"]) {
    if (typeof r[key] !== "string" || r[key] === "") errors.push(`missing ${key}`);
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
    } else if (ev.type === "heartbeat") {
      const hb = ev.data as Record<string, unknown> | null;
      if (!hb || !Array.isArray(hb.services)) {
        errors.push(`event ${i}: heartbeat without services`);
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
