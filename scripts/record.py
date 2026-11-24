#!/usr/bin/env python3
"""
Record aember sessions for the website's demo page.

Runs a real aember (QEMU headless) with a scripted scene and records two
things side by side:

- the serial console, timestamped, as "console" events;
- the virtual screen (aember-monitor, the Qt status display, draws on the
  VM's framebuffer): QEMU's `screendump` through a QMP socket once a
  second, encoded into a video per scene (VP9 WebM, and H.264 MP4 for
  Safari), plus a "screen" event
  per frame (its index in the video) so the page shows the right frame
  at the right time.

Output: public/recordings/<scene>.json, <scene>.webm, <scene>.mp4 and
index.json.

Run it where the `aember` command works (the aember dev container), e.g.

    scripts/record.py --scene all

or from the host through docker:

    scripts/record.py --scene boot \
        --command 'docker exec -i -w /aember_ws/aember <container> \
                   aember app launch --headless --timeout {timeout} --qmp {qmp}' \
        --screen-command 'docker exec -i <container> python3 - {qmp}'

Needs ffmpeg (with libvpx-vp9 and libx264) for the videos (`--ffmpeg PATH`). Redo the
recordings after each aember release (`aember app build` and `aember app
pack` for x64 first). Standard library only.
"""

from __future__ import annotations

import argparse
import base64
import datetime as dt
import json
import os
import re
import shlex
import subprocess
import sys
import tempfile
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path

FORMAT = 2
QMP_SOCKET = "/tmp/aember-record-qmp.sock"
DEFAULT_COMMAND = "aember app launch --headless --timeout {timeout} --qmp {qmp}"
# Runs GRABBER (fed on stdin) where the QMP socket is.
DEFAULT_SCREEN_COMMAND = "python3 - {qmp}"
SCREEN_FPS = 1  # the video plays frame i at [i, i + 1) s; the page seeks

_ANSI = re.compile(r"\x1b\[[0-9;?]*[A-Za-z]")

# ---------------------------------------------------------------------------
# Screen: a QMP client that prints one base64 PNG per line, once a second
# ---------------------------------------------------------------------------

GRABBER = r"""
import base64, json, os, socket, sys, time
path, interval = sys.argv[1], float(sys.argv[2]) if len(sys.argv) > 2 else 1.0
s = socket.socket(socket.AF_UNIX)
for _ in range(600):  # QEMU creates the socket a moment after it starts
    try:
        s.connect(path)
        break
    except OSError:
        time.sleep(0.1)
else:
    sys.exit("no QMP socket at " + path)
f = s.makefile("rw")

def call(cmd, **args):
    f.write(json.dumps({"execute": cmd, "arguments": args}) + "\n")
    f.flush()
    while True:
        line = f.readline()
        if not line:
            raise EOFError
        reply = json.loads(line)
        if "return" in reply or "error" in reply:
            return reply

png = "/tmp/aember-record-%d.png" % os.getpid()
try:
    f.readline()  # greeting
    call("qmp_capabilities")
    next_at = time.monotonic()
    while True:
        if "return" in call("screendump", filename=png, format="png"):
            with open(png, "rb") as img:
                print(base64.b64encode(img.read()).decode(), flush=True)
        next_at += interval
        time.sleep(max(0.0, next_at - time.monotonic()))
except (EOFError, OSError, ValueError):
    pass  # QEMU is gone: the run ended
finally:
    if os.path.exists(png):
        os.remove(png)
"""


