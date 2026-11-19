"""Tests for record.py's parsing (no aember run needed):
python3 -m unittest discover -s scripts"""

import time
import unittest

from record import SCENES, Capture, HeartbeatParser

SEP = "[2026-11-18 20:00:00] [info] [aember-monitor] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\r\n"
BLOCK = [
    SEP,
    "[t] [info] [aember-monitor]   Aember PID1  │ pid=1 │ rss=5032kB │ threads=6 │ children=5 │ uptime=58s\r\n",
    "[t] [info] [aember-monitor]   Network      │ ONLINE  │ iface=eth0 │ rtt=16ms │ ip=10.0.2.15\r\n",
    "[t] [info] [aember-monitor]   Services     │ 2 service(s)\r\n",
    "[t] [info] [aember-monitor]     ├─ aember-netd [running] (process)\r\n",
    "[t] [info] [aember-monitor]     ├─ aember-echo [running] (container)\r\n",
    SEP,
]


class HeartbeatParserTest(unittest.TestCase):
    def test_block_becomes_one_heartbeat(self):
        p = HeartbeatParser()
        outs = [p.feed(line) for line in BLOCK]
        self.assertTrue(all(o is None for o in outs[:-1]))
        kind, beat = outs[-1]
        self.assertEqual(kind, "heartbeat")
        self.assertEqual(
            beat["pid1"],
            {"pid": 1, "rss_kb": 5032, "threads": 6, "children": 5, "uptime_s": 58},
        )
        self.assertEqual(
            beat["network"],
            {"online": True, "iface": "eth0", "rtt_ms": 16, "ip": "10.0.2.15"},
        )
        self.assertEqual(
            beat["services"],
            [
                {"name": "aember-netd", "state": "running", "type": "process"},
                {"name": "aember-echo", "state": "running", "type": "container"},
            ],
        )

    def test_other_lines_pass_through(self):
        p = HeartbeatParser()
        line = "[t] [info] [netd] netd ready\r\n"
        self.assertEqual(p.feed(line), ("console", line))
        self.assertEqual(p.feed("~ # "), ("console", "~ # "))

    def test_network_not_reported_and_offline(self):
        p = HeartbeatParser()
        p.feed(SEP)
        p.feed(
            "[aember-monitor]   Network      │ not reported (no aember network service)\n"
        )
        self.assertIsNone(p.feed(SEP)[1]["network"])
        p.feed(SEP)
        p.feed("[aember-monitor]   Network      │ OFFLINE │ iface= │ rtt=-1ms │ ip=\n")
        net = p.feed(SEP)[1]["network"]
        self.assertFalse(net["online"])
        self.assertEqual(net["rtt_ms"], -1)

    def test_stray_monitor_line_is_dropped(self):
        p = HeartbeatParser()
        self.assertIsNone(p.feed("[aember-monitor]     ├─ x [running] (process)\n"))

    def test_ansi_colours_do_not_break_parsing(self):
        p = HeartbeatParser()
        p.feed("\x1b[32m" + SEP)
        p.feed("\x1b[0m[aember-monitor]     ├─ a [failed] (process)\n")
        self.assertEqual(p.feed(SEP)[1]["services"][0]["state"], "failed")


class CaptureTest(unittest.TestCase):
    def test_lines_heartbeats_and_partial_prompt(self):
        c = Capture()
        c.add("hello\r\nwor")
        c.add("ld\r\n")
        for line in BLOCK:
            c.add(line)
        c.add("~ # ")
        c.flush_partial(older_than=0)
        kinds = [e["type"] for e in c.events]
        self.assertIn("heartbeat", kinds)
        text = "".join(e["data"] for e in c.events if e["type"] == "console")
        self.assertEqual(text, "hello\r\nworld\r\n~ # ")
        self.assertNotIn("aember-monitor", text)

    def test_wait_for(self):
        c = Capture()
        self.assertFalse(c.wait_for("ready", 0.05))
        c.add("system ready\n")
        self.assertTrue(c.wait_for("ready", 0.05))

    def test_timestamps_increase(self):
        c = Capture()
        c.add("a\n")
        time.sleep(0.05)
        c.add("b\n")
        ts = [e["t"] for e in c.events]
        self.assertEqual(ts, sorted(ts))


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
