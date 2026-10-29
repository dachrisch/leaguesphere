"""Per-league crew slots for the scorecard preparation screen.

The scorecard needs to know which positions a league's crew has, in which
order they are shown and which of them count towards "crew complete". That is
configuration, not code: associations name, order and count their crew
differently.

Three rules shape this module:

- **Configured rows are overrides, never a replacement.** The result always
  starts from :data:`DEFAULT_CREW_POSITIONS` — the five slots the preparation
  screen used to hard-code, Scorecard Judge optional and the four refereed
  positions required. A row whose `position` matches a default overrides that
  default's `label`, `order` and `required`; a row with a new `position` is
  appended after the defaults; every default nobody touched stays. One admin
  row can therefore not make the standard crew disappear, and the officials
  step is never empty (for a league without rows the defaults come back
  unchanged, and a league created tomorrow needs no data migration).
- **Hiding a default position is not part of this model.** There is no
  disable/delete flag: the crew *count* and which slots a sport needs belong to
  the crew template layer. Adding such a flag would need a column (migration
  `officials.0016` deliberately does not have one).
- **`position` is the wire value.** The scorecard upserts a `GameOfficial` by
  that exact string; `label` is display only.

Ordering: the merged list is sorted by `order`, with a stable fallback so equal
`order` values never shuffle — defaults keep their built-in sequence first,
configured additions follow in the order the league entered them.
"""

from typing import Dict, Iterable, List

from gamedays.models import Gameinfo
from officials.models import CrewPosition

#: The slots every league starts from. Keep in sync with what the scorecard
#: wrote before this was configurable — changing these changes the behaviour of
#: every league that does not override them.
DEFAULT_CREW_POSITIONS: List[Dict] = [
    {
        "position": "Scorecard Judge",
        "label": "Scorecard Judge",
        "order": 1,
        "required": False,
    },
    {"position": "Referee", "label": "Schiedsrichter", "order": 2, "required": True},
    {"position": "Down Judge", "label": "Down Judge", "order": 3, "required": True},
    {"position": "Field Judge", "label": "Field Judge", "order": 4, "required": True},
    {"position": "Side Judge", "label": "Side Judge", "order": 5, "required": True},
]


def merge_crew_positions(configured: Iterable[Dict]) -> List[Dict]:
    """Overlay configured rows on the defaults and sort the result.

    `configured` are rows in the league's own order (already ordered by `order`,
    `id`). Pure function: the shared defaults are copied, never mutated.
    """
    merged: Dict[str, Dict] = {}
    # Tie-break for equal `order` values: the default sequence first, then the
    # configured sequence. Keeps the output deterministic and stable.
    tie_break: Dict[str, int] = {}
    for index, default in enumerate(DEFAULT_CREW_POSITIONS):
        merged[default["position"]] = dict(default)
        tie_break[default["position"]] = index
    next_tie_break = len(DEFAULT_CREW_POSITIONS)

    for row in configured:
        position = row["position"]
        tie_break.setdefault(position, next_tie_break)
        if position not in merged:
            next_tie_break += 1
        merged[position] = {
            "position": position,
            "label": row["label"],
            "order": row["order"],
            "required": row["required"],
        }

    return sorted(
        merged.values(),
        key=lambda slot: (slot["order"], tie_break[slot["position"]]),
    )


def crew_positions_for_league(league_id: int) -> List[Dict]:
    """The effective slots of one league: defaults merged with its overrides.

    One query. An empty result means "no overrides", never "no slots": the
    officials step must not render empty for a league nobody has set up.
    """
    rows = list(
        CrewPosition.objects.filter(league_id=league_id)
        .order_by("order", "id")
        .values("position", "label", "order", "required")
    )
    return merge_crew_positions(rows)


def crew_positions_for_game(gameinfo_id: int) -> List[Dict]:
    """Resolve game → gameday → league and return that league's slots.

    Raises `Gameinfo.DoesNotExist` for an unknown game so the API can answer
    `404` instead of pretending a league's defaults apply.
    """
    league_id = (
        Gameinfo.objects.filter(pk=gameinfo_id)
        .values_list("gameday__league_id", flat=True)
        .first()
    )
    if league_id is None:
        raise Gameinfo.DoesNotExist(f"Gameinfo {gameinfo_id} does not exist")
    return crew_positions_for_league(league_id)
