"""Pure card functions - no database access, no template logic.

Every card returns the same small dict shape so the template stays dumb:

    {"key", "title", "severity", "severity_text", "summary", "rows", "links"}

``severity_text`` always carries the meaning in words: colour alone must never
be the only carrier (see issue #2078).
"""

from datetime import date, datetime, time

from home.service.cards import (
    last_gameday_summary_card,
    next_gameday_card,
    officials_ready_card,
    official_licence_card,
    official_next_signup_card,
    official_open_results_card,
    pending_transfers_card,
    roster_checks_card,
    staff_gameday_nudge_card,
    staff_readiness_card,
    staff_review_card,
    table_delta_card,
)


class FakeGameday:
    def __init__(
        self, name="Spieltag 3", day=date(2026, 5, 25), address="Sportpark Nord"
    ):
        self.pk = 42
        self.name = name
        self.date = day
        self.address = address
        self.league = type("League", (), {"name": "Premier Division"})()
        self.season = type("Season", (), {"name": "2025/2026"})()


class TestNextGamedayCard:
    def test_shows_date_countdown_field_and_first_kickoff(self):
        gameday = FakeGameday()

        card = next_gameday_card(
            gameday,
            games=[
                {
                    "scheduled": time(10, 0),
                    "field": 2,
                    "opponent": "Velocity FC",
                    "previous_score": "Hinspiel 34:20",
                },
                {
                    "scheduled": time(12, 30),
                    "field": 3,
                    "opponent": "Quantum Wolves",
                    "previous_score": None,
                },
            ],
            today=date(2026, 5, 21),
        )

        assert card["key"] == "next_gameday"
        assert card["title"] == "Nächster Spieltag"
        assert "25.05.2026" in card["summary"]
        assert "in 4 Tagen" in card["summary"]
        assert card["rows"][0]["opponent"] == "Velocity FC"
        assert "10:00" in card["rows"][0]["text"]
        assert "Feld 2" in card["rows"][0]["text"]

    def test_without_games_still_names_the_gameday(self):
        card = next_gameday_card(FakeGameday(), games=[], today=date(2026, 5, 25))

        assert "heute" in card["summary"]
        assert card["rows"] == []
        assert card["severity_text"]

    def test_returns_none_without_a_gameday(self):
        assert next_gameday_card(None, games=[], today=date(2026, 5, 21)) is None


class TestRosterChecksCard:
    def test_reports_a_roster_below_the_league_minimum(self):
        card = roster_checks_card(
            active_players=4, players_without_jersey=0, minimum_player_strength=5
        )

        assert card["key"] == "roster_checks"
        assert card["severity"] == "danger"
        row = card["rows"][0]
        assert "Nur 4 aktive Spieler" in row["title"]
        assert "Liga-Minimum ist 5" in row["title"]
        assert row["reason"]
        assert row["status_text"] == "Offen"

    def test_reports_players_without_a_jersey_number(self):
        card = roster_checks_card(
            active_players=8, players_without_jersey=2, minimum_player_strength=5
        )

        titles = [row["title"] for row in card["rows"]]
        assert "2 Spieler ohne Trikotnummer" in titles
        assert card["severity"] == "warning"

    def test_completed_checks_stay_visible_as_green_rows(self):
        card = roster_checks_card(
            active_players=9, players_without_jersey=0, minimum_player_strength=5
        )

        assert card["open_count"] == 0
        assert all(row["status"] == "ok" for row in card["rows"])
        assert all(row["status_text"] == "Erledigt" for row in card["rows"])
        assert len(card["rows"]) == 2

    def test_without_a_league_rule_only_the_data_checks_are_shown(self):
        card = roster_checks_card(
            active_players=2, players_without_jersey=0, minimum_player_strength=None
        )

        titles = [row["title"] for row in card["rows"]]
        assert not any("Liga-Minimum" in title for title in titles)
        assert "Trikotnummern vollständig" in titles


class TestPendingTransfersCard:
    def test_returns_none_without_pending_transfers(self):
        assert pending_transfers_card([]) is None

    def test_names_the_player_and_the_date(self):
        card = pending_transfers_card(
            [{"player_name": "J. Weber", "since": date(2026, 5, 12)}]
        )

        assert card["severity"] == "warning"
        assert "1 Transfer wartet auf Freigabe" in card["title"]
        assert "J. Weber" in card["rows"][0]["text"]
        assert "12.05.2026" in card["rows"][0]["text"]


