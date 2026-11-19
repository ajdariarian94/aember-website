"""npm steps: install, scripts and tools from node_modules."""

import logging
import shutil

from aember.core.context import Context
from aember.core.step import Step
from aember.utils.runner import CommandRunner

log = logging.getLogger("aember.npm")


def npm() -> str:
    path = shutil.which("npm")
    if not path:
        raise RuntimeError("npm not found: work in the dev container (Node 22).")
    return path


def needs_install(ctx: Context) -> bool:
    """node_modules missing or older than package-lock.json."""
    marker = ctx.root / "node_modules" / ".package-lock.json"
    lock = ctx.root / "package-lock.json"
    return not marker.exists() or marker.stat().st_mtime < lock.stat().st_mtime


class NpmInstall(Step):
    """`npm ci` when node_modules is missing or stale (or always with force)."""

    def __init__(self, force: bool = False) -> None:
        self.force = force

    def run(self, ctx: Context) -> None:
        if not self.force and not needs_install(ctx):
            log.debug("node_modules is up to date")
            return
        log.info("Installing the Node packages (npm ci)")
        CommandRunner.run([npm(), "ci", "--no-audit", "--no-fund"], cwd=ctx.root)


class NpmScript(Step):
    """`npm run <script> [-- args]` from package.json."""

    def __init__(self, script: str, args: list[str] | None = None) -> None:
        self.script = script
        self.args = args or []

    def run(self, ctx: Context) -> None:
        log.info("npm run %s %s", self.script, " ".join(self.args))
        cmd = [npm(), "run", self.script]
        if self.args:
            cmd += ["--", *self.args]
        CommandRunner.run(cmd, cwd=ctx.root)