@dataclass
class Screen:
    """The frames of one run: (time in ms, PNG bytes)."""

    frames: list[tuple[int, bytes]] = field(default_factory=list)

    def add_line(self, t_ms: int, line: str) -> None:
        line = line.strip()
        if not line:
            return
        try:
            png = base64.b64decode(line, validate=True)
        except ValueError:
            return
        if png.startswith(b"\x89PNG"):
            self.frames.append((t_ms, png))

    def drop_before_final_mode(self) -> None:
        """
        Drop the leading frames in another size than the last one: QEMU's
        "Display output is not active" (640x480) until the kernel sets the
        framebuffer's mode. A video has one size; the page shows a dark
        screen until the first frame that is left.
        """
        if not self.frames:
            return
        final = png_size(self.frames[-1][1])
        first = next(i for i, (_, p) in enumerate(self.frames) if png_size(p) == final)
        del self.frames[:first]

    def events(self, until_ms: int) -> list[dict]:
        """One "screen" event per frame: data = its index in the video."""
        return [
            {"t": t, "type": "screen", "data": i}
            for i, (t, _) in enumerate(self.frames)
            if t <= until_ms
        ]

    def encode(self, ffmpeg: str, outs: list[Path], count: int) -> None:
        """The first @p count frames as videos (by suffix), SCREEN_FPS frames/s."""
        with tempfile.TemporaryDirectory() as tmp:
            for i, (_, png) in enumerate(self.frames[:count]):
                (Path(tmp) / f"{i:05d}.png").write_bytes(png)
            for out in outs:
                subprocess.run(
                    ffmpeg_command(ffmpeg, Path(tmp) / "%05d.png", out),
                    check=True,
                    stdout=subprocess.DEVNULL,
                )


def png_size(png: bytes) -> tuple[int, int]:
    """Width and height from a PNG's IHDR chunk."""
    return int.from_bytes(png[16:20], "big"), int.from_bytes(png[20:24], "big")


# Mostly still frames of a dashboard. VP9 plays in Chrome, Firefox and Edge
# (also builds without H.264, like Playwright's Chromium), H.264 in Safari.
# A keyframe every 5 frames keeps seeking cheap.
CODECS = {
    ".webm": ("-c:v", "libvpx-vp9", "-crf", "36", "-b:v", "0", "-row-mt", "1"),
    ".mp4": (
        *("-c:v", "libx264", "-preset", "veryslow", "-tune", "stillimage"),
        *("-crf", "28", "-movflags", "+faststart"),  # index first: early seeks
    ),
}


def ffmpeg_command(ffmpeg: str, pattern: Path, out: Path) -> list[str]:
    return [
        ffmpeg,
        *("-hide_banner", "-loglevel", "error", "-y"),
        *("-framerate", str(SCREEN_FPS), "-i", str(pattern)),
        *CODECS[out.suffix],
        *("-g", "5", "-pix_fmt", "yuv420p", "-an", str(out)),
    ]


# ---------------------------------------------------------------------------
# Console capture
# ---------------------------------------------------------------------------


@dataclass
class Capture:
    """Timestamped console output of one run."""

    start: float = field(default_factory=time.monotonic)
    events: list[dict] = field(default_factory=list)
    text: str = ""  # everything so far, for wait_for()
    _partial: str = ""
    _partial_since: float = 0.0
    _lock: threading.Lock = field(default_factory=threading.Lock)
    _changed: threading.Condition = field(init=False)

    def __post_init__(self) -> None:
        self._changed = threading.Condition(self._lock)

    def now_ms(self) -> int:
        return int((time.monotonic() - self.start) * 1000)

    def add(self, chunk: str) -> None:
        with self._lock:
            self.text += chunk
            if not self._partial:
                self._partial_since = time.monotonic()
            self._partial += chunk
            if "\n" in self._partial:
                done, self._partial = self._partial.rsplit("\n", 1)
                self._emit(done + "\n")
            self._changed.notify_all()

    def flush_partial(self, older_than: float = 0.15) -> None:
        """A prompt like "~ # " never ends its line: emit it after a pause."""
        with self._lock:
            if self._partial and time.monotonic() - self._partial_since > older_than:
                self._emit(self._partial)
                self._partial = ""

    def _emit(self, data: str) -> None:
        t = self.now_ms()
        if self.events and t - self.events[-1]["t"] < 20:
            self.events[-1]["data"] += data  # merge bursts: smaller files
            return
        self.events.append({"t": t, "type": "console", "data": data})

    def wait_for(self, pattern: str, timeout: float) -> bool:
        regex = re.compile(pattern)
        deadline = time.monotonic() + timeout
        with self._lock:
            while not regex.search(_ANSI.sub("", self.text)):
                left = deadline - time.monotonic()
                if left <= 0:
                    return False
                self._changed.wait(left)
        return True


