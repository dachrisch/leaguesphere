"""Bulk-resolves the currently valid license level (e.g. "F2") held by the
official assigned to each of the four refereed positions, per game.

Used by matchreport's gameday-list CSV export
(matchreport/service/gameday_list_csv_service.py). Reuses the same
rank-resolution building blocks as officials_compliance_service.py
(license_rank, best_valid_rank) rather than re-deriving them, so the three
consumers (this module, the compliance check, and matchreport's referee
table) can't independently drift on what counts as "currently valid".
"""

from collections import defaultdict
from typing import Dict, Iterable, Optional

from gamedays.models import Gameinfo, GameOfficial
from officials.models import OfficialLicenseHistory
from officials.service.official_service import LICENSE_LEVELS, license_rank
from officials.service.officials_compliance_service import best_valid_rank

POSITION_REFEREE = "Referee"
POSITION_DOWN_JUDGE = "Down Judge"
POSITION_FIELD_JUDGE = "Field Judge"
POSITION_SIDE_JUDGE = "Side Judge"

# The four positions this export reports a license column for (deliberately
# excludes "Scorecard Judge", which the requested CSV columns don't ask for).
TRACKED_POSITIONS = [
    POSITION_REFEREE,
    POSITION_DOWN_JUDGE,
    POSITION_FIELD_JUDGE,
    POSITION_SIDE_JUDGE,
]


def resolve_game_official_licenses(
    gameinfo_ids: Iterable[int],
) -> Dict[int, Dict[str, Optional[str]]]:
    """For each gameinfo id, resolves the currently valid license name for
    the official assigned to each of TRACKED_POSITIONS, as of that game's
    own gameday date. Returns gameinfo_id -> {position: license_name or
    None}. A position with no assigned official, or whose assigned official
    currently holds no valid license, is omitted/None. Bulk - a constant
    number of queries regardless of how many games are passed in."""
    gameinfo_ids = list(gameinfo_ids)

    gameinfo_dates = dict(
        Gameinfo.objects.filter(id__in=gameinfo_ids).values_list("id", "gameday__date")
    )

    game_officials = list(
        GameOfficial.objects.filter(
            gameinfo_id__in=gameinfo_ids,
            official_id__isnull=False,
            position__in=TRACKED_POSITIONS,
        )
        .order_by("id")
        .values("id", "gameinfo_id", "official_id", "position")
    )
    official_ids = {go["official_id"] for go in game_officials}

    history_by_official = defaultdict(list)
    if official_ids:
        histories = OfficialLicenseHistory.objects.filter(
            official_id__in=official_ids
        ).values("official_id", "license__name", "created_at")
        for h in histories:
            rank = license_rank(h["license__name"])
            if rank is None:
                continue
            history_by_official[h["official_id"]].append((h["created_at"], rank))

    result: Dict[int, Dict[str, Optional[str]]] = defaultdict(dict)
    for go in game_officials:
        gameinfo_id, position = go["gameinfo_id"], go["position"]
        if position in result[gameinfo_id]:
            # Multiple officials assigned to the same position on the same
            # game (unusual, but the model allows it) - keep whichever was
            # encountered first (lowest GameOfficial id); this export has
            # exactly one column per position.
            continue

        gameday_date = gameinfo_dates.get(gameinfo_id)
        if gameday_date is None:
            continue

        rank = best_valid_rank(
            history_by_official.get(go["official_id"], []), gameday_date
        )
        result[gameinfo_id][position] = (
            LICENSE_LEVELS[rank] if rank is not None else None
        )

    return result