class TestOfficialsReadyCard:
    def test_assigned_officials_are_a_completed_row(self):
        card = officials_ready_card(2)

        assert card["severity"] == "ok"
        assert card["severity_text"] == "Erledigt"
        assert "2 Offizielle" in card["summary"]

    def test_missing_officials_state_the_reason_in_text(self):
        card = officials_ready_card(0)

        assert card["severity"] == "warning"
        assert card["severity_text"] == "Achtung"
        assert "Noch keine Schiedsrichter" in card["summary"]


class TestLastGamedaySummaryCard:
    def test_shows_the_score_and_scoring_moments_as_jersey_numbers(self):
        card = last_gameday_summary_card(
            gameday=FakeGameday(name="Spieltag 2", day=date(2026, 5, 11)),
            own_score=40,
            opponent_score=34,
            opponent="Solar Panthers",
            moments=[
                {"event": "Touchdown", "player": 19, "count": 2},
                {"event": "Safety (+1)", "player": 12, "count": 1},
                {"event": "Touchdown", "player": None, "count": 1},
            ],
        )

        assert card["key"] == "last_gameday"
        assert card["score"] == "40 : 34"
        assert card["opponent"] == "Solar Panthers"
        labels = [moment["label"] for moment in card["moments"]]
        assert "#19" in labels[0]
        assert "2×" in labels[0]
        assert "#12" in labels[1]
        assert "ohne Nummer" in labels[2]

    def test_without_a_gameday_returns_none(self):
        assert (
            last_gameday_summary_card(
                gameday=None,
                own_score=None,
                opponent_score=None,
                opponent=None,
                moments=[],
            )
            is None
        )


class TestTableDeltaCard:
    def test_reports_a_climb(self):
        card = table_delta_card(previous_rank=5, current_rank=3)

        assert card["text"] == "5 → 3"
        assert card["severity"] == "ok"
        assert "verbessert" in card["severity_text"]

    def test_reports_a_drop(self):
        card = table_delta_card(previous_rank=2, current_rank=4)

        assert card["severity"] == "warning"
        assert "verschlechtert" in card["severity_text"]

    def test_reports_no_change(self):
        card = table_delta_card(previous_rank=3, current_rank=3)

        assert card["severity"] == "info"
        assert card["text"] == "3 → 3"

    def test_returns_none_without_a_previous_rank(self):
        assert table_delta_card(previous_rank=None, current_rank=3) is None


class TestStaffReadinessCard:
    def test_reports_understaffed_games_drafts_and_expiring_licences(self):
        card = staff_readiness_card(
            gameday=FakeGameday(),
            game_count=12,
            officials_assigned=4,
            understaffed_games=2,
            draft_gamedays=["Spieltag 4"],
            expiring_licences=2,
        )

        assert card["key"] == "staff_readiness"
        titles = [row["title"] for row in card["rows"]]
        assert any("ohne vollständige Besetzung" in title for title in titles)
        assert any("Entwurf" in title for title in titles)
        assert any("Lizenzen laufen ab" in title for title in titles)
        assert all(row["status_text"] for row in card["rows"])

    def test_everything_ready_is_a_single_completed_row(self):
        card = staff_readiness_card(
            gameday=FakeGameday(),
            game_count=12,
            officials_assigned=4,
            understaffed_games=0,
            draft_gamedays=[],
            expiring_licences=0,
        )

        assert card["open_count"] == 0
        assert card["severity"] == "ok"


