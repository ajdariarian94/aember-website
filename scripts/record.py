#!/usr/bin/env python3
"""
Record aember sessions for the website's demo page.

Runs a real aember (QEMU headless, or the chroot launcher) with a scripted
scene, timestamps everything the console prints and writes one JSON file
per scene into public/recordings/. The heartbeat block PID 1 prints every
second is not kept as console text: it becomes a "heartbeat" event the
demo page shows as a dashboard.

Run it where the `aember` command works (the aember dev container), e.g.

    scripts/record.py --scene all

or from the host through docker:

    scripts/record.py --scene boot \
        --command 'docker exec -i -w /aember_ws/aember <container> \
                   aember app launch --headless --timeout {timeout}'

Redo the recordings after each aember release (needs `aember app build`
and `aember app pack` for x64 first). Standard library only.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import shlex
import subprocess
import sys
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path

FORMAT = 1
DEFAULT_COMMAND = "aember app launch --headless --timeout {timeout}"

# ---------------------------------------------------------------------------
# Heartbeat block -> dashboard data
# ---------------------------------------------------------------------------

_MONITOR = "[aember-monitor]"
_SEPARATOR = "━━━━"
_PID1 = re.compile(
    r"Aember PID1\s+│ pid=(\d+) │ rss=(\d+)kB │ threads=(\d+) │ "
    r"children=(\d+) │ uptime=(\d+)s"
)
_NETWORK = re.compile(
    r"Network\s+│ (ONLINE|OFFLINE)\s*│ iface=(\S*) │ rtt=(-?\d+)ms │ ip=(\S*)"
)
_NO_NETWORK = re.compile(r"Network\s+│ not reported")
_SERVICE = re.compile(r"├─ (\S+) \[([^\]]+)\] \((\w+)\)")
_ANSI = re.compile(r"\x1b\[[0-9;?]*[A-Za-z]")


class HeartbeatParser:
    """
    Feed it console lines; it swallows the [aember-monitor] block and
    returns a heartbeat dict when the block is complete. Lines that are not
    part of a block are returned as they are (kind "console").
    """

    def __init__(self) -> None:
        self._block: dict | None = None

    def feed(self, line: str) -> tuple[str, object] | None:
        """("console", text) | ("heartbeat", dict) | None (swallowed)."""
        plain = _ANSI.sub("", line)
        if _MONITOR not in plain:
            return ("console", line)
        if _SEPARATOR in plain:
            if self._block is None:
                self._block = {"pid1": None, "network": None, "services": []}
                return None
            block, self._block = self._block, None
            return ("heartbeat", block)
        if self._block is None:
            return None  # a stray monitor line: drop it
        if m := _PID1.search(plain):
            pid, rss, threads, children, uptime = map(int, m.groups())
            self._block["pid1"] = {
                "pid": pid,
                "rss_kb": rss,
                "threads": threads,
                "children": children,
                "uptime_s": uptime,
            }
        elif m := _NETWORK.search(plain):
            self._block["network"] = {
                "online": m.group(1) == "ONLINE",
                "iface": m.group(2),
                "rtt_ms": int(m.group(3)),
                "ip": m.group(4),
            }
        elif _NO_NETWORK.search(plain):
            self._block["network"] = None
        elif m := _SERVICE.search(plain):
            name, state, kind = m.groups()
            self._block["services"].append(
                {"name": name, "state": state, "type": kind}
            )
        return None


# ---------------------------------------------------------------------------
# Console capture
# ---------------------------------------------------------------------------


@dataclass
class Capture:
    """Timestamped console output of one run, split into lines."""

    start: float = field(default_factory=time.monotonic)
    events: list[dict] = field(default_factory=list)
    text: str = ""  # everything so far, for wait_for()
    _parser: HeartbeatParser = field(default_factory=HeartbeatParser)
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
            while "\n" in self._partial:
                line, self._partial = self._partial.split("\n", 1)
                self._emit(line + "\n")
            self._changed.notify_all()

    def flush_partial(self, older_than: float = 0.15) -> None:
        """A prompt like "~ # " never ends its line: emit it after a pause."""
        with self._lock:
            if self._partial and time.monotonic() - self._partial_since > older_than:
                self._emit(self._partial)
                self._partial = ""

    def _emit(self, text: str) -> None:
        out = self._parser.feed(text)
        if out is None:
            return
        kind, data = out
        t = self.now_ms()
        if kind == "console" and self.events and self.events[-1]["type"] == "console":
            last = self.events[-1]
            if t - last["t"] < 20:  # merge bursts: smaller files, same look
                last["data"] += data
                return
        self.events.append({"t": t, "type": kind, "data": data})

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
            "PID 1, the network and the containers."
        ),
        "timeout": 45,
        "steps": [("wait", READY, 40), ("sleep", 20)],
    },
    "kill-service": {
        "title": "A service dies and comes back",
        "description": (
            "A shell kills the aember-child-demo service; PID 1 notices and "
            "restarts it after its restart delay, then a container's app is "
            "killed and containerd restarts the container."
        ),
        "timeout": 75,
        "steps": [
            ("wait", READY, 40),
            ("sleep", 8),
            ("open_shell",),
            ("sleep", 1),
            (
                "type_slowly",
                "kill -9 $(pidof aember-child-demo) "
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


def run_scene(name: str, command: str, source: str) -> dict:
    scene = SCENES[name]
    argv = shlex.split(command.format(timeout=scene["timeout"]))
    print(f"[record] {name}: {' '.join(argv)}", file=sys.stderr)
    proc = subprocess.Popen(
        argv,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,  # the aember CLI's own log
    )
    capture = Capture()

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

    events = [
        e
        for e in capture.events
        if e["t"] <= end_ms and (e["type"] != "console" or e["data"])
    ]
    if not any(e["type"] == "heartbeat" for e in events):
        raise RuntimeError(f"{name}: no heartbeat recorded")
    return {
        "format": FORMAT,
        "scene": name,
        "title": scene["title"],
        "description": scene["description"],
        "recorded": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "source": source,
        "duration_ms": events[-1]["t"] if events else 0,
        "events": events,
    }


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--scene", default="all", choices=[*SCENES, "all"])
    ap.add_argument(
        "--out", type=Path, default=Path(__file__).parent.parent / "public/recordings"
    )
    ap.add_argument(
        "--command",
        default=DEFAULT_COMMAND,
        help="How to start aember; {timeout} is replaced (default: %(default)s)",
    )
    ap.add_argument(
        "--source", default="aember, x64 QEMU", help="Shown with the recording"
    )
    args = ap.parse_args(argv)

    args.out.mkdir(parents=True, exist_ok=True)
    names = list(SCENES) if args.scene == "all" else [args.scene]
    for name in names:
        rec = run_scene(name, args.command, args.source)
        path = args.out / f"{name}.json"
        path.write_text(json.dumps(rec, ensure_ascii=False, separators=(",", ":")))
        beats = sum(e["type"] == "heartbeat" for e in rec["events"])
        print(
            f"[record] {path}: {len(rec['events'])} events, {beats} heartbeats, "
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
