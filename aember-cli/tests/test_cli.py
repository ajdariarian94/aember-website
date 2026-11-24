"""The website CLI: repo discovery, finding the aember container, the
recorder command, npm install decisions, clean."""

import json
import os
import shlex
import tempfile
import time
import unittest
from pathlib import Path

from aember.config import website
from aember.core.context import Context
from aember.steps.clean import CleanStep
from aember.steps.npm.npm import needs_install
from aember.steps.recording.record import (
    aember_container,
    docker_command,
    docker_screen_command,
)
from aember.utils.root import find_root


def make_repo(tmp: Path) -> Path:
    (tmp / "package.json").write_text(json.dumps({"name": "aember-website"}))
    (tmp / "package-lock.json").write_text("{}")
    return tmp


class RootTest(unittest.TestCase):
    def test_finds_the_website_root_from_a_subdir(self):
        with tempfile.TemporaryDirectory() as t:
            root = make_repo(Path(t))
            sub = root / "src" / "pages"
            sub.mkdir(parents=True)
            self.assertEqual(find_root(sub), root.resolve())

    def test_other_package_json_is_not_the_root(self):
        with tempfile.TemporaryDirectory() as t:
            (Path(t) / "package.json").write_text('{"name": "something-else"}')
            with self.assertRaises(RuntimeError):
                find_root(Path(t))


class RecordTest(unittest.TestCase):
    INSPECT = [
        {
            "Name": "/stopped",
            "State": {"Running": False},
            "Mounts": [{"Destination": "/aember_ws/aember"}],
        },
        {
            "Name": "/resources",
            "State": {"Running": True},
            "Mounts": [{"Destination": "/aember_ws/aember-resources"}],
        },
        {
            "Name": "/dev-aember",
            "State": {"Running": True},
            "Mounts": [{"Destination": "/aember_ws/aember"}],
        },
    ]

    def test_picks_the_running_container_with_the_aember_workspace(self):
        self.assertEqual(aember_container(json.dumps(self.INSPECT)), "dev-aember")
        self.assertIsNone(aember_container(json.dumps(self.INSPECT[:2])))
        self.assertIsNone(aember_container(""))

    def test_command_runs_aember_launch_there_with_the_timeout(self):
        cmd = docker_command("dev-aember")
        argv = shlex.split(cmd.format(timeout=45, qmp="/tmp/q.sock"))  # as record.py
        self.assertEqual(
            argv[:6],
            ["docker", "exec", "-i", "-w", website.AEMBER_WORKSPACE, "dev-aember"],
        )
        self.assertEqual(argv[6:8], ["bash", "-lc"])
        self.assertIn(
            "aember app launch --headless --timeout 45 --qmp /tmp/q.sock", argv[8]
        )
        self.assertIn("/venv/bin", argv[8])

    def test_screen_grabber_runs_python_in_the_same_container(self):
        cmd = docker_screen_command("dev-aember").format(qmp="/tmp/q.sock")
        self.assertEqual(
            shlex.split(cmd),
            ["docker", "exec", "-i", "dev-aember", "python3", "-", "/tmp/q.sock"],
        )


class NpmTest(unittest.TestCase):
    def test_install_when_missing_or_older_than_the_lock_file(self):
        with tempfile.TemporaryDirectory() as t:
            root = make_repo(Path(t))
            ctx = Context(root=root)
            self.assertTrue(needs_install(ctx))
            marker = root / "node_modules" / ".package-lock.json"
            marker.parent.mkdir()
            marker.write_text("{}")
            self.assertFalse(needs_install(ctx))
            future = time.time() + 10
            os.utime(root / "package-lock.json", (future, future))
            self.assertTrue(needs_install(ctx))


class CleanTest(unittest.TestCase):
    def test_removes_outputs_and_keeps_sources(self):
        with tempfile.TemporaryDirectory() as t:
            root = make_repo(Path(t))
            for d in ("dist", "test-results", "node_modules", "src"):
                (root / d).mkdir()
            (root / "tsconfig.tsbuildinfo").write_text("x")
            CleanStep().run(Context(root=root))
            self.assertFalse((root / "dist").exists())
            self.assertFalse((root / "tsconfig.tsbuildinfo").exists())
            self.assertTrue((root / "node_modules").exists())
            self.assertTrue((root / "src").exists())
            CleanStep(all_=True).run(Context(root=root))
            self.assertFalse((root / "node_modules").exists())


if __name__ == "__main__":
    unittest.main()
