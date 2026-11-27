"""Build the accepted-legacy-set reconciliation report (Phase 2, layer 2).

This is a pure function: it turns the data ``check_games()`` and the legacy-set
query already collected into a JSON-serialisable dict. It performs **no**
database queries of its own, so ``check_game_projection --all`` keeps its
six-query budget (five checks plus one legacy count) with or without
``--report``.

Classification follows the cutover contract: only games whose events carry a
``source=v2`` event must reconcile. Shadow-only (``source=legacy``) games and
games with rows but no events are the explicitly accepted legacy set; the
``shadow_only`` breakdown is reported separately. ``legacy_cutoff`` bounds the
set by game id so the published digest can be reproduced after new v1 games
have been written.
"""

from __future__ import annotations

import hashlib

from gameevents.models import GameEvent


def legacy_digest(legacy_games) -> str:
    """SHA-256 of the sorted ids of the whole accepted legacy set.

    Sorting makes the digest stable regardless of row order, so two runs on
    the same data produce the same value. Only ids are hashed -- no personal
    data, names or values enter the public acceptance record. The empty set
    hashes to the standard SHA-256 of an empty byte string.
    """
    ids = sorted(game_id for game_id, _season_id in legacy_games)
    return hashlib.sha256(
        ",".join(str(game_id) for game_id in ids).encode()
    ).hexdigest()


def _season_order(item):
    """Numeric season order; the unknown season (``"None"``) sorts last.

    ``--game`` on a legacy game has no season (``check_games`` does not load
    its gameday), so its bucket key is ``"None"`` and must not break the sort.
    """

    key = item[0]
    return (1, 0) if key == "None" else (0, int(key))


def build_report(
    *,
    checks,
    legacy_games,
    shadow_only_games=(),
    legacy_cutoff=None,
    generated_at,
    ref_sha,
    cand_sha,
) -> dict:
    """Assemble the report payload from already-loaded data."""

    def within_cutoff(game):
        return legacy_cutoff is None or game[0] <= legacy_cutoff

    accepted = [game for game in legacy_games if within_cutoff(game)]
    shadow_only = [game for game in shadow_only_games if within_cutoff(game)]

    event_checks = [check for check in checks if not check.legacy]
    by_source = {
        GameEvent.Source.V2: 0,
        GameEvent.Source.LEGACY: 0,
        GameEvent.Source.STAFF: 0,
    }
    per_season = {}
    drift = []
    flagged = []

    def season_bucket(season_id):
        return per_season.setdefault(
            str(season_id),
            {
                "event_games": 0,
                "legacy_without_events": 0,
                "shadow_only": 0,
                "drift": 0,
                "flagged": 0,
            },
        )

    for check in event_checks:
        by_source[check.source] = by_source.get(check.source, 0) + 1
        season = season_bucket(check.season_id)
        season["event_games"] += 1
        if check.drift is not None:
            drift.append(
                {
                    "game_id": check.game_id,
                    "source": check.source,
                    "seq": check.drift.seq,
                    "kind": check.drift.kind,
                    "detail": check.drift.detail,
                }
            )
            season["drift"] += 1
            if check.drift.kind == "flag":
                flagged.append({"game_id": check.game_id, "source": check.source})
                season["flagged"] += 1

    for _game_id, season_id in accepted:
        season_bucket(season_id)["legacy_without_events"] += 1
    for _game_id, season_id in shadow_only:
        season_bucket(season_id)["shadow_only"] += 1

    return {
        "generated_at": generated_at,
        "ref_sha": ref_sha,
        "cand_sha": cand_sha,
        "event_games": len(event_checks),
        "ok": sum(1 for check in checks if check.ok),
        "drift": drift,
        "flagged": flagged,
        "v2_drift": sum(1 for entry in drift if entry["source"] == GameEvent.Source.V2),
        "v2_flagged": sum(
            1 for entry in flagged if entry["source"] == GameEvent.Source.V2
        ),
        "by_source": by_source,
        "legacy_without_events": len(accepted),
        "accepted_legacy": len(accepted),
        "shadow_only": len(shadow_only),
        "legacy_cutoff": legacy_cutoff,
        "legacy_without_events_digest": legacy_digest(accepted),
        "per_season": dict(sorted(per_season.items(), key=_season_order)),
    }
