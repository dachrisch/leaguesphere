"""Per-league crew slots for the scorecard preparation screen.

The scorecard needs to know which positions a league's crew has, in which
order they are shown and which of them count towards "crew complete". That is
configuration, not code: associations name, order and count their crew
differently.

Two rules shape this module:

- **The default is today's behaviour.** A league without `CrewPosition` rows
  gets :data:`DEFAULT_CREW_POSITIONS` — the five slots the preparation screen
  used to hard-code, with the Scorecard Judge optional and the four refereed
  positions required. Nothing is seeded, so a league created tomorrow gets the
  defaults too, and removing a league's rows restores them.
- **`position` is the wire value.** The scorecard upserts a `GameOfficial` by
  that exact string; `label` is display only.
"""

from typing import Dict, List

from gamedays.models import Gameinfo
from officials.models import CrewPosition

#: The slots a league without configuration gets. Keep in sync with what the
#: scorecard wrote before this was configurable — changing these changes the
#: behaviour of every unconfigured league.
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


def crew_positions_for_league(league_id: int) -> List[Dict]:
    """The configured slots of one league, ordered, or the defaults.

    One query. An empty result means "not configured", never "no slots": the
    officials step must not render empty for a league nobody has set up.
    """
    rows = list(
        CrewPosition.objects.filter(league_id=league_id)
        .order_by("order", "id")
        .values("position", "label", "order", "required")
    )
    if not rows:
        return [dict(row) for row in DEFAULT_CREW_POSITIONS]
    return rows


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
