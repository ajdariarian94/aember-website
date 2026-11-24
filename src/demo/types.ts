/**
 * The recorded screen: one video per scene in public/recordings/, in each
 * of @p sources (WebM VP9 first, then MP4 H.264 for Safari), frame i shown
 * from i / fps to (i + 1) / fps seconds. The page never plays it; it shows
 * the frame a "screen" event names.
 */
export interface ScreenVideo {
  sources: string[];
  fps: number;
  frames: number;
}

export type RecordingEvent =
  | { t: number; type: "console"; data: string }
  /** data: the frame index in the screen video. */
  | { t: number; type: "screen"; data: number };

/** One recorded scene (public/recordings/<scene>.json, format 2). */
export interface Recording {
  format: 2;
  scene: string;
  title: string;
  description: string;
  recorded: string;
  source: string;
  duration_ms: number;
  /** Absent: the recording has no screen. */
  screen?: ScreenVideo;
  events: RecordingEvent[];
}

/** Where frame @p frame sits in the video: its middle, so seeking is exact. */
export function frameTime(screen: ScreenVideo, frame: number): number {
  return (frame + 0.5) / screen.fps;
}
