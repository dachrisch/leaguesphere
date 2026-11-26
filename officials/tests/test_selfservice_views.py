from datetime import date, timedelta

from django.contrib.messages import get_messages
from django.test import Client, TestCase
from django.urls import reverse

from gamedays.models import Gameinfo, GameOfficial
from gamedays.tests.setup_factories.factories import (
    GamedayFactory,
    GameinfoFactory,
    GameOfficialFactory,
    TeamFactory,
)
from officials.constants import MOODLE_LOGGED_IN_USER, MOODLE_REMEMBER_COOKIE
from officials.tests.setup_factories.db_setup_officials import DbSetupOfficials
from officials.tests.setup_factories.factories_officials import OfficialFactory

LIST_URL_NAME = "view-officials-game-officials-appearance"
CLAIM_URL_NAME = "view-officials-selfservice-claim"
SEASON = date.today().year


def _game_with_row(official=None, name="Max Mustermann", position="Referee"):
    gameday = GamedayFactory(date=date(SEASON, 5, 1), name="Spieltag Einsätze")
    gameinfo = GameinfoFactory(gameday=gameday)
    row = GameOfficialFactory(
        gameinfo=gameinfo, official=official, name=name, position=position
    )
    return gameinfo, row


class SelfServiceTestBase(TestCase):
    def setUp(self):
        self.team = TeamFactory(name="Test Team")
        self.official = OfficialFactory(
            first_name="Max", last_name="Mustermann", team=self.team
        )
        self.other = OfficialFactory(
            first_name="Erika", last_name="Musterfrau", team=self.team
        )
        self.client = Client()

    def login_moodle(self, official=None, client=None):
        client = client or self.client
        session = client.session
        session[MOODLE_LOGGED_IN_USER] = (official or self.official).pk
        session.save()
        return client

    def messages(self, response):
        return [str(message) for message in get_messages(response.wsgi_request)]


class TestClaimAssignment(SelfServiceTestBase):
    def test_claim_confirm_shows_name_and_game(self):
        gameinfo, row = _game_with_row()
        self.login_moodle()

        response = self.client.get(reverse(CLAIM_URL_NAME, kwargs={"pk": row.pk}))

        assert response.status_code == 200
        content = response.content.decode()
        assert "Max Mustermann" in content
        assert "Spieltag Einsätze" in content
        assert "Referee" in content

    def test_claim_unmapped_row(self):
        gameinfo, row = _game_with_row()
        self.login_moodle()

        response = self.client.post(
            reverse(CLAIM_URL_NAME, kwargs={"pk": row.pk}), follow=True
        )

        assert response.status_code == 200
        row.refresh_from_db()
        assert row.official == self.official
        assert row.name == "Max Mustermann"

    def test_claim_already_mapped_fails(self):
        # A mapped row whose typed name is somebody else's must not be stolen.
        gameinfo, row = _game_with_row(official=self.other, name="Jemand Anders")
        self.login_moodle()

        response = self.client.post(
            reverse(CLAIM_URL_NAME, kwargs={"pk": row.pk}), follow=True
        )

        row.refresh_from_db()
        assert row.official == self.other
        assert any("anderen Person" in m for m in self.messages(response))

    def test_claim_conditional_update_has_single_winner(self):
        # Simulate another actor claiming the row after our SELECT but before
        # our conditional UPDATE. Our stale snapshot still says "unmapped",
        # so only the WHERE official IS NULL guard can prevent a double claim.
        from unittest.mock import patch

        from officials import selfservice

        gameinfo, row = _game_with_row()
        self.login_moodle()
        real_get = selfservice.get_object_or_404

        def claim_between_select_and_update(model, pk):
            loaded = real_get(model, pk=pk)
            GameOfficial.objects.filter(pk=loaded.pk, official__isnull=True).update(
                official=self.other
            )
            return loaded  # deliberately stale: still unmapped

        with patch(
            "officials.selfservice.get_object_or_404",
            side_effect=claim_between_select_and_update,
        ):
            response = self.client.post(
                reverse(CLAIM_URL_NAME, kwargs={"pk": row.pk}), follow=True
            )

        row.refresh_from_db()
        assert response.status_code == 200
        assert row.official == self.other
        assert any("bereits zugeordnet" in m for m in self.messages(response))

    def test_confirm_hides_another_officials_typed_name(self):
        gameinfo, row = _game_with_row(official=self.other, name="Erika Musterfrau")
        self.login_moodle()  # Max Mustermann, whose name does not match

        content = self.client.get(
            reverse(CLAIM_URL_NAME, kwargs={"pk": row.pk})
        ).content.decode()

        assert ">E****M****<" in content
        assert ">Erika Musterfrau<" not in content

    def test_confirm_without_results_does_not_duplicate_game_id(self):
        gameinfo, row = _game_with_row()
        self.login_moodle()

        content = self.client.get(
            reverse(CLAIM_URL_NAME, kwargs={"pk": row.pk})
        ).content.decode()

        assert f"Spiel #{gameinfo.pk}" in content
        assert f"Spiel #{gameinfo.pk} (#{gameinfo.pk})" not in content

    def test_moodle_cannot_claim_a_foreign_unmapped_row(self):
        # An unassigned row is not a free-for-all: the typed scorecard name
        # must contain the Moodle official's full name, just like a takeover
        # of a mapped row. A typed name proves nothing, but it is the only
        # check we have, so POST must enforce it too.
        gameinfo, row = _game_with_row(name="Someone Else")
        self.login_moodle()

        response = self.client.post(
            reverse(CLAIM_URL_NAME, kwargs={"pk": row.pk}), follow=True
        )

        row.refresh_from_db()
        assert row.official is None
        assert any("passt nicht" in m for m in self.messages(response))

    def test_moodle_cannot_claim_unmapped_row_with_partial_name(self):
        for typed_name in ("Max", "Mustermann"):
            with self.subTest(typed_name=typed_name):
                gameinfo, row = _game_with_row(name=typed_name)
                self.login_moodle()

                self.client.post(reverse(CLAIM_URL_NAME, kwargs={"pk": row.pk}))

                row.refresh_from_db()
                assert row.official is None

    def test_confirm_hides_form_for_a_foreign_unmapped_row(self):
        gameinfo, row = _game_with_row(name="Someone Else")
        self.login_moodle()

        content = self.client.get(
            reverse(CLAIM_URL_NAME, kwargs={"pk": row.pk})
        ).content.decode()

        assert "Einsatz übernehmen" not in content
        assert "passt nicht" in content
        # No name enumeration through the confirm page either.
        assert ">Someone Else<" not in content

    def test_anonymous_claim_redirects(self):
        gameinfo, row = _game_with_row()

        response = self.client.get(reverse(CLAIM_URL_NAME, kwargs={"pk": row.pk}))

        assert response.status_code == 302
        assert response.url.startswith(reverse("view-officials-moodle-login"))
        assert "next=" in response.url
        row.refresh_from_db()
        assert row.official is None

    def test_staff_claim_requires_official(self):
        gameinfo, row = _game_with_row()
        staff = self.login_moodle(official=None)
        staff.force_login(_staff_user())

        response = staff.post(
            reverse(CLAIM_URL_NAME, kwargs={"pk": row.pk}), follow=True
        )

        row.refresh_from_db()
        assert row.official is None
        assert any("Offizielle" in m for m in self.messages(response))

    def test_staff_claim_assigns_posted_official(self):
        gameinfo, row = _game_with_row()
        client = Client()
        client.force_login(_staff_user())

        client.post(
            reverse(CLAIM_URL_NAME, kwargs={"pk": row.pk}),
            {"official_id": str(self.other.pk)},
        )

        row.refresh_from_db()
        assert row.official == self.other


