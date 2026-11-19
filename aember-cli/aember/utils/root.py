import json
from pathlib import Path


def find_root(start: Path | None = None) -> Path:
    """Walk up from `start` (default: cwd) to the aember-website root."""
    here = (start or Path.cwd()).resolve()
    for candidate in (here, *here.parents):
        pkg = candidate / "package.json"
        if pkg.is_file():
            try:
                if json.loads(pkg.read_text()).get("name") == "aember-website":
                    return candidate
            except ValueError:
                pass
    raise RuntimeError(f"Not inside aember-website (no package.json above {here})")
