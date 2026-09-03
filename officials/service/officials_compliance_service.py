"""Checks whether the officials assigned to each game of a gameday meet the
minimum officiating-staff requirements configured on that gameday's
`LeagueSeasonConfig` (league_table app).

This is a distinct concern from `boff_license_calculation.py`, which
calculates what license an official *earns* from officiating a quota of
games. Here we take already-recorded `OfficialLicenseHistory` rows as given
and check whether a game's assigned staff meets a configured minimum.
"""

import re
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Iterable, Optional

from gamedays.models import Gameday, Gameinfo, GameOfficial
from league_table.models import LeagueSeasonConfig
from officials.models import OfficialLicenseHistory
from officials.service.license_validity import is_valid_on
from officials.service.official_service import LICENSE_LEVELS

REASON_NO_CONFIG = "Keine Konfiguration"
REASON_DISABLED = "Automatische Prüfung deaktiviert"
REASON_EXCLUDED = "Spieltag ausgeschlossen"
REASON_NOT_FOUND = "Spieltag nicht gefunden"

# OfficialLicense.name is a free CharField with no choices/enum, and the
# established convention elsewhere in this codebase (see
# matchreport/tests/test_model_wrapper.py) is to suffix it with a year, e.g.
# "F1 2027" - so license levels are resolved by prefix, not exact match,
# matching how OfficialLicenseHistoryQuerySet.order_by_rank() already
# relies on plain alphabetical sorting rather than an exact-match filter.
_LICENSE_LEVEL_PATTERN = re.compile(r"^(F[1-4])\b")


def _license_rank(license_name) -> Optional[int]:
    """Resolves a license name (e.g. "F2" or "F2 2022") to its rank index
    (0 = F1, the best, through 3 = F4), or None if it doesn't match a
    recognized F1-F4 level at all (e.g. a "-"/no-license placeholder)."""
    if not license_name:
        return None
    match = _LICENSE_LEVEL_PATTERN.match(license_name)
    if not match:
        return None
    return LICENSE_LEVELS.index(match.group(1))


@dataclass
class GamedayComplianceStatus:
    gameday_id: int
    is_checked: bool
    reason_not_checked: Optional[str] = None
    # gameinfo_id -> list of violation explanation strings (empty list = compliant)
    game_violations: dict = field(default_factory=dict)

    @property
    def violation_count(self) -> int:
        return sum(1 for violations in self.game_violations.values() if violations)


def _best_valid_rank(history_entries, on_date):
    """history_entries: list[(created_at, rank)] for already-recognized
    F1-F4 levels (see _license_rank). Returns the lowest (=best) rank among
    entries valid on `on_date`, or None if none are currently valid. Uses
    the same calendar-year validity rule as
    `OfficialLicenseHistory.valid_until()`, shared via
    officials.service.license_validity so this can't drift from the
    correlated-subquery window used in `matchreport.service.model_wrapper`."""
    valid_ranks = [
        rank for created_at, rank in history_entries if is_valid_on(created_at, on_date)
    ]
    return min(valid_ranks) if valid_ranks else None


def _violations_for_game(rank_counts, config) -> list:
    # Cumulative "rank-or-better" counts: an official holding F1 (rank 0)
    # also counts toward F2/F3/F4 minimums, an F2 official toward F3/F4, etc.
    cumulative = []
    running = 0
    for count in rank_counts:
        running += count
        cumulative.append(running)
    f1_count, f2_or_better, f3_or_better, any_valid = cumulative

    violations = []
    if any_valid < config["min_officials_per_game"]:
        violations.append(
            f"Nicht genug Offizielle mit Lizenz "
            f"({any_valid} von {config['min_officials_per_game']} gefordert)"
        )
    if any_valid < config["min_officials_f4_per_game"]:
        violations.append(
            f"Nicht genug Offizielle mit F4-Lizenz oder besser "
            f"({any_valid} von {config['min_officials_f4_per_game']} gefordert)"
        )
    if f3_or_better < config["min_officials_f3_per_game"]:
        violations.append(
            f"Nicht genug Offizielle mit F3-Lizenz oder besser "
            f"({f3_or_better} von {config['min_officials_f3_per_game']} gefordert)"
        )
    if f2_or_better < config["min_officials_f2_per_game"]:
        violations.append(
            f"Nicht genug Offizielle mit F2-Lizenz oder besser "
            f"({f2_or_better} von {config['min_officials_f2_per_game']} gefordert)"
        )
    if f1_count < config["min_officials_f1_per_game"]:
        violations.append(
            f"Nicht genug Offizielle mit F1-Lizenz "
            f"({f1_count} von {config['min_officials_f1_per_game']} gefordert)"
        )
    return violations