class TestAddAssignmentRejectsFutureGames(SelfServiceTestBase):
    def setUp(self):
        super().setUp()
        self.future_gameday = GamedayFactory(
            date=date.today() + timedelta(days=30), name="Zukünftiger Spieltag"
        )
        self.future_game = GameinfoFactory(gameday=self.future_gameday)

    def _post_payload(self):
        return {
            "gameday": str(self.future_gameday.pk),
            "gameinfo": str(self.future_game.pk),
            "position": "Referee",
        }

    def test_future_gameday_hidden_from_official_but_visible_to_staff(self):
        self.login_moodle()
        official_content = self.client.get(
            reverse(ASSIGNMENT_URL_NAME)
        ).content.decode()
        assert "Zukünftiger Spieltag" not in official_content

        staff = Client()
        staff.force_login(_staff_user())
        staff_content = staff.get(reverse(ASSIGNMENT_URL_NAME)).content.decode()
        assert "Zukünftiger Spieltag" in staff_content

    def test_official_cannot_post_a_future_game(self):
        self.login_moodle()

        response = self.client.post(
            reverse(ASSIGNMENT_URL_NAME), self._post_payload(), follow=True
        )

        assert not GameOfficial.objects.filter(gameinfo=self.future_game).exists()
        # The form refuses the future gameday as an invalid choice, so the
        # write never happens; the view re-checks the date as a second line
        # of defence for crafted posts that slip past choice validation.
        assert self.messages(response)

    def test_server_side_date_check_catches_a_well_formed_forged_post(self):
        from unittest.mock import patch

        from officials.forms_selfservice import AddAssignmentForm

        self.login_moodle()

        def forged_valid(form):
            form._errors = {}  # skip real choice validation, like a forged form
            form.cleaned_data = {
                "gameinfo": self.future_game,
                "position": "Referee",
            }
            return True

        with patch.object(AddAssignmentForm, "is_valid", autospec=True) as is_valid:
            is_valid.side_effect = forged_valid
            response = self.client.post(
                reverse(ASSIGNMENT_URL_NAME), self._post_payload(), follow=True
            )

        assert not GameOfficial.objects.filter(gameinfo=self.future_game).exists()
        assert any("zukünftigen Spieltag" in m for m in self.messages(response))

    def test_staff_can_post_a_future_game(self):
        staff = Client()
        staff.force_login(_staff_user())

        staff.post(
            reverse(ASSIGNMENT_URL_NAME),
            {**self._post_payload(), "official_id": str(self.other.pk)},
        )

        assert GameOfficial.objects.filter(
            gameinfo=self.future_game, official=self.other
        ).exists()


def _staff_user():
    from gamedays.tests.setup_factories.db_setup import DBSetup

    return DBSetup().create_new_user("staff", is_staff=True)


class TestEinsaetzeHighlightAndFilter(SelfServiceTestBase):
    def test_mine_filter(self):
        gameinfo, own_row = _game_with_row(official=self.official)
        gameinfo, other_row = _game_with_row(official=self.other, name=None)
        gameinfo, matching_open = _game_with_row(name="Max Mustermann")
        gameinfo, foreign_open = _game_with_row(name="Jemand Anders")
        self.login_moodle()

        response = self.client.get(reverse(LIST_URL_NAME), {"mine": "1"})

        content = response.content.decode()
        assert f'<th scope="row">{own_row.pk}</th>' in content
        assert f'<th scope="row">{matching_open.pk}</th>' in content
        assert f'<th scope="row">{other_row.pk}</th>' not in content
        assert f'<th scope="row">{foreign_open.pk}</th>' not in content

    def test_null_name_row_renders_for_anonymous(self):
        GameOfficial.objects.create(
            gameinfo=_game_with_row()[0],
            official=None,
            name=None,
            position="Referee",
        )

        response = self.client.get(reverse(LIST_URL_NAME))

        assert response.status_code == 200

    def test_own_rows_are_highlighted_and_reveal_the_name(self):
        gameinfo, own_row = _game_with_row(official=self.official)
        self.login_moodle()

        content = self.client.get(reverse(LIST_URL_NAME)).content.decode()

        assert "table-info" in content
        # Assert on the row's profile link, not the login banner, which
        # prints the acting official's name for unrelated reasons.
        assert (
            f'href="/officials/profile/{self.official.pk}/gamelist/{SEASON}/">'
            "Max Mustermann</a>"
        ) in content

    def test_unmapped_name_match_is_highlighted_with_claim_link(self):
        gameinfo, row = _game_with_row(name="Max Mustermann")
        self.login_moodle()

        content = self.client.get(reverse(LIST_URL_NAME)).content.decode()

        assert "Mir zuordnen" in content
        assert reverse(CLAIM_URL_NAME, kwargs={"pk": row.pk}) in content

    def test_list_offers_claim_only_on_matching_unmapped_rows(self):
        gameinfo, own = _game_with_row(name="Max Mustermann")
        gameinfo, foreign = _game_with_row(name="Someone Else")
        self.login_moodle()

        content = self.client.get(reverse(LIST_URL_NAME)).content.decode()

        assert reverse(CLAIM_URL_NAME, kwargs={"pk": own.pk}) in content
        assert reverse(CLAIM_URL_NAME, kwargs={"pk": foreign.pk}) not in content
        assert content.count("Mir zuordnen") == 1

    def test_mine_filter_query_count_is_flat_as_rows_grow(self):
        from django.db import connection
        from django.test.utils import CaptureQueriesContext

        self.login_moodle()
        _game_with_row(official=self.official)
        url = reverse(LIST_URL_NAME) + "?mine=1"

        # Capture the baseline once, then assert it both before and after
        # growing the result set - the count must not scale with row count.
        with CaptureQueriesContext(connection) as baseline:
            self.client.get(url)
        expected = len(baseline.captured_queries)

        with self.assertNumQueries(expected):
            self.client.get(url)

        for _ in range(5):
            _game_with_row(official=self.official)
        with self.assertNumQueries(expected):
            self.client.get(url)


