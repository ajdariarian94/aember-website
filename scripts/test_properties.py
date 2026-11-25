"""Property-based tests (Hypothesis) for record.py:
python3 -m unittest discover -s scripts (needs scripts/requirements-dev.txt;
skipped without Hypothesis).

- Capture: however QEMU's output is split into chunks, the events carry
  exactly that text, in order, none empty, times not going back.
- merge: a time-ordered permutation of both lists, console first at equal
  times, and the order within one list kept (the player replays events in
  this order).
- Screen: the frames' events count up from 0 in time order; dropping the
  frames before the final display mode only drops leading frames."""

import unittest

try:
    from hypothesis import given, settings
    from hypothesis import strategies as st
except ImportError:
    raise unittest.SkipTest("hypothesis is not installed (scripts/requirements-dev.txt)")

from record import Capture, Screen, merge, png_size
from test_record import png

PIECES = st.sampled_from(
    ["a", "Z", " ", "~ # ", "\n", "\r\n", "\r", "\x1b[32m", "\x1b[0m", "é", "ready"]
)


class CaptureProperty(unittest.TestCase):
    @given(pieces=st.lists(PIECES, max_size=40), cuts=st.sets(st.integers(0, 300)))
    @settings(max_examples=300)
    def test_events_carry_exactly_the_output(self, pieces, cuts):
        text = "".join(pieces)
        points = sorted({0, len(text), *[c for c in cuts if c <= len(text)]})
        c = Capture()
        for a, b in zip(points, points[1:]):
            c.add(text[a:b])
        c.flush_partial(older_than=-1)  # the prompt at the end, if any
        self.assertEqual("".join(e["data"] for e in c.events), text)
        self.assertTrue(all(e["data"] for e in c.events))
        self.assertTrue(all(e["type"] == "console" for e in c.events))
        ts = [e["t"] for e in c.events]
        self.assertEqual(ts, sorted(ts))
        self.assertEqual(c.text, text)


def events(kind: str, times: list[int]) -> list[dict]:
    return [{"t": t, "type": kind, "data": f"{kind}{i}"} for i, t in enumerate(times)]


class MergeProperty(unittest.TestCase):
    @given(
        console=st.lists(st.integers(0, 50), max_size=20).map(sorted),
        screen=st.lists(st.integers(0, 50), max_size=20).map(sorted),
    )
    def test_time_ordered_console_first_each_list_in_order(self, console, screen):
        a, b = events("console", console), events("screen", screen)
        out = merge(a, b)
        self.assertEqual(sorted(map(id, out)), sorted(map(id, a + b)))
        keys = [(e["t"], e["type"] != "console") for e in out]
        self.assertEqual(keys, sorted(keys))
        self.assertEqual([e for e in out if e["type"] == "console"], a)
        self.assertEqual([e for e in out if e["type"] == "screen"], b)


SIZES = st.sampled_from([(640, 480), (1280, 800), (720, 400)])


class ScreenProperty(unittest.TestCase):
    @given(sizes=st.lists(SIZES, max_size=12), until=st.integers(0, 15000))
    def test_frame_events_count_up_in_time(self, sizes, until):
        s = Screen()
        s.frames = [(i * 1000, png(*size)) for i, size in enumerate(sizes)]
        s.drop_before_final_mode()
        if sizes:
            final = sizes[-1]
            first = sizes.index(final)
            self.assertEqual([png_size(p) for _, p in s.frames], [
                tuple(x) for x in sizes[first:]
            ])
        ev = s.events(until)
        self.assertEqual([e["data"] for e in ev], list(range(len(ev))))
        self.assertTrue(all(e["t"] <= until and e["type"] == "screen" for e in ev))
        self.assertEqual([e["t"] for e in ev], sorted(e["t"] for e in ev))


if __name__ == "__main__":
    unittest.main()
