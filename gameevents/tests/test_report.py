"""Reconciliation report builder and the additive ``--report`` CLI option.

The report must classify by ``GameEvent.source``: only v2 games have to
reconcile, shadow-only games join the accepted legacy set, and the legacy
digest is stable under row order. Adding ``--report`` must not change stdout,
exit status or the six-query ``--all`` budget.
"""

import json
from io import StringIO

import pytest
from django.core.management import call_command
from django.core.management.base import CommandError

from gameevents.service.reconcile import Drift, GameCheck
from gameevents.service.report import build_report, legacy_digest
from gameevents.tests.api.support import login, make_game, post_events, sub_id
from gameevents.tests.management.test_check_projection_characterization import (
    event_game,
    legacy_game,
)
from gamedays.models import TeamLog

TD = {"type": "score", "code": "touchdown", "side": "home", "player": 7, "period": 1}
PAT = {"type": "score", "code": "pat1", "side": "home", "player": 7, "period": 1}


def check(game_id, *, source="v2", season=1, drift=None, legacy=False):
    return GameCheck(
        game_id,
        2,
        2,
        drift=drift,
        legacy=legacy,
        source=source,
        season_id=season,
    )


def test_legacy_digest_is_stable_under_id_order():
    assert legacy_digest([(3, 1), (1, 2), (2, 3)]) == legacy_digest(
        [(1, 2), (2, 3), (3, 1)]
    )
    assert legacy_digest([]) == legacy_digest([])


def test_report_groups_by_source_and_season():
    payload = build_report(
        checks=[
            check(1, source="v2", season=10),
            check(2, source="legacy", season=10),
            check(3, source="staff", season=20),
        ],
        legacy_games=[(4, 10), (5, 20), (6, 20)],
        generated_at="2026-11-26T00:00:00+00:00",
        ref_sha="ref",
        cand_sha="cand",
    )

    assert payload["event_games"] == 3
    assert payload["ok"] == 3
    assert payload["by_source"] == {"v2": 1, "legacy": 1, "staff": 1}
    assert payload["legacy_without_events"] == 3
    assert payload["per_season"]["10"]["legacy_without_events"] == 1
    assert payload["per_season"]["20"]["legacy_without_events"] == 2
    assert payload["per_season"]["10"]["event_games"] == 2


def test_report_records_drift_and_flagged_games():
    payload = build_report(
        checks=[
            check(1, drift=Drift(2, "state", "score_home 13 != 7 (log)")),
            check(2, drift=Drift(2, "flag", "undo of sequence 4")),
            check(3, source="legacy"),
        ],
        legacy_games=[],
        generated_at="t",
        ref_sha="",
        cand_sha="",
    )

    assert payload["ok"] == 1
    assert payload["drift"][0]["kind"] == "state"
    assert payload["flagged"] == [2]
    assert payload["per_season"]["1"]["drift"] == 2
    assert payload["per_season"]["1"]["flagged"] == 1


def test_report_with_zero_events_is_empty_but_valid():
    payload = build_report(
        checks=[],
        legacy_games=[],
        generated_at="t",
        ref_sha="",
        cand_sha="",
    )

    assert payload["event_games"] == 0
    assert payload["drift"] == []
    assert payload["flagged"] == []
    assert payload["per_season"] == {}
    assert payload["legacy_without_events_digest"] == legacy_digest([])


@pytest.mark.django_db
def test_report_option_writes_json_without_changing_stdout_or_queries(
    client, tmp_path, django_assert_num_queries
):
    game, _home, _away = event_game(client, "report-event")
    legacy_game("report-legacy")
    destination = tmp_path / "report.json"

    out = StringIO()
    with django_assert_num_queries(6):
        call_command(
            "check_game_projection",
            "--all",
            "--report",
            str(destination),
            "--ref-sha",
            "96ec02b",
            "--cand-sha",
            "abc123",
            stdout=out,
        )

    assert out.getvalue() == (
        f"game {game.pk}: ok (2 events, seq 2)\n"
        "checked 1 event-sourced game(s); skipped 1 legacy game(s) without events\n"
        "projection matches the event log\n"
    )
    payload = json.loads(destination.read_text())
    assert payload["event_games"] == 1
    assert payload["by_source"]["v2"] == 1
    assert payload["legacy_without_events"] == 1
    assert payload["ref_sha"] == "96ec02b"
    assert payload["cand_sha"] == "abc123"
    assert payload["ok"] == 1


@pytest.mark.django_db
def test_report_option_is_written_even_when_drift_fails(client, tmp_path):
    game, _home, _away = event_game(client, "report-drift")
    TeamLog.objects.filter(gameinfo=game, event="Touchdown").update(value=0)
    destination = tmp_path / "drift.json"

    out = StringIO()
    with pytest.raises(CommandError):
        call_command(
            "check_game_projection",
            "--game",
            str(game.pk),
            "--report",
            str(destination),
            stdout=out,
        )

    payload = json.loads(destination.read_text())
    assert len(payload["drift"]) == 1
    assert payload["flagged"] == []