class TestNameMatcher(TestCase):
    def test_matches_own_name_in_any_case_and_with_punctuation(self):
        from officials.selfservice import name_matches_official

        official = OfficialFactory(
            first_name="Max", last_name="Mustermann", team=TeamFactory(name="Test Team")
        )

        assert name_matches_official("max mustermann", official) is True
        assert name_matches_official("Mustermann, Max", official) is True
        assert name_matches_official("Max", official) is True

    def test_does_not_match_a_different_person(self):
        from officials.selfservice import name_matches_official

        official = OfficialFactory(
            first_name="Max", last_name="Mustermann", team=TeamFactory(name="Test Team")
        )

        assert name_matches_official("Erika Musterfrau", official) is False
        assert name_matches_official("", official) is False
        assert name_matches_official(None, official) is False


ASSIGNMENT_URL_NAME = "view-officials-selfservice-add-assignment"
UNASSIGN_URL_NAME = "view-officials-selfservice-unassign"


class TestAddAssignment(SelfServiceTestBase):
    def setUp(self):
        super().setUp()
        self.gameday = GamedayFactory(
            date=date(SEASON, 6, 1), name="Spieltag Nachtragen"
        )
        self.gameinfo = GameinfoFactory(gameday=self.gameday)

    def _post(self, client=None, **data):
        client = client or self.client
        payload = {
            "gameday": str(self.gameday.pk),
            "gameinfo": str(self.gameinfo.pk),
            "position": "Referee",
        }
        payload.update(data)
        return client.post(reverse(ASSIGNMENT_URL_NAME), payload, follow=True)

    def test_add_assignment_creates_row(self):
        self.login_moodle()

        response = self._post()

        row = GameOfficial.objects.get(gameinfo=self.gameinfo)
        assert response.status_code == 200
        assert row.official == self.official
        assert row.position == "Referee"

    def test_add_blocked_when_official_already_on_game(self):
        GameOfficialFactory(
            gameinfo=self.gameinfo, official=self.official, position="Side Judge"
        )
        self.login_moodle()

        response = self._post()

        assert GameOfficial.objects.filter(gameinfo=self.gameinfo).count() == 1
        assert any("bereits" in m for m in self.messages(response))

    def test_add_blocked_when_position_occupied(self):
        GameOfficialFactory(gameinfo=self.gameinfo, official=None, position="Referee")
        self.login_moodle()

        response = self._post()

        assert GameOfficial.objects.filter(gameinfo=self.gameinfo).count() == 1
        assert any("besetzt" in m for m in self.messages(response))

    def test_staff_add_requires_official_picker(self):
        client = Client()
        client.force_login(_staff_user())

        response = self._post(client=client)

        assert GameOfficial.objects.filter(gameinfo=self.gameinfo).count() == 0
        assert any("Offizielle" in m for m in self.messages(response))

    def test_staff_add_uses_posted_official(self):
        client = Client()
        client.force_login(_staff_user())

        self._post(client=client, official_id=str(self.other.pk))

        row = GameOfficial.objects.get(gameinfo=self.gameinfo)
        assert row.official == self.other

    def test_moodle_add_ignores_posted_official(self):
        self.login_moodle()

        self._post(official_id=str(self.other.pk))

        row = GameOfficial.objects.get(gameinfo=self.gameinfo)
        assert row.official == self.official

    def test_position_choices_exclude_scorecard_judge(self):
        self.login_moodle()

        content = self.client.get(
            reverse(ASSIGNMENT_URL_NAME), {"gameday": str(self.gameday.pk)}
        ).content.decode()

        assert "Referee" in content
        assert "Scorecard Judge" not in content

    def test_unknown_position_is_rejected(self):
        self.login_moodle()

        response = self._post(position="Scorecard Judge")

        assert GameOfficial.objects.filter(gameinfo=self.gameinfo).count() == 0
        assert any("Position" in m for m in self.messages(response))

    def test_add_locks_the_game_before_creating(self):
        from unittest import mock

        self.login_moodle()
        real_select_for_update = Gameinfo.objects.select_for_update

        with mock.patch.object(
            Gameinfo.objects, "select_for_update", wraps=real_select_for_update
        ) as select_for_update:
            self._post()

        assert select_for_update.called
        assert GameOfficial.objects.filter(gameinfo=self.gameinfo).count() == 1

    def test_cancel_link_forwards_validated_next(self):
        from html import unescape

        self.login_moodle()
        target = reverse(LIST_URL_NAME) + f"?mine=1&season={SEASON}"

        content = unescape(
            self.client.get(
                reverse(ASSIGNMENT_URL_NAME),
                {"next": target, "gameday": str(self.gameday.pk)},
            ).content.decode()
        )

        assert f'href="{target}"' in content

    def test_cancel_link_keeps_season_when_no_next(self):
        self.login_moodle()

        content = self.client.get(
            reverse(ASSIGNMENT_URL_NAME),
            {"season": str(SEASON), "gameday": str(self.gameday.pk)},
        ).content.decode()

        expected = reverse(
            "view-officials-game-officials-appearance-for-year",
            kwargs={"season": SEASON},
        )
        assert f'href="{expected}"' in content


