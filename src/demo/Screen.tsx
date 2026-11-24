import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { frameTime, type ScreenVideo } from "./types";

export interface ScreenHandle {
  /** Show frame @p frame of the video; null: nothing on the screen yet. */
  show(frame: number | null): void;
}

/**
 * The device's screen (aember-monitor on the framebuffer), from the
 * recording's video. The video never plays by itself: the replay player
 * picks the frame, so it stays in step with the console at any speed and
 * after a seek.
 */
export const Screen = forwardRef<ScreenHandle, { screen: ScreenVideo | undefined }>(
  function Screen({ screen }, ref) {
    const video = useRef<HTMLVideoElement>(null);
    const pending = useRef<number | null>(null);
    const [lit, setLit] = useState(false);

    const seek = (frame: number) => {
      const v = video.current;
      if (!v || !screen) return;
      // Before the metadata is in, setting currentTime may be ignored.
      if (v.readyState < HTMLMediaElement.HAVE_METADATA) {
        pending.current = frame;
        return;
      }
      v.currentTime = frameTime(screen, frame);
    };

    useImperativeHandle(ref, () => ({
      show(frame) {
        setLit(frame !== null);
        if (frame !== null) seek(frame);
      },
    }));

    return (
      <figure className="screen" data-testid="screen">
        <div className="screen-frame">
          {screen ? (
            <video
              key={screen.sources.join()}
              ref={video}
              muted
              playsInline
              preload="auto"
              aria-label="The device's screen: aember-monitor"
              className={lit ? "" : "off"}
              onLoadedMetadata={() => {
                const frame = pending.current;
                pending.current = null;
                if (frame !== null) seek(frame);
              }}
            >
              {screen.sources.map((s) => (
                <source key={s} src={`recordings/${s}`} type={s.endsWith(".webm") ? "video/webm" : "video/mp4"} />
              ))}
            </video>
          ) : null}
          {!lit && <span className="screen-idle">{screen ? "The screen is still dark…" : "No screen in this recording"}</span>}
        </div>
        <figcaption className="muted small">
          The screen: <code>aember-monitor</code>, a Qt container drawing on the framebuffer
        </figcaption>
      </figure>
    );
  },
);
