import logging
import sys

from aember.core.context import Context
from aember.core.step import Step
from aember.utils.runner import CommandRunner

log = logging.getLogger("aember.lint")

PYTHON_DIRS = ["aember-cli", "scripts"]


class LintStep(Step):
    """ruff + black over the Python code (the TypeScript is type checked)."""

    def __init__(self, fix: bool = False) -> None:
        self.fix = fix

    def run(self, ctx: Context) -> None:
        ruff = [sys.executable, "-m", "ruff", "check", *PYTHON_DIRS]
        black = [sys.executable, "-m", "black", *PYTHON_DIRS]
        if self.fix:
            ruff.append("--fix")
        else:
            black.append("--check")
        log.info("ruff + black: %s", ", ".join(PYTHON_DIRS))
        CommandRunner.run(ruff, cwd=ctx.root)
        CommandRunner.run(black, cwd=ctx.root)