class TestUnassign(SelfServiceTestBase):
    def test_unassign_staff_only(self):
        gameinfo, row = _game_with_row(official=self.other)
        client = Client()
        client.force_login(_staff_user())

        client.post(reverse(UNASSIGN_URL_NAME, kwargs={"pk": row.pk}), follow=True)

        row.refresh_from_db()
        assert row.official is None
        assert row.name == "Max Mustermann"

    def test_moodle_user_cannot_unassign(self):
        gameinfo, row = _game_with_row(official=self.official)
        self.login_moodle()

        response = self.client.post(
            reverse(UNASSIGN_URL_NAME, kwargs={"pk": row.pk}), follow=True
        )

        row.refresh_from_db()
        assert row.official == self.official
        assert response.status_code == 200

    def test_anonymous_unassign_redirects_to_login(self):
        gameinfo, row = _game_with_row(official=self.other)

        response = self.client.post(reverse(UNASSIGN_URL_NAME, kwargs={"pk": row.pk}))

        assert response.status_code == 302
        assert response.url.startswith(reverse("view-officials-moodle-login"))

    def test_confirm_without_results_does_not_duplicate_game_id(self):
        gameinfo, row = _game_with_row(official=self.other)
        client = Client()
        client.force_login(_staff_user())

        content = client.get(
            reverse(UNASSIGN_URL_NAME, kwargs={"pk": row.pk})
        ).content.decode()

        assert f"Spiel #{gameinfo.pk}" in content
        assert f"Spiel #{gameinfo.pk} (#{gameinfo.pk})" not in content


EXTERNAL_EDIT_URL_NAME = "view-officials-selfservice-external-edit"
EXTERNAL_DELETE_URL_NAME = "view-officials-selfservice-external-delete"


def _external_entry(official, association_abbr="AFCVHH", date="2026-05-24"):
    from officials.models import OfficialExternalGames
    from gamedays.models import Association

    association, _created = Association.objects.get_or_create(
        abbr=association_abbr, defaults={"name": association_abbr}
    )
    return OfficialExternalGames.objects.create(
        official=official,
        number_games=2,
        date=date,
        notification_date=date,
        position="Referee",
        association=association,
        halftime_duration=20,
        has_clockcontrol=True,
        is_international=False,
        reporter_name="Melder",
        comment="",
    )


def _external_form_data(**overrides):
    from gamedays.models import Association

    association = Association.objects.get(abbr="AFCVT")
    data = {
        "date": "2026-06-02",
        "number_games": "3",
        "position": "Side Judge",
        "association": str(association.pk),
        "halftime_duration": "25",
        "comment": "geändert",
    }
    data.update(overrides)
    return data


class TestExternalGameEdit(SelfServiceTestBase):
    def setUp(self):
        super().setUp()
        DbSetupOfficials.create_production_associations()
        self.entry = _external_entry(self.official)

    def test_owner_edits_external_entry(self):
        self.login_moodle()

        response = self.client.post(
            reverse(EXTERNAL_EDIT_URL_NAME, kwargs={"pk": self.entry.pk}),
            _external_form_data(),
            follow=True,
        )

        self.entry.refresh_from_db()
        assert response.status_code == 200
        assert self.entry.number_games == 3
        assert self.entry.position == "Side Judge"
        assert self.entry.association.abbr == "AFCVT"
        assert self.entry.comment == "geändert"
        assert self.entry.is_international is False

    def test_other_official_cannot_edit(self):
        self.login_moodle(self.other)

        response = self.client.post(
            reverse(EXTERNAL_EDIT_URL_NAME, kwargs={"pk": self.entry.pk}),
            _external_form_data(),
        )

        self.entry.refresh_from_db()
        assert response.status_code == 403
        assert self.entry.number_games == 2

    def test_anonymous_redirects(self):
        response = self.client.get(
            reverse(EXTERNAL_EDIT_URL_NAME, kwargs={"pk": self.entry.pk})
        )

        assert response.status_code == 302
        assert response.url.startswith(reverse("view-officials-moodle-login"))

    def test_staff_edits_any(self):
        client = Client()
        client.force_login(_staff_user())

        client.post(
            reverse(EXTERNAL_EDIT_URL_NAME, kwargs={"pk": self.entry.pk}),
            _external_form_data(),
        )

        self.entry.refresh_from_db()
        assert self.entry.number_games == 3

    def test_staff_can_reassign_official(self):
        client = Client()
        client.force_login(_staff_user())

        client.post(
            reverse(EXTERNAL_EDIT_URL_NAME, kwargs={"pk": self.entry.pk}),
            _external_form_data(official_id=str(self.other.pk)),
        )

        self.entry.refresh_from_db()
        assert self.entry.official == self.other

    def test_owner_form_hides_staff_fields(self):
        self.login_moodle()

        content = self.client.get(
            reverse(EXTERNAL_EDIT_URL_NAME, kwargs={"pk": self.entry.pk})
        ).content.decode()

        assert 'name="notification_date"' not in content
        assert 'name="reporter_name"' not in content
        assert 'name="official_id"' not in content

    def test_association_is_a_dropdown(self):
        from django import forms

        from officials.forms_selfservice import ExternalGameForm

        field = ExternalGameForm().fields["association"]

        assert isinstance(field, forms.ModelChoiceField)

    def test_free_text_association_is_rejected(self):
        self.login_moodle()

        response = self.client.post(
            reverse(EXTERNAL_EDIT_URL_NAME, kwargs={"pk": self.entry.pk}),
            _external_form_data(association="Fantasie-Verband"),
        )

        self.entry.refresh_from_db()
        assert response.status_code == 200
        assert "association" in response.context["form"].errors
        assert self.entry.number_games == 2


