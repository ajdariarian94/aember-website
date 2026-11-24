"""Tests for record.py (no aember run needed):
python3 -m unittest discover -s scripts"""

import base64
import json
import os
import socket
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from pathlib import Path

from record import (
    GRABBER,
    SCENES,
    SCREEN_FPS,
    CODECS,
    Capture,
    Screen,
    ffmpeg_command,
    merge,
    png_size,
)


def png(width: int = 1280, height: int = 800) -> bytes:
    ihdr = width.to_bytes(4, "big") + height.to_bytes(4, "big")
    return b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR" + ihdr + b"rest"


PNG = png()


class CaptureTest(unittest.TestCase):
    def test_lines_and_partial_prompt(self):
        c = Capture()
        c.add("hello\r\nwor")
        c.add("ld\r\n")
        c.add("~ # ")
        c.flush_partial(older_than=0)
        self.assertEqual({e["type"] for e in c.events}, {"console"})
        text = "".join(e["data"] for e in c.events)
        self.assertEqual(text, "hello\r\nworld\r\n~ # ")

    def test_wait_for(self):
        c = Capture()
        self.assertFalse(c.wait_for("ready", 0.05))
        c.add("system \x1b[32mready\x1b[0m\n")  # colours don't matter
        self.assertTrue(c.wait_for("system ready", 0.05))

    def test_timestamps_increase_and_bursts_merge(self):
        c = Capture()
        c.add("a\n")
        c.add("b\n")  # within 20 ms: same event
        time.sleep(0.05)
        c.add("c\n")
        self.assertEqual([e["data"] for e in c.events], ["a\nb\n", "c\n"])
        ts = [e["t"] for e in c.events]
        self.assertEqual(ts, sorted(ts))


class ScreenTest(unittest.TestCase):
    def test_frames_from_base64_lines(self):
        s = Screen()
        s.add_line(100, base64.b64encode(PNG).decode() + "\n")
        s.add_line(150, "\n")  # blank: ignored
        s.add_line(200, "not base64!")  # ignored
        s.add_line(250, base64.b64encode(b"GIF89a").decode())  # not a PNG
        s.add_line(1100, base64.b64encode(PNG).decode())
        self.assertEqual([t for t, _ in s.frames], [100, 1100])
        self.assertEqual(
            s.events(until_ms=1000), [{"t": 100, "type": "screen", "data": 0}]
        )
        self.assertEqual([e["data"] for e in s.events(5000)], [0, 1])

    def test_png_size(self):
        self.assertEqual(png_size(png(640, 480)), (640, 480))

    def test_frames_before_the_final_mode_are_dropped(self):
        s = Screen()
        s.frames = [(0, png(640, 480)), (1000, png(640, 480)), (2000, PNG)]
        s.frames += [(3000, PNG)]
        s.drop_before_final_mode()
        self.assertEqual([t for t, _ in s.frames], [2000, 3000])
        self.assertEqual([e["data"] for e in s.events(5000)], [0, 1])
        Screen().drop_before_final_mode()  # no frames: nothing to do

    def test_merge_keeps_time_order_console_first(self):
        console = [{"t": 0, "type": "console", "data": "a"}]
        console.append({"t": 1000, "type": "console", "data": "b"})
        screen = [{"t": 1000, "type": "screen", "data": 0}]
        screen.append({"t": 500, "type": "screen", "data": 1})
        self.assertEqual(
            [(e["t"], e["type"]) for e in merge(console, screen)],
            [(0, "console"), (500, "screen"), (1000, "console"), (1000, "screen")],
        )

    def test_ffmpeg_commands(self):
        mp4 = ffmpeg_command("ff", Path("/f/%05d.png"), Path("/o/boot.mp4"))
        self.assertEqual(mp4[0], "ff")
        self.assertEqual(mp4[-1], "/o/boot.mp4")
        joined = " ".join(mp4)
        self.assertIn(f"-framerate {SCREEN_FPS} -i /f/%05d.png", joined)
        self.assertIn("-c:v libx264", joined)
        self.assertIn("-pix_fmt yuv420p", joined)  # plays in every browser
        self.assertIn("-movflags +faststart", joined)
        webm = " ".join(ffmpeg_command("ff", Path("/f/%05d.png"), Path("/o/b.webm")))
        self.assertIn("-c:v libvpx-vp9", webm)
        self.assertNotIn("libx264", webm)
        self.assertEqual(list(CODECS), [".webm", ".mp4"])  # the page's order


class FakeQmp:
    """A QMP server on a Unix socket that answers screendump with a PNG."""

    def __init__(self, path: str, shots: int) -> None:
        self.sock = socket.socket(socket.AF_UNIX)
        self.sock.bind(path)
        self.sock.listen(1)
        self.commands: list[str] = []
        self.shots = shots
        self.thread = threading.Thread(target=self.serve, daemon=True)
        self.thread.start()

    def serve(self) -> None:
        conn, _ = self.sock.accept()
        f = conn.makefile("rw")
        f.write('{"QMP": {}}\n')
        f.flush()
        while self.shots > 0:
            req = json.loads(f.readline())
            self.commands.append(req["execute"])
            if req["execute"] == "screendump":
                Path(req["arguments"]["filename"]).write_bytes(PNG)
                self.shots -= 1
            f.write('{"return": {}}\n')
            f.flush()
        conn.close()  # QEMU went away
        self.sock.close()


class GrabberTest(unittest.TestCase):
    def test_grabber_prints_frames_until_qemu_is_gone(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "qmp.sock")
            qmp = FakeQmp(path, shots=3)
            out = subprocess.run(
                [sys.executable, "-", path, "0.01"],
                input=GRABBER,
                capture_output=True,
                text=True,
                timeout=30,
            )
            self.assertEqual(out.returncode, 0, out.stderr)
            lines = out.stdout.split()
            self.assertEqual([base64.b64decode(x) for x in lines], [PNG] * 3)
            self.assertEqual(qmp.commands[0], "qmp_capabilities")
            self.assertEqual(qmp.commands[1:], ["screendump"] * 3)


class ScenesTest(unittest.TestCase):
    def test_scenes_are_well_formed(self):
        self.assertEqual(list(SCENES), ["boot", "kill-service", "debug-shell"])
        for name, scene in SCENES.items():
            self.assertTrue(scene["title"] and scene["description"], name)
            self.assertEqual(scene["steps"][0][0], "wait", name)
            for step in scene["steps"]:
                self.assertIn(
                    step[0], {"wait", "sleep", "type", "type_slowly", "open_shell"}
                )


if __name__ == "__main__":
    unittest.main()