def compute_gameday_officials_compliance(
    gameday_ids: Iterable[int],
) -> dict:
    """Bulk-computes officials compliance for every gameday id given, in a
    constant number of queries regardless of how many gamedays/games are
    passed in. Used by both the matchreport gameday list (many gamedays at
    once) and the gameday detail view (called with a single-element list) -
    a function that is cheap for N gamedays is trivially fine for N=1 too.

    Returns a dict mapping every requested gameday_id to a
    GamedayComplianceStatus.
    """
    gameday_ids = list(gameday_ids)

    gamedays = list(
        Gameday.objects.filter(pk__in=gameday_ids).values(
            "pk", "league_id", "season_id", "date"
        )
    )
    gameday_by_id = {g["pk"]: g for g in gamedays}

    league_ids = {g["league_id"] for g in gamedays}
    season_ids = {g["season_id"] for g in gamedays}
    configs = list(
        LeagueSeasonConfig.objects.filter(
            league_id__in=league_ids, season_id__in=season_ids
        ).values(
            "id",
            "league_id",
            "season_id",
            "check_officials_automatically",
            "min_officials_per_game",
            "min_officials_f4_per_game",
            "min_officials_f3_per_game",
            "min_officials_f2_per_game",
            "min_officials_f1_per_game",
        )
    )
    config_by_league_season = {(c["league_id"], c["season_id"]): c for c in configs}

    relevant_config_ids = [c["id"] for c in configs]
    excluded_gameday_ids_by_config = defaultdict(set)
    if relevant_config_ids:
        excluded_pairs = LeagueSeasonConfig.exclude_gamedays.through.objects.filter(
            leagueseasonconfig_id__in=relevant_config_ids, gameday_id__in=gameday_ids
        ).values_list("leagueseasonconfig_id", "gameday_id")
        for config_id, gd_id in excluded_pairs:
            excluded_gameday_ids_by_config[config_id].add(gd_id)

    result = {}
    checked_gameday_ids = []
    for gd_id in gameday_ids:
        gd = gameday_by_id.get(gd_id)
        if gd is None:
            # Requested but no longer in the DB (e.g. deleted concurrently
            # with this call) - still honor the documented contract that
            # every requested id gets an entry, so callers can safely index
            # the result dict without a defensive .get()/try-except.
            result[gd_id] = GamedayComplianceStatus(gd_id, False, REASON_NOT_FOUND)
            continue
        config = config_by_league_season.get((gd["league_id"], gd["season_id"]))
        if config is None:
            result[gd_id] = GamedayComplianceStatus(gd_id, False, REASON_NO_CONFIG)
        elif not config["check_officials_automatically"]:
            result[gd_id] = GamedayComplianceStatus(gd_id, False, REASON_DISABLED)
        elif gd_id in excluded_gameday_ids_by_config.get(config["id"], ()):
            result[gd_id] = GamedayComplianceStatus(gd_id, False, REASON_EXCLUDED)
        else:
            result[gd_id] = GamedayComplianceStatus(gd_id, True)
            checked_gameday_ids.append(gd_id)

    if not checked_gameday_ids:
        return result

    gameinfos = list(
        Gameinfo.objects.filter(gameday_id__in=checked_gameday_ids).values(
            "id", "gameday_id"
        )
    )
    gameinfo_ids = [gi["id"] for gi in gameinfos]

    game_officials = list(
        GameOfficial.objects.filter(
            gameinfo_id__in=gameinfo_ids, official_id__isnull=False
        ).values("gameinfo_id", "official_id")
    )
    official_ids = {go["official_id"] for go in game_officials}

    game_officials_by_gameinfo = defaultdict(list)
    for go in game_officials:
        game_officials_by_gameinfo[go["gameinfo_id"]].append(go["official_id"])

    history_by_official = defaultdict(list)
    if official_ids:
        histories = OfficialLicenseHistory.objects.filter(
            official_id__in=official_ids
        ).values("official_id", "license__name", "created_at")
        for h in histories:
            rank = _license_rank(h["license__name"])
            if rank is None:
                continue
            history_by_official[h["official_id"]].append((h["created_at"], rank))

    for gi in gameinfos:
        gameinfo_id, gd_id = gi["id"], gi["gameday_id"]
        gameday_date = gameday_by_id[gd_id]["date"]
        config = config_by_league_season[
            (gameday_by_id[gd_id]["league_id"], gameday_by_id[gd_id]["season_id"])
        ]

        rank_counts = [0, 0, 0, 0]
        for official_id in game_officials_by_gameinfo.get(gameinfo_id, []):
            best_rank = _best_valid_rank(
                history_by_official.get(official_id, []), gameday_date
            )
            if best_rank is not None:
                rank_counts[best_rank] += 1

        result[gd_id].game_violations[gameinfo_id] = _violations_for_game(
            rank_counts, config
        )

    return result
