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

from gameevents.models import GameEvent
from gameevents.service.reconcile import Drift, GameCheck, check_games
from gameevents.service.report import build_report, legacy_digest
from gameevents.tests.api.support import (
    legacy_body,
    login,
    make_game,
    post_events,
    post_legacy,
    sub_id,
)
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


def test_legacy_digest_of_the_empty_set_is_the_fixed_sha256():
    # A digest compared with itself passes for any implementation. Pin the
    # value so a change in the hashed input format is detected.
    assert legacy_digest([]) == (
        "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    )


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
    assert payload["flagged"] == [{"game_id": 2, "source": "v2"}]
    assert payload["per_season"]["1"]["drift"] == 2
    assert payload["per_season"]["1"]["flagged"] == 1


def test_shadow_only_games_are_part_of_the_accepted_set_and_its_digest():
    payload = build_report(
        checks=[check(9, source="legacy", season=10)],
        legacy_games=[(9, 10), (4, 20)],
        shadow_only_games=[(9, 10)],
        generated_at="t",
        ref_sha="",
        cand_sha="",
    )

    # The measured set must match the documented definition: no-event and
    # shadow-only games are both accepted, counted and hashed.
    assert payload["legacy_without_events"] == 2
    assert payload["accepted_legacy"] == 2
    assert payload["shadow_only"] == 1
    assert payload["legacy_without_events_digest"] == legacy_digest([(9, 10), (4, 20)])
    assert payload["per_season"]["10"] == {
        "event_games": 1,
        "legacy_without_events": 1,
        "shadow_only": 1,
        "drift": 0,
        "flagged": 0,
    }
    assert payload["per_season"]["20"]["shadow_only"] == 0


def test_cutoff_limits_the_digest_and_counts_to_a_reproducible_set():
    payload = build_report(
        checks=[],
        legacy_games=[(1, 10), (5, 10), (9, 10)],
        shadow_only_games=[(5, 10)],
        legacy_cutoff=5,
        generated_at="t",
        ref_sha="",
        cand_sha="",
    )

    assert payload["legacy_cutoff"] == 5
    assert payload["legacy_without_events"] == 2
    assert payload["shadow_only"] == 1
    assert payload["legacy_without_events_digest"] == legacy_digest([(1, 10), (5, 10)])


def test_per_season_keys_sort_numerically():
    payload = build_report(
        checks=[check(1, source="v2", season=2), check(2, source="v2", season=10)],
        legacy_games=[(3, 1)],
        generated_at="t",
        ref_sha="",
        cand_sha="",
    )

    assert list(payload["per_season"]) == ["1", "2", "10"]


def test_unknown_season_sorts_last_instead_of_failing():
    payload = build_report(
        checks=[check(1, source="v2", season=2), check(2, legacy=True, season=None)],
        legacy_games=[(2, None), (3, 10)],
        generated_at="t",
        ref_sha="",
        cand_sha="",
    )

    assert list(payload["per_season"]) == ["2", "10", "None"]


@pytest.mark.django_db
def test_game_mode_report_on_a_legacy_game_is_written(tmp_path):
    game = legacy_game("report-game-legacy")
    destination = tmp_path / "legacy.json"

    out = StringIO()
    call_command(
        "check_game_projection",
        "--game",
        str(game.pk),
        "--report",
        str(destination),
        stdout=out,
    )

    assert out.getvalue() == (
        f"game {game.pk}: skipped (no events, legacy game)\n"
        f"game {game.pk} has no events; nothing to compare\n"
        "projection matches the event log\n"
    )
    payload = json.loads(destination.read_text())
    assert payload["legacy_without_events"] == 1
    assert list(payload["per_season"]) == ["None"]


def test_report_carries_source_on_drift_and_flagged_entries():
    payload = build_report(
        checks=[
            check(1, source="v2", drift=Drift(2, "state", "wrong score")),
            check(2, source="legacy", drift=Drift(1, "flag", "shadow flag")),
            check(3, source="v2", drift=Drift(2, "flag", "v2 flag")),
        ],
        legacy_games=[],
        generated_at="t",
        ref_sha="",
        cand_sha="",
    )

    assert [entry["source"] for entry in payload["drift"]] == [
        "v2",
        "legacy",
        "v2",
    ]
    assert payload["flagged"] == [
        {"game_id": 2, "source": "legacy"},
        {"game_id": 3, "source": "v2"},
    ]
    assert payload["v2_drift"] == 2
    assert payload["v2_flagged"] == 1


@pytest.mark.django_db
def test_source_derivation_and_accepted_set_are_db_backed(
    client, tmp_path, django_assert_num_queries
):
    shadow_game, _home, _away = make_game("shadow-source")
    login(client)
    # After the shadow removal no new legacy-sourced event is written. An
    # audit-only event left by an earlier deploy still has to classify as
    # shadow-only, so create one through the canonical path and give it the
    # legacy source the shadow used to use.
    posted = post_events(
        client,
        shadow_game,
        legacy_body(
            shadow_game,
            _home,
            [{"name": "Touchdown", "player": 7}],
            client_id=sub_id(11),
        ),
    )
    assert posted.status_code == 201
    GameEvent.objects.filter(game=shadow_game).update(source=GameEvent.Source.LEGACY)
    v2_game, _home, _away = event_game(client, "v2-source")
    checks = {item.game_id: item for item in check_games([shadow_game.pk, v2_game.pk])}

    # The explicit-id path applies the same v2 discriminator as --all: a
    # shadow-only game is accepted legacy and skipped, not reconciled.
    assert checks[shadow_game.pk].legacy is True
    assert checks[v2_game.pk].source == "v2"

    destination = tmp_path / "report.json"
    out = StringIO()
    with django_assert_num_queries(6):
        call_command(
            "check_game_projection", "--all", "--report", str(destination), stdout=out
        )
    payload = json.loads(destination.read_text())

    # --all only reconciles v2 games; the shadow-only game is accepted (in the
    # report), neither checked nor counted as a game without events.
    assert out.getvalue() == (
        f"game {v2_game.pk}: ok (2 events, seq 2)\n"
        "checked 1 event-sourced game(s); skipped 0 legacy game(s) without events\n"
        "projection matches the event log\n"
    )
    assert payload["legacy_without_events"] == 1
    assert payload["shadow_only"] == 1
    assert payload["legacy_without_events_digest"] == legacy_digest(
        [(shadow_game.pk, shadow_game.gameday.season_id)]
    )


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
    assert payload["v2_drift"] == 0
    assert payload["v2_flagged"] == 0
    assert payload["shadow_only"] == 0
    assert payload["legacy_cutoff"] is None


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
def test_report_cutoff_filters_the_accepted_set_without_extra_queries(
    client, tmp_path, django_assert_num_queries
):
    game, _home, _away = event_game(client, "report-cutoff-event")
    legacy_game("report-cutoff-legacy")
    destination = tmp_path / "cutoff.json"

    out = StringIO()
    with django_assert_num_queries(6):
        call_command(
            "check_game_projection",
            "--all",
            "--report",
            str(destination),
            "--legacy-cutoff",
            str(game.pk - 1),
            stdout=out,
        )

    payload = json.loads(destination.read_text())
    assert payload["legacy_cutoff"] == game.pk - 1
    assert payload["legacy_without_events"] == 0
    # The cutoff is report-only: stdout still counts the legacy game.
    assert out.getvalue() == (
        f"game {game.pk}: ok (2 events, seq 2)\n"
        "checked 1 event-sourced game(s); skipped 1 legacy game(s) without events\n"
        "projection matches the event log\n"
    )


@pytest.mark.django_db
def test_game_mode_on_a_shadow_only_game_prints_no_legacy_line(client, tmp_path):
    shadow_game, home, _away = make_game("shadow-game-mode")
    login(client)
    # No v1 write creates an event after the shadow removal: build the audit
    # event an earlier deploy left, as the DB-backed source test does.
    posted = post_events(
        client,
        shadow_game,
        legacy_body(
            shadow_game,
            home,
            [{"name": "Touchdown", "player": 7}],
            client_id=sub_id(12),
        ),
    )
    assert posted.status_code == 201
    GameEvent.objects.filter(game=shadow_game).update(source=GameEvent.Source.LEGACY)
    destination = tmp_path / "shadow.json"

    out = StringIO()
    call_command(
        "check_game_projection",
        "--game",
        str(shadow_game.pk),
        "--report",
        str(destination),
        stdout=out,
    )

    assert out.getvalue() == (
        f"game {shadow_game.pk}: ok (1 events, seq 1)\n"
        "projection matches the event log\n"
    )
    payload = json.loads(destination.read_text())
    assert payload["shadow_only"] == 1
    assert payload["legacy_without_events"] == 1


@pytest.mark.django_db
def test_shadow_only_game_is_skipped_by_explicit_check_and_counted(client, tmp_path):
    game, home, _away = make_game("explicit-shadow-only")
    login(client)
    post_legacy(
        client,
        game,
        legacy_body(
            game, home, [{"name": "Touchdown", "player": 7}], client_id=sub_id(31)
        ),
    )
    GameEvent.objects.filter(game=game).update(source=GameEvent.Source.LEGACY)

    checks = check_games([game.pk])
    assert checks[0].legacy is True
    assert checks[0].ok is True

    out = StringIO()
    call_command("check_game_projection", "--game", str(game.pk), stdout=out)
    assert "nothing to compare" in out.getvalue()


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