def merge(console: list[dict], screen: list[dict]) -> list[dict]:
    """Both event lists in time order (console first at equal times)."""
    return sorted(console + screen, key=lambda e: (e["t"], e["type"] != "console"))


# ---------------------------------------------------------------------------
# Scenes
# ---------------------------------------------------------------------------

READY = r"Aember Init System started successfully"
PROMPT = r"~ # $|# $"

# A step: ("wait", regex, seconds) | ("sleep", seconds) | ("type", text)
#         | ("type_slowly", text) (one key every 60 ms, looks typed)
#         | ("open_shell",): press d until the shell prompt shows (3 tries)
SCENES: dict[str, dict] = {
    "boot": {
        "title": "Boot",
        "description": (
            "From the kernel to the initramfs, the switch to the real root, "
            "PID 1, the network and the containers; aember-monitor comes up "
            "on the screen."
        ),
        "timeout": 50,
        "steps": [("wait", READY, 40), ("sleep", 25)],
    },
    "kill-service": {
        "title": "A service dies and comes back",
        "description": (
            "A shell kills aember-netd and the aember-echo container's app; "
            "PID 1 restarts the service, containerd restarts the container, "
            "and the screen shows both coming back."
        ),
        "timeout": 75,
        "steps": [
            ("wait", READY, 40),
            ("sleep", 10),
            ("open_shell",),
            ("sleep", 1),
            (
                "type_slowly",
                "kill -9 $(pidof aember-netd) "
                "$(ps | grep '[e]cho-alpine' | awk '{print $1}'); exit\n",
            ),
            ("sleep", 25),
        ],
    },
    "debug-shell": {
        "title": "The debug shell",
        "description": (
            "Press d on the console at any time: a root shell, while the "
            "console log goes quiet (the log files keep everything)."
        ),
        "timeout": 75,
        "steps": [
            ("wait", READY, 40),
            ("sleep", 6),
            ("open_shell",),
            ("sleep", 1),
            ("type_slowly", "cat /proc/1/comm\n"),
            ("sleep", 1.5),
            ("type_slowly", "ls /etc/aember\n"),
            ("sleep", 1.5),
            ("type_slowly", "ps | grep aember\n"),
            ("sleep", 2),
            ("type_slowly", "tail -n 3 /var/log/aember-netd.log\n"),
            ("sleep", 2),
            ("type_slowly", "exit\n"),
            ("sleep", 8),
        ],
    },
}


def _start_screen(command: str, screen: Screen, capture: Capture):
    argv = shlex.split(command.format(qmp=QMP_SOCKET)) + [str(1 / SCREEN_FPS)]
    proc = subprocess.Popen(
        argv, stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True
    )
    proc.stdin.write(GRABBER)
    proc.stdin.close()

    def reader() -> None:
        for line in proc.stdout:
            screen.add_line(capture.now_ms(), line)

    thread = threading.Thread(target=reader, daemon=True)
    thread.start()
    return proc, thread


