# aember/cli/app.py

import typer  # type: ignore
from aember.utils.logging import setup_logging

from .base.commands import build, clean, dev, install, lint, preview, record, test

aember = typer.Typer(help="aember-website: build, test and record the website")


@aember.callback()
def main(
    verbose: bool = typer.Option(
        False,
        "--verbose",
        "-v",
        help="Enable verbose logging",
    )
):
    setup_logging(verbose)


aember.command(help="Install the Node packages (npm ci)")(install)
aember.command(help="Development server with hot reload (http://localhost:5173)")(dev)
aember.command(help="Type check + production build into dist/")(build)
aember.command(help="Serve the production build (http://localhost:4173)")(preview)
aember.command(help="Run the tests: CLI, recorder, Vitest (and Playwright)")(test)
aember.command(help="Record demo scenes from a real aember run")(record)
aember.command(help="Type check TypeScript, lint Python (ruff + black)")(lint)
aember.command(help="Remove build and test output")(clean)
