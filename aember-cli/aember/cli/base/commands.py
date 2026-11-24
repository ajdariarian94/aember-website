# aember/cli/base/commands.py
#
# Thin Typer commands: each builds a Context and runs a Pipeline.

import typer  # type: ignore

from aember.config import website
from aember.core.context import Context
from aember.core.pipeline import Pipeline
from aember.steps.clean import CleanStep
from aember.steps.linting import LintStep
from aember.steps.npm.npm import NpmInstall, NpmScript
from aember.steps.recording.record import RecordScenes
from aember.steps.testing import PythonTests

SCENES = ["all", "boot", "kill-service", "debug-shell"]


def install(
    force: bool = typer.Option(False, "--force", help="Reinstall even if up to date"),
):
    Pipeline([NpmInstall(force=force)]).run(Context())


def dev(
    port: int = typer.Option(website.DEV_PORT, help="Port"),
):
    Pipeline([NpmInstall(), NpmScript("dev", ["--host", "--port", str(port)])]).run(
        Context()
    )


def build():
    Pipeline([NpmInstall(), NpmScript("build")]).run(Context())


def preview():
    Pipeline([NpmInstall(), NpmScript("build"), NpmScript("preview", ["--host"])]).run(
        Context()
    )


def test(
    e2e: bool = typer.Option(
        False, "--e2e", help="Also build and run the Playwright tests"
    ),
    no_cli: bool = typer.Option(False, "--no-cli", help="Skip the CLI's own tests"),
    only_cli: bool = typer.Option(False, "--cli", help="Only the CLI's own tests"),
):
    steps = [] if no_cli else [PythonTests("aember-cli/tests", top="aember-cli")]
    if not only_cli:
        steps += [
            PythonTests("scripts"),
            NpmInstall(),
            NpmScript("test"),
        ]
        if e2e:
            steps += [NpmScript("build"), NpmScript("test:e2e")]
    Pipeline(steps).run(Context())


def record(
    scene: str = typer.Option(
        "all", "--scene", "-s", help=f"One of {', '.join(SCENES)}"
    ),
    source: str = typer.Option(
        ..., "--source", help='Shown with the recording, e.g. "aember 0.13.0, x64 QEMU"'
    ),
    command: str = typer.Option(
        None,
        "--command",
        help="How to start aember ({timeout} and {qmp} are replaced). Default: "
        "`aember app launch --headless` in the running aember dev container.",
    ),
    screen_command: str = typer.Option(
        None,
        "--screen-command",
        help="How to run Python next to QEMU's QMP socket ({qmp} is replaced). "
        "Default: `python3 -` in the running aember dev container.",
    ),
    ffmpeg: str = typer.Option(
        "ffmpeg", "--ffmpeg", help="ffmpeg with libx264, for the screen video"
    ),
):
    if scene not in SCENES:
        raise typer.BadParameter(f"--scene must be one of {SCENES}")
    Pipeline(
        [
            RecordScenes(scene, source, command, screen_command, ffmpeg),
            NpmScript("test"),
        ]
    ).run(Context())


def lint(
    fix: bool = typer.Option(False, "--fix", help="Let ruff and black fix"),
):
    Pipeline([NpmInstall(), NpmScript("typecheck"), LintStep(fix=fix)]).run(Context())


def clean(
    all_: bool = typer.Option(False, "--all", help="Also remove node_modules"),
):
    Pipeline([CleanStep(all_=all_)]).run(Context())