class TestExternalGameDelete(SelfServiceTestBase):
    def setUp(self):
        super().setUp()
        DbSetupOfficials.create_production_associations()
        self.entry = _external_entry(self.official)

    def test_delete_owner(self):
        self.login_moodle()

        confirm = self.client.get(
            reverse(EXTERNAL_DELETE_URL_NAME, kwargs={"pk": self.entry.pk})
        )
        assert confirm.status_code == 200
        assert "24.05.2026" in confirm.content.decode()

        self.client.post(
            reverse(EXTERNAL_DELETE_URL_NAME, kwargs={"pk": self.entry.pk})
        )

        from officials.models import OfficialExternalGames

        assert not OfficialExternalGames.objects.filter(pk=self.entry.pk).exists()

    def test_delete_other_forbidden(self):
        self.login_moodle(self.other)

        response = self.client.post(
            reverse(EXTERNAL_DELETE_URL_NAME, kwargs={"pk": self.entry.pk})
        )

        from officials.models import OfficialExternalGames

        assert response.status_code == 403
        assert OfficialExternalGames.objects.filter(pk=self.entry.pk).exists()

    def test_delete_staff(self):
        client = Client()
        client.force_login(_staff_user())

        client.post(reverse(EXTERNAL_DELETE_URL_NAME, kwargs={"pk": self.entry.pk}))

        from officials.models import OfficialExternalGames

        assert not OfficialExternalGames.objects.filter(pk=self.entry.pk).exists()


DFFL_DELETE_URL_NAME = "view-officials-selfservice-dffl-delete"


class TestDfflGameDelete(SelfServiceTestBase):
    def test_owner_deletes_dffl_entry(self):
        gameinfo, row = _game_with_row(official=self.official)
        self.login_moodle()

        response = self.client.post(
            reverse(DFFL_DELETE_URL_NAME, kwargs={"pk": row.pk}), follow=True
        )

        assert response.status_code == 200
        row.refresh_from_db()
        assert row.official is None
        assert row.name == "Max Mustermann"
        assert row.position == "Referee"
        assert row.gameinfo_id == gameinfo.pk
        assert Gameinfo.objects.filter(pk=gameinfo.pk).exists()

    def test_concurrent_reassignment_loses_the_clear(self):
        from unittest.mock import patch

        from officials import selfservice

        gameinfo, row = _game_with_row(official=self.official)
        self.login_moodle()
        real_get = selfservice.get_object_or_404

        def reassign_between_select_and_update(model, pk):
            loaded = real_get(model, pk=pk)
            GameOfficial.objects.filter(pk=loaded.pk).update(official=self.other)
            return loaded  # deliberately stale: still owned by self.official

        with patch(
            "officials.selfservice.get_object_or_404",
            side_effect=reassign_between_select_and_update,
        ):
            response = self.client.post(
                reverse(DFFL_DELETE_URL_NAME, kwargs={"pk": row.pk}), follow=True
            )

        row.refresh_from_db()
        assert row.official == self.other
        assert any("bereits zugeordnet" in m for m in self.messages(response))

    def test_other_official_forbidden(self):
        gameinfo, row = _game_with_row(official=self.other)
        self.login_moodle()

        response = self.client.post(
            reverse(DFFL_DELETE_URL_NAME, kwargs={"pk": row.pk})
        )

        assert response.status_code == 403
        assert GameOfficial.objects.filter(pk=row.pk).exists()

    def test_anonymous_redirects(self):
        gameinfo, row = _game_with_row(official=self.official)

        response = self.client.get(reverse(DFFL_DELETE_URL_NAME, kwargs={"pk": row.pk}))

        assert response.status_code == 302
        assert response.url.startswith(reverse("view-officials-moodle-login"))

    def test_staff_deletes_any(self):
        gameinfo, row = _game_with_row(official=self.other)
        client = Client()
        client.force_login(_staff_user())

        client.post(reverse(DFFL_DELETE_URL_NAME, kwargs={"pk": row.pk}))

        row.refresh_from_db()
        assert row.official is None
        assert row.name == "Max Mustermann"
        assert row.gameinfo_id == gameinfo.pk

    def test_unassign_confirm_states_the_row_is_kept_for_past_and_future_games(self):
        future_gameday = GamedayFactory(date="2027-05-01", name="Zukunftsspieltag")
        future_game = GameinfoFactory(gameday=future_gameday)
        future_row = GameOfficialFactory(
            gameinfo=future_game, official=self.official, position="Referee"
        )
        gameinfo, past_row = _game_with_row(official=self.official)
        self.login_moodle()

        future_content = self.client.get(
            reverse(DFFL_DELETE_URL_NAME, kwargs={"pk": future_row.pk})
        ).content.decode()
        past_content = self.client.get(
            reverse(DFFL_DELETE_URL_NAME, kwargs={"pk": past_row.pk})
        ).content.decode()

        # No scorecard warning is needed: the row stays with official=NULL, so
        # a later scorecard save fills it instead of creating an empty slot.
        assert "Der Eintrag bleibt" in future_content
        assert "Zuordnung aufheben" in future_content
        assert "Der Eintrag bleibt" in past_content
        assert "kann für diese Position wieder ein leerer Eintrag" not in future_content

    def test_confirm_without_results_does_not_duplicate_game_id(self):
        gameinfo, row = _game_with_row(official=self.official)
        self.login_moodle()

        content = self.client.get(
            reverse(DFFL_DELETE_URL_NAME, kwargs={"pk": row.pk})
        ).content.decode()

        assert f"Spiel #{gameinfo.pk}" in content
        assert f"Spiel #{gameinfo.pk} (#{gameinfo.pk})" not in content


MULTI_ADD_URL_NAME = "view-officials-selfservice-external-multi-add"


def _formset_data(rows, **overrides):
    from gamedays.models import Association

    association = Association.objects.get(abbr="AFCVT")
    data = {
        "form-TOTAL_FORMS": str(len(rows)),
        "form-INITIAL_FORMS": "0",
        "form-MIN_NUM_FORMS": "0",
        "form-MAX_NUM_FORMS": "1000",
    }
    for index, row in enumerate(rows):
        values = {
            "date": "2026-06-02",
            "number_games": "2",
            "position": "Referee",
            "association": str(association.pk),
            "halftime_duration": "20",
            "comment": "",
        }
        values.update(row)
        for field, value in values.items():
            data[f"form-{index}-{field}"] = value
    data.update(overrides)
    return data