def run_scene(
    name: str, command: str, screen_command: str, source: str
) -> tuple[dict, Screen]:
    scene = SCENES[name]
    argv = shlex.split(command.format(timeout=scene["timeout"], qmp=QMP_SOCKET))
    print(f"[record] {name}: {' '.join(argv)}", file=sys.stderr)
    proc = subprocess.Popen(
        argv,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,  # the aember CLI's own log
    )
    capture = Capture()
    screen = Screen()
    grabber, grab_thread = _start_screen(screen_command, screen, capture)

    def reader() -> None:
        fd = proc.stdout.fileno()
        while True:
            chunk = os.read(fd, 4096)
            if not chunk:
                break
            capture.add(chunk.decode("utf-8", errors="replace"))

    def flusher() -> None:
        while proc.poll() is None:
            capture.flush_partial()
            time.sleep(0.05)

    threads = [threading.Thread(target=f, daemon=True) for f in (reader, flusher)]
    for t in threads:
        t.start()

    def send(text: str) -> None:
        proc.stdin.write(text.encode())
        proc.stdin.flush()

    try:
        for step in scene["steps"]:
            kind = step[0]
            if kind == "wait":
                if not capture.wait_for(step[1], step[2]):
                    tail = capture.text[-1500:]
                    raise RuntimeError(
                        f"{name}: timed out waiting for {step[1]!r}; "
                        f"console ended with:\n{tail}"
                    )
            elif kind == "sleep":
                time.sleep(step[1])
            elif kind == "type":
                send(step[1])
            elif kind == "open_shell":
                for _ in range(3):
                    send("d")
                    if capture.wait_for(PROMPT, 8):
                        break
                else:
                    raise RuntimeError(f"{name}: no shell prompt")
            elif kind == "type_slowly":
                for ch in step[1]:
                    send(ch)
                    time.sleep(0.06)
    finally:
        end_ms = capture.now_ms()
        # Let the run end by itself (its --timeout): stopping a client like
        # `docker exec` would leave QEMU running in the container, holding
        # the disk image, and the next scene would fail to start.
        try:
            proc.stdin.close()
            proc.wait(timeout=scene["timeout"] + 60)
        except subprocess.TimeoutExpired:
            proc.kill()
        threads[0].join(timeout=5)
        capture.flush_partial(older_than=0)
        # The grabber ends when QEMU closes the socket.
        try:
            grabber.wait(timeout=30)
        except subprocess.TimeoutExpired:
            grabber.kill()
        grab_thread.join(timeout=5)

    console = [e for e in capture.events if e["t"] <= end_ms and e["data"]]
    screen.drop_before_final_mode()
    frames = screen.events(end_ms)
    if not frames:
        raise RuntimeError(f"{name}: no screen frames recorded")
    events = merge(console, frames)
    rec = {
        "format": FORMAT,
        "scene": name,
        "title": scene["title"],
        "description": scene["description"],
        "recorded": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "source": source,
        "duration_ms": events[-1]["t"],
        "screen": {
            "sources": [f"{name}{suffix}" for suffix in CODECS],
            "fps": SCREEN_FPS,
            "frames": len(frames),
        },
        "events": events,
    }
    return rec, screen


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--scene", default="all", choices=[*SCENES, "all"])
    ap.add_argument(
        "--out", type=Path, default=Path(__file__).parent.parent / "public/recordings"
    )
    ap.add_argument(
        "--command",
        default=DEFAULT_COMMAND,
        help="How to start aember; {timeout} and {qmp} are replaced "
        "(default: %(default)s)",
    )
    ap.add_argument(
        "--screen-command",
        default=DEFAULT_SCREEN_COMMAND,
        help="How to run Python where the QMP socket is (the grabber comes on "
        "stdin); {qmp} is replaced (default: %(default)s)",
    )
    ap.add_argument(
        "--ffmpeg", default="ffmpeg", help="ffmpeg with libvpx-vp9 and libx264"
    )
    ap.add_argument(
        "--source", default="aember, x64 QEMU", help="Shown with the recording"
    )
    args = ap.parse_args(argv)

    args.out.mkdir(parents=True, exist_ok=True)
    names = list(SCENES) if args.scene == "all" else [args.scene]
    for name in names:
        rec, screen = run_scene(name, args.command, args.screen_command, args.source)
        videos = [args.out / s for s in rec["screen"]["sources"]]
        screen.encode(args.ffmpeg, videos, rec["screen"]["frames"])
        size = sum(v.stat().st_size for v in videos) // 1024
        path = args.out / f"{name}.json"
        path.write_text(json.dumps(rec, ensure_ascii=False, separators=(",", ":")))
        print(
            f"[record] {path}: {len(rec['events'])} events, "
            f"{rec['screen']['frames']} frames ({size} KB of video), "
            f"{rec['duration_ms'] / 1000:.1f} s",
            file=sys.stderr,
        )
    # Story order: the scenes we know first, then any others.
    present = {p.stem for p in args.out.glob("*.json")} - {"index"}
    index = [n for n in SCENES if n in present] + sorted(present - set(SCENES))
    (args.out / "index.json").write_text(json.dumps({"scenes": index}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
