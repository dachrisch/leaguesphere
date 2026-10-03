"""Bulk-resolves the currently valid license level (e.g. "F2") held by the
official assigned to each of the four refereed positions, per game.

Used by matchreport's gameday-list CSV export
(matchreport/service/gameday_list_csv_service.py). Reuses the same
rank-resolution building blocks as officials_compliance_service.py
(bulk_history_by_official, best_valid_rank) rather than re-deriving them,
so the three consumers (this module, the compliance check, and
matchreport's referee table) can't independently drift on what counts as
"currently valid".
"""

from collections import defaultdict
from datetime import date, timedelta
from typing import Dict, Iterable, Optional

from gamedays.models import Gameinfo, GameOfficial
from officials.service.official_service import LICENSE_LEVELS, bulk_history_by_official
from officials.service.license_validity import is_valid_on
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
    history_by_official = bulk_history_by_official(official_ids)

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


NO_LICENSE = {"license": None, "valid_until": None, "is_valid": False}


def resolve_current_licenses(
    official_ids: Iterable[int], on_date: Optional[date] = None
) -> Dict[int, dict]:
    """For each official id, resolves the license level to display on
    `on_date` (default today) as {"license", "valid_until", "is_valid"}.
    The best currently valid level wins; if none is valid the most recently
    started one is reported with is_valid=False, so callers can show when it
    expired. valid_until is created_at + 365 days (see license_validity).
    Officials without any recognized F1-F4 history map to NO_LICENSE. Bulk -
    one query regardless of how many ids are passed in."""
    on_date = on_date or date.today()
    result = {}
    for official_id, history in bulk_history_by_official(list(official_ids)).items():
        rank = best_valid_rank(history, on_date)
        if rank is not None:
            # latest start among entries of the winning rank that are valid
            created_at = max(
                c for c, r in history if r == rank and is_valid_on(c, on_date)
            )
        else:
            created_at, rank = max(history, key=lambda entry: entry[0])
        result[official_id] = {
            "license": LICENSE_LEVELS[rank],
            "valid_until": created_at + timedelta(days=365),
            "is_valid": is_valid_on(created_at, on_date),
        }
    return defaultdict(lambda: dict(NO_LICENSE), result)