class TestExternalGameMultiAdd(SelfServiceTestBase):
    def setUp(self):
        super().setUp()
        DbSetupOfficials.create_production_associations()

    def test_duplicate_rows_in_one_submission_are_rejected(self):
        from officials.models import OfficialExternalGames

        self.login_moodle()

        response = self.client.post(
            reverse(MULTI_ADD_URL_NAME), _formset_data([{}, {}])
        )

        assert response.status_code == 200
        assert OfficialExternalGames.objects.count() == 0
        assert "identisch" in response.content.decode()

    def test_duplicate_of_an_existing_entry_is_rejected(self):
        from officials.models import OfficialExternalGames

        self.login_moodle()
        _external_entry(self.official, association_abbr="AFCVT", date="2026-06-02")

        response = self.client.post(reverse(MULTI_ADD_URL_NAME), _formset_data([{}]))

        assert response.status_code == 200
        assert OfficialExternalGames.objects.count() == 1
        assert "existiert bereits" in response.content.decode()

    def test_staff_id_survives_add_row_and_add_row_skips_validation(self):
        staff = Client()
        staff.force_login(_staff_user())

        content = staff.post(
            reverse(MULTI_ADD_URL_NAME),
            _formset_data([{}], official_id=str(self.other.pk), add_row="1"),
        ).content.decode()

        assert f'value="{self.other.pk}"' in content
        assert "formnovalidate" in content

    def test_multi_add_three_rows_atomic(self):
        self.login_moodle()

        response = self.client.post(
            reverse(MULTI_ADD_URL_NAME),
            _formset_data(
                [
                    {"number_games": "2"},
                    {"number_games": "3", "position": "Mix"},
                    {"number_games": "4", "comment": "letzte Zeile"},
                ]
            ),
            follow=True,
        )

        from datetime import date

        from officials.models import OfficialExternalGames

        entries = OfficialExternalGames.objects.filter(official=self.official)
        assert response.status_code == 200
        assert entries.count() == 3
        assert sorted(entries.values_list("number_games", flat=True)) == [2, 3, 4]
        assert all(entry.notification_date == date.today() for entry in entries)
        assert all(entry.reporter_name == "Max Mustermann" for entry in entries)

    def test_invalid_row_rolls_back_all(self):
        self.login_moodle()

        response = self.client.post(
            reverse(MULTI_ADD_URL_NAME),
            _formset_data(
                [{"number_games": "2"}, {"position": "Unfug"}],
            ),
        )

        from officials.models import OfficialExternalGames

        assert response.status_code == 200
        assert OfficialExternalGames.objects.count() == 0
        assert response.context["formset"].errors

    def test_add_row_grows_formset(self):
        self.login_moodle()

        response = self.client.post(
            reverse(MULTI_ADD_URL_NAME),
            _formset_data([{"number_games": "7"}], add_row="1"),
        )

        from officials.models import OfficialExternalGames

        assert response.status_code == 200
        assert len(response.context["formset"].forms) == 2
        assert response.context["formset"].forms[0]["number_games"].value() == "7"
        assert OfficialExternalGames.objects.count() == 0

    def test_staff_requires_official_picker(self):
        client = Client()
        client.force_login(_staff_user())

        response = client.post(
            reverse(MULTI_ADD_URL_NAME), _formset_data([{"number_games": "2"}])
        )

        from officials.models import OfficialExternalGames

        assert OfficialExternalGames.objects.count() == 0
        assert any("Offizielle" in m for m in self.messages(response))

    def test_staff_uses_posted_official(self):
        client = Client()
        client.force_login(_staff_user())

        client.post(
            reverse(MULTI_ADD_URL_NAME),
            _formset_data([{"number_games": "2"}], official_id=str(self.other.pk)),
        )

        from officials.models import OfficialExternalGames

        entry = OfficialExternalGames.objects.get()
        assert entry.official == self.other
        assert entry.reporter_name == "staff"

    def test_moodle_target_fixed_to_self(self):
        self.login_moodle()

        self.client.post(
            reverse(MULTI_ADD_URL_NAME),
            _formset_data([{"number_games": "2"}], official_id=str(self.other.pk)),
        )

        from officials.models import OfficialExternalGames

        assert OfficialExternalGames.objects.get().official == self.official

    def test_association_dropdown_in_every_row(self):
        self.login_moodle()

        content = self.client.get(reverse(MULTI_ADD_URL_NAME)).content.decode()

        assert content.count('name="form-0-association"') == 1
        assert "<select" in content

    def test_atomic_block_rolls_back_all_rows_when_a_save_fails(self):
        from unittest.mock import patch

        from officials.models import OfficialExternalGames

        real_save = OfficialExternalGames.save
        calls = 0

        def failing_save(instance, *args, **kwargs):
            nonlocal calls
            calls += 1
            if calls == 2:
                raise RuntimeError("Zweiter Speichervorgang fehlgeschlagen")
            return real_save(instance, *args, **kwargs)

        # The client swallows the view exception (500 response) so the
        # surrounding TestCase transaction is not left rollback-only.
        client = Client(raise_request_exception=False)
        self.login_moodle(client=client)

        with patch.object(OfficialExternalGames, "save", failing_save):
            response = client.post(
                reverse(MULTI_ADD_URL_NAME),
                _formset_data([{"number_games": "2"}, {"number_games": "3"}]),
            )

        assert response.status_code == 500
        assert calls == 2
        assert OfficialExternalGames.objects.count() == 0

    def test_cancel_link_forwards_validated_next(self):
        from html import unescape

        self.login_moodle()
        target = reverse(LIST_URL_NAME) + f"?mine=1&season={SEASON}"

        content = unescape(
            self.client.get(
                reverse(MULTI_ADD_URL_NAME), {"next": target}
            ).content.decode()
        )

        assert f'href="{target}"' in content


