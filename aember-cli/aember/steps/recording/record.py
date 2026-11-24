"""
`aember record`: record demo scenes with scripts/record.py.

aember runs where its own toolchain is: the aember dev container. This
step finds that container (the running one that mounts the aember
workspace) and lets the recorder start each scene there with
`docker exec -i`, and its screen grabber (Python, on QEMU's QMP socket)
the same way. Inside the aember container itself (where `aember app
launch` works directly), use `--command` to run it locally.
"""

import json
import logging
import shlex
import subprocess
import sys

from aember.config import website
from aember.core.context import Context
from aember.core.step import Step
from aember.utils.runner import CommandRunner

log = logging.getLogger("aember.record")


def aember_container(
    inspect_json: str, workspace: str = website.AEMBER_WORKSPACE
) -> str | None:
    """Name of the running container that mounts @p workspace."""
    for c in json.loads(inspect_json or "[]"):
        if not c.get("State", {}).get("Running"):
            continue
        if any(m.get("Destination") == workspace for m in c.get("Mounts", [])):
            return c.get("Name", "").lstrip("/") or None
    return None


def find_aember_container() -> str:
    ids = subprocess.run(
        ["docker", "ps", "-q"], capture_output=True, text=True, check=True
    ).stdout.split()
    if ids:
        out = subprocess.run(
            ["docker", "inspect", *ids], capture_output=True, text=True, check=True
        ).stdout
        if name := aember_container(out):
            return name
    raise RuntimeError(
        f"No running container mounts {website.AEMBER_WORKSPACE}: open the aember "
        "repository in its dev container first (or pass --command)."
    )


def docker_command(container: str, launch: str = website.AEMBER_LAUNCH) -> str:
    """The recorder's --command: aember's launch inside @p container."""
    return (
        f"docker exec -i -w {website.AEMBER_WORKSPACE} {container} "
        f"bash -lc {shlex.quote('PATH=/venv/bin:$PATH ' + launch)}"
    )


def docker_screen_command(container: str) -> str:
    """The recorder's --screen-command: Python next to QEMU's QMP socket."""
    return f"docker exec -i {container} python3 - {{qmp}}"


class RecordScenes(Step):
    def __init__(
        self,
        scene: str,
        source: str,
        command: str | None,
        screen_command: str | None = None,
        ffmpeg: str = "ffmpeg",
    ) -> None:
        self.scene = scene
        self.source = source
        self.command = command
        self.screen_command = screen_command
        self.ffmpeg = ffmpeg

    def run(self, ctx: Context) -> None:
        command, screen = self.command, self.screen_command
        if not command or not screen:
            container = find_aember_container()
            command = command or docker_command(container)
            screen = screen or docker_screen_command(container)
        log.info("Recording %s with: %s", self.scene, command)
        CommandRunner.run(
            [
                sys.executable,
                str(ctx.root / "scripts" / "record.py"),
                "--scene",
                self.scene,
                "--source",
                self.source,
                "--command",
                command,
                "--screen-command",
                screen,
                "--ffmpeg",
                self.ffmpeg,
            ],
            cwd=ctx.root,
        )