class TestStaffGamedayNudgeCard:
    """Two steps, one action: the designer *is* the default way.

    Choosing a template and creating the gameday happen in the same place, so
    "Vorlage" is an annotation on the gameday step, not a step of its own.
    """

    def _card(self, **overrides):
        kwargs = {
            "league": "Premier Division",
            "season": type("Season", (), {"name": "2026/2027"})(),
            "has_template": True,
            "last_gameday_date": date(2026, 5, 11),
            "today": date(2026, 7, 6),
            "has_upcoming_gameday": False,
            "season_url": "/gamedays/seasons/new/",
            "designer_url": "/gamedays/gameday/design/",
            "gameday_create_url": "/gamedays/gameday/new/",
        }
        kwargs.update(overrides)
        return staff_gameday_nudge_card(**kwargs)

    def test_does_not_render_when_the_league_has_an_upcoming_gameday(self):
        assert self._card(has_upcoming_gameday=True) is None

    def test_an_empty_october_is_not_an_alarm(self):
        card = self._card()

        assert card["severity"] == "info"
        assert card["severity_text"] == "Hinweis"
        assert "Noch nichts geplant" in card["title"]

    def test_has_two_steps(self):
        card = self._card()

        assert [step["key"] for step in card["steps"]] == ["season", "gameday"]

    def test_names_the_missing_season(self):
        card = self._card(season=None)

        step = card["steps"][0]
        assert step["state"] == "missing"
        assert "Saison fehlt" in step["text"]
        assert step["url"] == "/gamedays/seasons/new/"

    def test_marks_the_season_as_done_when_it_exists(self):
        card = self._card()

        assert card["steps"][0]["state"] == "done"
        assert "Saison 2026/2027" in card["steps"][0]["text"]

    def test_the_gameday_step_links_to_the_designer(self):
        card = self._card()

        step = card["steps"][1]
        assert step["state"] == "todo"
        assert step["url"] == "/gamedays/gameday/design/"
        assert "Designer" in step["text"]

    def test_the_template_state_is_an_annotation_on_the_gameday_step(self):
        with_template = self._card(has_template=True)
        without_template = self._card(has_template=False)

        assert "Vorlage vorhanden" in with_template["steps"][1]["annotation"]
        assert "Keine Vorlage" in without_template["steps"][1]["annotation"]
        assert "Designer" in without_template["steps"][1]["annotation"]

    def test_designer_application_is_the_named_primary_action(self):
        card = self._card()

        primary = [link for link in card["links"] if link["primary"]]
        assert len(primary) == 1
        assert primary[0]["label"] == "Spieltag im Designer anlegen"
        assert primary[0]["url"] == "/gamedays/gameday/design/"

    def test_manual_creation_stays_as_the_fallback(self):
        card = self._card()

        secondary = [link for link in card["links"] if not link["primary"]]
        assert [link["label"] for link in secondary] == ["Spieltag manuell anlegen"]
        assert secondary[0]["url"] == "/gamedays/gameday/new/"

    def test_states_how_long_ago_the_last_gameday_was(self):
        card = self._card()

        assert "vor 8 Wochen" in card["summary"]

    def test_short_gaps_are_stated_in_days_not_zero_weeks(self):
        card = self._card(last_gameday_date=date(2026, 7, 2), today=date(2026, 7, 6))

        assert "vor 4 Tagen" in card["summary"]
        assert "0 Wochen" not in card["summary"]


class TestStaffReviewCard:
    def _card(self, **overrides):
        kwargs = {
            "season_name": "2025/2026",
            "gameday_count": 6,
            "is_finished": True,
            "team_count": 12,
            "league_count": 2,
            "last_gameday_name": "Spieltag 6",
            "last_gameday_date": date(2026, 5, 11),
            "today": date(2026, 7, 6),
            "games_total": 12,
            "games_with_results": 10,
        }
        kwargs.update(overrides)
        return staff_review_card(**kwargs)

    def test_summarises_the_last_season(self):
        card = self._card()

        assert card["key"] == "staff_review"
        assert "2025/2026" in card["title"]
        assert "6 Spieltage" in card["summary"]
        assert "abgeschlossen" in card["summary"]

    def test_lists_teams_leagues_and_the_last_gameday(self):
        card = self._card()

        texts = [row["text"] for row in card["rows"]]
        assert "Teams 12 · Ligen 2" in texts
        assert any("Spieltag 6" in text for text in texts)
        assert any("vor 8 Wochen" in text for text in texts)

    def test_states_how_many_games_have_results(self):
        card = self._card()

        texts = [row["text"] for row in card["rows"]]
        assert "Spiele erfasst 10 / 12" in texts

    def test_a_running_season_is_not_called_finished(self):
        card = self._card(is_finished=False)

        assert "läuft noch" in card["summary"]


class TestOfficialCards:
    def test_next_signup_card(self):
        card = official_next_signup_card(
            signup={"gameday": "Spieltag 3", "date": date(2026, 5, 25), "games": 6}
        )

        assert card["key"] == "official_signup"
        assert "Spieltag 3" in card["summary"]
        assert "25.05.2026" in card["summary"]

    def test_next_signup_card_without_a_signup(self):
        card = official_next_signup_card(signup=None)

        assert card["severity"] == "info"
        assert "keine anmeldung" in card["summary"].lower()

    def test_licence_card_states_the_licence(self):
        assert "F2" in official_licence_card("F2")["summary"]
        assert "Keine Lizenz" in official_licence_card(None)["summary"]

    def test_open_results_card(self):
        card = official_open_results_card(
            [{"gameday": "Spieltag 2", "field": 1, "count": 2}]
        )

        assert card["severity"] == "warning"
        assert "2 Spiele ohne Ergebnis" in card["summary"]

    def test_open_results_card_none(self):
        assert official_open_results_card([]) is None