class TestStaffExternalFormValues(SelfServiceTestBase):
    def test_staff_form_shows_the_current_values(self):
        DbSetupOfficials.create_production_associations()
        entry = _external_entry(self.official)
        entry.notification_date = "2026-05-26"
        entry.reporter_name = "Melder Max"
        entry.save()
        client = Client()
        client.force_login(_staff_user())

        content = client.get(
            reverse(EXTERNAL_EDIT_URL_NAME, kwargs={"pk": entry.pk})
        ).content.decode()

        assert 'value="2026-05-26"' in content
        assert 'value="Melder Max"' in content
        assert f'value="{self.official.pk}"' in content


class TestStaffExternalFieldsAreSaved(SelfServiceTestBase):
    def test_staff_edit_saves_notification_date_and_reporter_name(self):
        DbSetupOfficials.create_production_associations()
        entry = _external_entry(self.official)
        client = Client()
        client.force_login(_staff_user())

        client.post(
            reverse(EXTERNAL_EDIT_URL_NAME, kwargs={"pk": entry.pk}),
            _external_form_data(
                notification_date="2026-06-03", reporter_name="Staff Melder"
            ),
        )

        entry.refresh_from_db()
        assert str(entry.notification_date) == "2026-06-03"
        assert entry.reporter_name == "Staff Melder"

    def test_unknown_staff_official_id_is_a_form_error_without_a_write(self):
        DbSetupOfficials.create_production_associations()
        entry = _external_entry(self.official)
        client = Client()
        client.force_login(_staff_user())

        response = client.post(
            reverse(EXTERNAL_EDIT_URL_NAME, kwargs={"pk": entry.pk}),
            _external_form_data(
                official_id="999999", reporter_name="Soll nicht stehen"
            ),
        )

        assert "Offizielle-ID nicht gefunden" in response.content.decode()
        entry.refresh_from_db()
        assert entry.official_id == self.official.pk
        assert entry.reporter_name != "Soll nicht stehen"


class TestNamelessOfficialCannotClaim(SelfServiceTestBase):
    def test_empty_name_tokens_never_pass_the_gate(self):
        from types import SimpleNamespace

        from officials.selfservice import can_reclaim_official

        nameless = OfficialFactory(
            first_name="", last_name="!!!", team=self.official.team
        )
        row = SimpleNamespace(name="Any Name", official_id=None, official=None)
        request = SimpleNamespace(
            user=SimpleNamespace(is_authenticated=True, is_staff=False)
        )

        assert can_reclaim_official(request, row, nameless) is False

        gameinfo, real_row = _game_with_row(name="Any Name")
        client = self.login_moodle(official=nameless)
        client.post(reverse(CLAIM_URL_NAME, kwargs={"pk": real_row.pk}))

        real_row.refresh_from_db()
        assert real_row.official is None


class TestOwnOpenRowHighlight(SelfServiceTestBase):
    def test_only_the_matching_open_row_is_highlighted(self):
        gameinfo, matching = _game_with_row(name="Max Mustermann")
        gameinfo, foreign = _game_with_row(name="Jemand Anders")
        self.login_moodle()

        content = self.client.get(reverse(LIST_URL_NAME)).content.decode()

        assert content.count("table-info") == 1
        own_marker = f'<tr class="table-info">'
        after_marker = content.split(own_marker, 1)[1]
        assert f'<th scope="row">{matching.pk}</th>' in after_marker[:80]
        assert f'<th scope="row">{foreign.pk}</th>' not in after_marker[:80]


class TestRememberCookieRotationOnWriteViews(SelfServiceTestBase):
    def test_write_view_rotates_the_remember_cookie(self):
        from officials.service.remember_me import RememberMeService

        client = Client()
        client.cookies[MOODLE_REMEMBER_COOKIE] = RememberMeService.issue(
            self.official.pk
        )

        response = client.get(reverse(ASSIGNMENT_URL_NAME))

        assert client.session.get(MOODLE_LOGGED_IN_USER) == self.official.pk
        rotated = response.cookies[MOODLE_REMEMBER_COOKIE]
        assert rotated.value
        assert rotated["path"] == "/officials/"

    def test_logout_revokes_legacy_and_current_remember_tokens(self):
        from officials.constants import (
            LEGACY_REMEMBER_COOKIE_PATH,
            MOODLE_REMEMBER_COOKIE,
            REMEMBER_COOKIE_PATH,
        )
        from officials.models import MoodleRememberToken
        from officials.selfservice import delete_remember_cookie
        from officials.service.remember_me import RememberMeService
        from django.http import HttpResponse

        first = RememberMeService.issue(self.official.pk)
        second = RememberMeService.issue(self.official.pk)
        assert MoodleRememberToken.objects.count() == 2

        response = self.client.get(
            reverse("view-officials-sign-out"),
            HTTP_COOKIE=f"{MOODLE_REMEMBER_COOKIE}={first}; "
            f"{MOODLE_REMEMBER_COOKIE}={second}",
        )

        assert MoodleRememberToken.objects.count() == 0
        deletions = [m.OutputString() for m in response.cookies.values()]
        assert any(f"Path={REMEMBER_COOKIE_PATH}" in h for h in deletions)
        assert any(f"Path={LEGACY_REMEMBER_COOKIE_PATH}" in h for h in deletions)

        # Explicit helper check: both deletion headers carry the real name.
        helper_response = HttpResponse()
        delete_remember_cookie(helper_response)
        assert [m.key for m in helper_response.cookies.values()] == [
            MOODLE_REMEMBER_COOKIE,
            MOODLE_REMEMBER_COOKIE,
        ]

    def test_remember_me_restore_rotates_the_session_key(self):
        from officials.service.remember_me import RememberMeService

        client = Client()
        client.cookies[MOODLE_REMEMBER_COOKIE] = RememberMeService.issue(
            self.official.pk
        )
        session = client.session
        session["pre_auth"] = "kept"
        session.save()
        old_key = session.session_key
        assert old_key is not None

        client.get(reverse(ASSIGNMENT_URL_NAME))

        assert client.session.session_key != old_key
        assert client.session["pre_auth"] == "kept"
        assert client.session.get(MOODLE_LOGGED_IN_USER) == self.official.pk


