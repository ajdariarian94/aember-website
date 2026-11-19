from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from aember.utils.root import find_root


@dataclass
class Context:
    root: Path = field(default_factory=find_root)

    # free-form shared state
    data: dict[str, Any] = field(default_factory=dict)
