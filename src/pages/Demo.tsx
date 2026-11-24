import { useCallback, useEffect, useRef, useState } from "react";
import { ReplayPlayer } from "../demo/player";
import { loadRecording, loadSceneIndex } from "../demo/recording";
import { Screen, type ScreenHandle } from "../demo/Screen";
import { Terminal, type TerminalHandle } from "../demo/Terminal";
import type { Recording } from "../demo/types";

const SPEEDS = [1, 2, 4];

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)} s`;
}

export function Demo() {
  const [scenes, setScenes] = useState<string[]>([]);
  const [scene, setScene] = useState<string | null>(null);
  const [recording, setRecording] = useState<Recording | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [position, setPosition] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const terminal = useRef<TerminalHandle>(null);
  const screen = useRef<ScreenHandle>(null);
  const player = useRef<ReplayPlayer | null>(null);

  useEffect(() => {
    loadSceneIndex()
      .then((list) => {
        setScenes(list);
        setScene((current) => current ?? list[0] ?? null);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!scene) return;
    let cancelled = false;
    setRecording(null);
    loadRecording(scene)
      .then((rec) => !cancelled && setRecording(rec))
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [scene]);

  useEffect(() => {
    if (!recording) return;
    const p = new ReplayPlayer(recording, {
      onConsole: (data) => terminal.current?.write(data),
      onScreen: (frame) => screen.current?.show(frame),
      onReset: () => {
        terminal.current?.reset();
        screen.current?.show(null);
      },
      onProgress: setPosition,
      onEnd: () => setPlaying(false),
    });
    p.setSpeed(speed);
    player.current = p;
    p.seek(0);
    p.play();
    setPlaying(true);
    return () => {
      p.dispose();
      player.current = null;
    };
    // speed is applied separately below; a new recording starts at 1×.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording]);

  const toggle = useCallback(() => {
    const p = player.current;
    if (!p) return;
    if (p.playing) p.pause();
    else p.play();
    setPlaying(p.playing);
  }, []);

  const changeSpeed = (s: number) => {
    setSpeed(s);
    player.current?.setSpeed(s);
  };

  const duration = player.current?.duration ?? 0;

  return (
    <section className="demo">
      <h1>Demo</h1>
      <p className="lead">
        Recorded sessions of a real aember in QEMU: the serial console, and next to
        it the device's screen, where the <code>aember-monitor</code> container shows
        CPU, memory, network and every service and container. Nothing here is
        simulated; both come from the same <code>aember app launch</code> run.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="scene-picker" role="tablist" aria-label="Scenes">
        {scenes.map((s) => (
          <button
            key={s}
            role="tab"
            aria-selected={s === scene}
            className={s === scene ? "active" : ""}
            onClick={() => setScene(s)}
          >
            {s}
          </button>
        ))}
      </div>
      {recording && (
        <div className="scene-info">
          <h2>{recording.title}</h2>
          <p>{recording.description}</p>
        </div>
      )}
      <div className="controls">
        <button onClick={toggle} disabled={!recording} data-testid="play-pause">
          {playing ? "Pause" : "Play"}
        </button>
        <button
          onClick={() => {
            player.current?.restart();
            setPlaying(true);
          }}
          disabled={!recording}
        >
          Restart
        </button>
        <label>
          speed{" "}
          <select value={speed} onChange={(e) => changeSpeed(Number(e.target.value))}>
            {SPEEDS.map((s) => (
              <option key={s} value={s}>
                {s}×
              </option>
            ))}
          </select>
        </label>
        <input
          type="range"
          min={0}
          max={Math.max(1, Math.round(duration))}
          value={Math.round(position)}
          onChange={(e) => player.current?.seek(Number(e.target.value))}
          aria-label="Position"
          disabled={!recording}
        />
        <span className="muted" data-testid="position">
          {seconds(position)} / {seconds(duration)}
        </span>
      </div>
      <div className="demo-grid">
        <Terminal ref={terminal} />
        <Screen ref={screen} screen={recording?.screen} />
      </div>
      {recording && (
        <p className="muted small">
          Recorded {recording.recorded.slice(0, 10)} · {recording.source} · long pauses
          shortened to 1.5 s
        </p>
      )}
    </section>
  );
}
