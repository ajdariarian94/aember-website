import { act, fireEvent, render } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it } from "vitest";
import { Screen, type ScreenHandle } from "../../src/demo/Screen";

const VIDEO = { sources: ["boot.webm", "boot.mp4"], fps: 1, frames: 10 };

function setReadyState(v: HTMLVideoElement, state: number) {
  Object.defineProperty(v, "readyState", { configurable: true, get: () => state });
}

describe("Screen", () => {
  // Regression: a seek before the video's metadata was in could be ignored
  // by the browser, leaving the screen on the first frame; it is deferred
  // until loadedmetadata.
  it("defers a seek until the metadata is loaded", () => {
    const ref = createRef<ScreenHandle>();
    const { container } = render(<Screen ref={ref} screen={VIDEO} />);
    const video = container.querySelector("video")!;
    setReadyState(video, HTMLMediaElement.HAVE_NOTHING);
    act(() => ref.current!.show(3));
    expect(video.currentTime).toBe(0);

    setReadyState(video, HTMLMediaElement.HAVE_METADATA);
    fireEvent.loadedMetadata(video);
    expect(video.currentTime).toBe(3.5);
  });

  it("seeks at once when the metadata is there, and goes dark on null", () => {
    const ref = createRef<ScreenHandle>();
    const { container } = render(<Screen ref={ref} screen={VIDEO} />);
    const video = container.querySelector("video")!;
    setReadyState(video, HTMLMediaElement.HAVE_METADATA);
    act(() => ref.current!.show(5));
    expect(video.currentTime).toBe(5.5);
    expect(video).not.toHaveClass("off");
    act(() => ref.current!.show(null));
    expect(video).toHaveClass("off");
  });
});
