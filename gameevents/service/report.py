"""Build the accepted-legacy-set reconciliation report (Phase 2, layer 2).

This is a pure function: it turns the data ``check_games()`` and the legacy-set
query already collected into a JSON-serialisable dict. It performs **no**
database queries of its own, so ``check_game_projection --all`` keeps its
six-query budget (five checks plus one legacy count) with or without
``--report``.

Classification follows the cutover contract: only games whose events carry a
``source=v2`` event must reconcile. Shadow-only (``source=legacy``) games and
games with rows but no events are the explicitly accepted legacy set.
"""

from __future__ import annotations

import hashlib

from gameevents.models import GameEvent


def legacy_digest(legacy_games) -> str:
    """SHA-256 of the sorted ids of games with rows and no events.

    Sorting makes the digest stable regardless of row order, so two runs on
    the same data produce the same value. Only ids are hashed -- no personal
    data, names or values enter the public acceptance record.
    """
    ids = sorted(game_id for game_id, _season_id in legacy_games)
    return hashlib.sha256(
        ",".join(str(game_id) for game_id in ids).encode()
    ).hexdigest()


def build_report(*, checks, legacy_games, generated_at, ref_sha, cand_sha) -> dict:
    """Assemble the report payload from already-loaded data."""

    event_checks = [check for check in checks if not check.legacy]
    by_source = {
        GameEvent.Source.V2: 0,
        GameEvent.Source.LEGACY: 0,
        GameEvent.Source.STAFF: 0,
    }
    per_season = {}
    drift = []
    flagged = []

    for check in event_checks:
        by_source[check.source] = by_source.get(check.source, 0) + 1
        season_key = str(check.season_id)
        season = per_season.setdefault(
            season_key,
            {
                "event_games": 0,
                "legacy_without_events": 0,
                "drift": 0,
                "flagged": 0,
            },
        )
        season["event_games"] += 1
        if check.drift is not None:
            drift.append(
                {
                    "game_id": check.game_id,
                    "seq": check.drift.seq,
                    "kind": check.drift.kind,
                    "detail": check.drift.detail,
                }
            )
            season["drift"] += 1
            if check.drift.kind == "flag":
                flagged.append(check.game_id)
                season["flagged"] += 1

    for _game_id, season_id in legacy_games:
        season = per_season.setdefault(
            str(season_id),
            {
                "event_games": 0,
                "legacy_without_events": 0,
                "drift": 0,
                "flagged": 0,
            },
        )
        season["legacy_without_events"] += 1

    return {
        "generated_at": generated_at,
        "ref_sha": ref_sha,
        "cand_sha": cand_sha,
        "event_games": len(event_checks),
        "ok": sum(1 for check in checks if check.ok),
        "drift": drift,
        "flagged": flagged,
        "by_source": by_source,
        "legacy_without_events": len(legacy_games),
        "legacy_without_events_digest": legacy_digest(legacy_games),
        "per_season": dict(sorted(per_season.items())),
    }
