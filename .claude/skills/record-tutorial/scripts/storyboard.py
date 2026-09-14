"""Parse a tutorial storyboard markdown file into ordered Step objects."""
from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

VALID_ACTIONS = {"navigate", "click", "fill", "wait", "hover"}


@dataclass(frozen=True)
class Step:
    caption: str
    action: str
    target: str
    hold: float


class StoryboardError(ValueError):
    pass


_FIELD_RE = re.compile(r"^-\s*(\w+):\s*(.+)$")


def parse_storyboard(text: str) -> list[Step]:
    """Parse storyboard markdown into an ordered list of Steps.

    Each step is a level-2 markdown section:

        ## Step 1
        - caption: Open the Gameday Designer
        - action: navigate
        - target: /designer/
        - hold: 3
    """
    blocks = re.split(r"(?m)^##\s+.*$", text)[1:]
    if not blocks:
        raise StoryboardError("storyboard has no '## Step' sections")

    steps: list[Step] = []
    for i, block in enumerate(blocks, start=1):
        fields = _parse_fields(block)
        for required in ("caption", "action", "target", "hold"):
            if required not in fields:
                raise StoryboardError(f"step {i} missing required field '{required}'")

        action = fields["action"]
        if action not in VALID_ACTIONS:
            raise StoryboardError(
                f"step {i} has invalid action '{action}'; must be one of {sorted(VALID_ACTIONS)}"
            )

        try:
            hold = float(fields["hold"])
        except ValueError as exc:
            raise StoryboardError(f"step {i} has non-numeric hold '{fields['hold']}'") from exc
        if hold <= 0:
            raise StoryboardError(f"step {i} hold must be positive, got {hold}")

        steps.append(Step(caption=fields["caption"], action=action, target=fields["target"], hold=hold))
    return steps


def _parse_fields(block: str) -> dict[str, str]:
    fields: dict[str, str] = {}
    for line in block.splitlines():
        m = _FIELD_RE.match(line.strip())
        if m:
            fields[m.group(1).lower()] = m.group(2).strip()
    return fields


def load_storyboard(path: Path) -> list[Step]:
    return parse_storyboard(path.read_text())