class TestAddAssignmentInputRobustness(SelfServiceTestBase):
    def test_unknown_gameday_parameter_does_not_crash(self):
        self.login_moodle()

        response = self.client.get(reverse(ASSIGNMENT_URL_NAME), {"gameday": "abc"})

        assert response.status_code == 200


class TestSelfServiceButtons(SelfServiceTestBase):
    def test_claim_button_fills_width_and_cancel_is_outline_danger(self):
        DbSetupOfficials.create_production_associations()
        gameinfo, row = _game_with_row()
        self.login_moodle()

        content = self.client.get(
            reverse(CLAIM_URL_NAME, kwargs={"pk": row.pk})
        ).content.decode()

        assert 'btn btn-primary w-100" type="submit">Einsatz übernehmen' in content
        assert (
            '<div class="col-auto">\n                <a class="btn btn-outline-danger"'
            in content
        )
        assert "Abbrechen" in content

    def test_cancel_links_use_outline_danger(self):
        DbSetupOfficials.create_production_associations()
        client = Client()
        client.force_login(_staff_user())

        for url in (
            reverse(ASSIGNMENT_URL_NAME) + "?gameday=930",
            reverse(MULTI_ADD_URL_NAME),
        ):
            content = client.get(url).content.decode()
            assert ">Abbrechen<" in content
            assert "btn btn-outline-danger" in content, url


class TestReclaimMappedAssignment(SelfServiceTestBase):
    def _mapped_row_for(self, typed_name, mapped_to):
        self.official.first_name = "Bastian"
        self.official.last_name = "Danz"
        self.official.save()
        return _game_with_row(official=mapped_to, name=typed_name)

    def test_official_reclaims_mapped_row_with_matching_typed_name(self):
        gameinfo, row = self._mapped_row_for("Bastian Danz", self.other)
        self.login_moodle()

        response = self.client.post(
            reverse(CLAIM_URL_NAME, kwargs={"pk": row.pk}), follow=True
        )

        row.refresh_from_db()
        assert row.official == self.official
        assert any("zugeordnet" in m for m in self.messages(response))

    def test_official_cannot_reclaim_a_row_of_someone_else(self):
        gameinfo, row = self._mapped_row_for("Jemand Anders", self.other)
        self.login_moodle()

        response = self.client.post(
            reverse(CLAIM_URL_NAME, kwargs={"pk": row.pk}), follow=True
        )

        row.refresh_from_db()
        assert row.official == self.other
        assert any("anderen Person" in m for m in self.messages(response))

    def test_partial_typed_name_cannot_reclaim_a_mapped_row(self):
        # "Bastian" or "Danz" alone are not enough to take over a row typed
        # with the full name; only the complete official name authorizes it.
        for typed_name in ("Bastian", "Danz", "Bastian Dantzer"):
            with self.subTest(typed_name=typed_name):
                gameinfo, row = self._mapped_row_for(typed_name, self.other)
                self.login_moodle()

                response = self.client.post(
                    reverse(CLAIM_URL_NAME, kwargs={"pk": row.pk}), follow=True
                )

                row.refresh_from_db()
                assert row.official == self.other
                assert any("anderen Person" in m for m in self.messages(response))

    def test_superset_typed_name_does_not_steal_a_correctly_mapped_row(self):
        # "Max Mustermann" must not take over "Max Mustermann-Schmidt" when
        # that row is already mapped to Max Schmidt: the typed name fits the
        # current owner, so it is theirs, not a typo to be corrected.
        owner = OfficialFactory(
            first_name="Max", last_name="Schmidt", team=self.official.team
        )
        gameinfo, row = _game_with_row(official=owner, name="Max Mustermann-Schmidt")
        self.login_moodle()

        response = self.client.post(
            reverse(CLAIM_URL_NAME, kwargs={"pk": row.pk}), follow=True
        )

        row.refresh_from_db()
        assert row.official == owner
        assert any("anderen Person" in m for m in self.messages(response))

    def test_homonym_does_not_take_over_another_officials_row(self):
        twin = OfficialFactory(
            first_name=self.official.first_name,
            last_name=self.official.last_name,
            team=self.official.team,
        )
        gameinfo, row = _game_with_row(official=twin, name="Max Mustermann")
        self.login_moodle()

        self.client.post(reverse(CLAIM_URL_NAME, kwargs={"pk": row.pk}))

        row.refresh_from_db()
        assert row.official == twin

    def test_partial_typed_name_is_not_revealed_on_confirm_page(self):
        gameinfo, row = self._mapped_row_for("Danz", self.other)
        self.login_moodle()

        content = self.client.get(
            reverse(CLAIM_URL_NAME, kwargs={"pk": row.pk})
        ).content.decode()

        assert ">D****<" in content
        assert ">Danz<" not in content

    def test_staff_can_reassign_a_mapped_row(self):
        gameinfo, row = self._mapped_row_for("Jemand Anders", self.other)
        client = Client()
        client.force_login(_staff_user())

        client.post(
            reverse(CLAIM_URL_NAME, kwargs={"pk": row.pk}),
            {"official_id": str(self.official.pk)},
        )

        row.refresh_from_db()
        assert row.official == self.official

    def test_confirm_page_offers_the_form_for_a_matching_mapped_row(self):
        gameinfo, row = self._mapped_row_for("Bastian Danz", self.other)
        self.login_moodle()

        content = self.client.get(
            reverse(CLAIM_URL_NAME, kwargs={"pk": row.pk})
        ).content.decode()

        assert "Einsatz übernehmen" in content
        assert "nicht überschrieben" not in content

    def test_list_offers_reclaim_only_for_matching_mapped_rows(self):
        gameinfo, own = self._mapped_row_for("Bastian Danz", self.other)
        gameinfo, foreign = _game_with_row(official=self.other, name="Jemand Anders")
        self.login_moodle()

        content = self.client.get(reverse(LIST_URL_NAME)).content.decode()

        assert content.count("Das war ich") == 1
        own_link = reverse(CLAIM_URL_NAME, kwargs={"pk": own.pk})
        foreign_link = reverse(CLAIM_URL_NAME, kwargs={"pk": foreign.pk})
        assert own_link in content
        assert foreign_link not in content
