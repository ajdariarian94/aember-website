"""`aember test`: the CLI's own tests, the recorder's, Vitest, Playwright."""

import logging
import sys

from aember.core.context import Context
from aember.core.step import Step
from aember.utils.runner import CommandRunner

log = logging.getLogger("aember.test")


class PythonTests(Step):
    """unittest discovery in @p directory (relative to the repo root)."""

    def __init__(self, directory: str, top: str | None = None) -> None:
        self.directory = directory
        self.top = top

    def run(self, ctx: Context) -> None:
        log.info("Python tests: %s", self.directory)
        cmd = [sys.executable, "-m", "unittest", "discover", "-s", self.directory]
        if self.top:
            cmd += ["-t", self.top]
        CommandRunner.run(cmd, cwd=ctx.root)
