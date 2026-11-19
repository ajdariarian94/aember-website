import logging
import shutil

from aember.config import website
from aember.core.context import Context
from aember.core.step import Step

log = logging.getLogger("aember.clean")


class CleanStep(Step):
    """Remove the build and test output (and node_modules with all_)."""

    def __init__(self, all_: bool = False) -> None:
        self.all = all_

    def run(self, ctx: Context) -> None:
        names = [*website.OUTPUTS, *(["node_modules"] if self.all else [])]
        for name in names:
            path = ctx.root / name
            if path.is_dir():
                shutil.rmtree(path)
            elif path.exists():
                path.unlink()
            else:
                continue
            log.info("Removed %s", name)
