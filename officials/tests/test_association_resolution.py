import importlib
from unittest.mock import MagicMock

import pytest

from gamedays.models import Association
from gamedays.tests.setup_factories.factories import TeamFactory
from officials.api.serializers import OfficialExternalGamesSerializer
from officials.models import OfficialExternalGames
from officials.service.association_resolution import (
    ASSOCIATION_ALIASES,
    UnknownAssociationError,
    resolve_association,
)
from officials.service.game_official_entries import ExternalGameOfficialEntry
from officials.tests.setup_factories.db_setup_officials import (
    PRODUCTION_ASSOCIATIONS,
    DbSetupOfficials,
)
from officials.tests.setup_factories.factories_officials import (
    OfficialExternalGamesFactory,
    OfficialFactory,
)

# The data migration's module name starts with a digit, so import it explicitly.
MIGRATION = importlib.import_module(
    "officials.migrations.0017_officialexternalgames_association_fk"
)


class _MigrationRow:
    """Stand-in for the historical OfficialExternalGames row in forwards()."""

    def __init__(self, pk, association):
        self.pk = pk
        self.association = association
        self.association_new_id = None


# Every distinct value found in the production dump's free-text association
# column, mapped onto the association it must resolve to (user-fixed mapping:
# no new association rows are created).
PRODUCTION_VALUES = [
    ("OHNE", "OHNE"),
    ("AFCVBB", "AFCVBB"),
    ("AFCVBW", "AFCVBW"),
    ("AFVBY", "AFVBY"),
    ("AFVH", "AFVH"),
    ("AFCVMV", "AFCVMV"),
    ("AFCVN", "AFCVN"),
    ("AFVS", "AFVS"),
    ("AFCVNRW", "AFCVNRW"),
    ("AFCVT", "AFCVT"),
    ("AFCVSH", "AFCVSH"),
    ("AFVSA", "AFVSA"),
    ("AFCVHH", "AFCVHH"),
    ("AFCVNORD", "AFCVNORD"),
    ("AFCVRLP", "AFCVRLP"),
    ("AFCVSAA", "AFCVSAA"),
    ("AFCVTH", "AFCVT"),
    ("Spielverbund Nord", "AFCVNORD"),
    ("Ausland", "OHNE"),
    ("Scrimmage", "OHNE"),
    ("Natio", "OHNE"),
]


@pytest.fixture
def associations(db):
    DbSetupOfficials.create_production_associations()


class TestAssociationResolution:
    @pytest.mark.parametrize("value,expected_abbr", PRODUCTION_VALUES)
    def test_every_production_value_maps(self, associations, value, expected_abbr):
        assert resolve_association(value).abbr == expected_abbr

    def test_name_fallback(self, associations):
        assert resolve_association("Hamburg").abbr == "AFCVHH"

    @pytest.mark.parametrize(
        "value,expected_abbr",
        [
            ("afcvth", "AFCVT"),
            ("AfCvTh", "AFCVT"),
            ("spielverbund nord", "AFCVNORD"),
            ("ausland", "OHNE"),
            ("scrimmage", "OHNE"),
            ("natio", "OHNE"),
        ],
    )
    def test_lowercase_alias_resolves_case_insensitively(
        self, associations, value, expected_abbr
    ):
        assert resolve_association(value).abbr == expected_abbr

    @pytest.mark.parametrize("value", ["Doppelstadt", "doppelstadt"])
    def test_ambiguous_name_raises_instead_of_picking_a_row(self, associations, value):
        Association.objects.create(abbr="DOPPEL1", name="Doppelstadt")
        Association.objects.create(abbr="DOPPEL2", name="Doppelstadt")

        with pytest.raises(UnknownAssociationError, match="Mehrdeutig"):
            resolve_association(value)

    def test_alias_map_is_exactly_the_documented_one(self):
        assert ASSOCIATION_ALIASES == {
            "AFCVTH": "AFCVT",
            "Spielverbund Nord": "AFCVNORD",
            "Ausland": "OHNE",
            "Scrimmage": "OHNE",
            "Natio": "OHNE",
        }

    def test_unknown_raises(self, associations):
        with pytest.raises(UnknownAssociationError):
            resolve_association("Fantasie-Verband")

    @pytest.mark.parametrize("value", ["", "   ", None])
    def test_empty_raises(self, db, value):
        with pytest.raises(UnknownAssociationError):
            resolve_association(value)

    def test_unknown_error_is_a_value_error(self):
        assert issubclass(UnknownAssociationError, ValueError)


class TestExternalGameAssociationIntegration:
    """The column used to be free text; entry save and the API have to keep
    working with both the old string inputs and the new FK."""

    def _entry(self, official, association):
        return ExternalGameOfficialEntry(
            official_id=official.pk,
            number_games=2,
            date="2024-05-01",
            position="Referee",
            association=association,
            halftime_duration=20,
        )

    def test_entry_save_resolves_association_string(self, associations):
        team = TeamFactory(name="Test Team")
        official = OfficialFactory(first_name="Franzi", last_name="Fedora", team=team)

        self._entry(official, "AFCVTH").save()

        assert OfficialExternalGames.objects.get().association.abbr == "AFCVT"

    def test_entry_save_unknown_association_raises(self, associations):
        team = TeamFactory(name="Test Team")
        official = OfficialFactory(first_name="Franzi", last_name="Fedora", team=team)

        with pytest.raises(UnknownAssociationError):
            self._entry(official, "Fantasie").save()

        assert OfficialExternalGames.objects.count() == 0

    def test_serializer_keeps_abbr_wire_format(self, associations):
        team = TeamFactory(name="Test Team")
        official = OfficialFactory(first_name="Franzi", last_name="Fedora", team=team)
        row = OfficialExternalGamesFactory(
            official=official,
            number_games=2,
            date="2024-05-01",
            notification_date="2024-05-01",
            position="Referee",
            association=Association.objects.get(abbr="OHNE"),
            halftime_duration=20,
            has_clockcontrol=False,
            is_international=False,
            reporter_name="",
            comment="",
        )

        data = OfficialExternalGamesSerializer(instance=row).data

        assert data["association"] == "OHNE"


class TestAssociationResolutionMigration:
    """The data migration must be self-contained: a frozen alias snapshot,
    case-consistent lookups, and one resolution per distinct stored value."""

    def test_frozen_alias_map_matches_the_documented_snapshot(self):
        assert MIGRATION.ASSOCIATION_ALIASES == {
            "AFCVTH": "AFCVT",
            "Spielverbund Nord": "AFCVNORD",
            "Ausland": "OHNE",
            "Scrimmage": "OHNE",
            "Natio": "OHNE",
        }

    def test_frozen_alias_map_is_independent_of_live_mapping(
        self, associations, monkeypatch
    ):
        monkeypatch.setitem(ASSOCIATION_ALIASES, "AFCVTH", "OHNE")

        resolved = MIGRATION._resolve_distinct(["AFCVTH"], Association)

        assert resolved["AFCVTH"] == Association.objects.get(abbr="AFCVT").pk

    def test_migration_resolves_case_insensitive_aliases_and_distinct_values(
        self, associations
    ):
        values = [
            "AFCVTH",
            "afcvth",
            "Spielverbund Nord",
            "spielverbund nord",
            "AFCVNORD",
        ]

        resolved = MIGRATION._resolve_distinct(values, Association)

        assert {
            value: Association.objects.get(pk=pk).abbr for value, pk in resolved.items()
        } == {
            "AFCVTH": "AFCVT",
            "afcvth": "AFCVT",
            "Spielverbund Nord": "AFCVNORD",
            "spielverbund nord": "AFCVNORD",
            "AFCVNORD": "AFCVNORD",
        }

    def test_migration_rejects_unmapped_value(self, associations):
        with pytest.raises(MIGRATION.UnknownAssociationError):
            MIGRATION._resolve_distinct(["Fantasie"], Association)

    def test_forwards_resolves_distinct_values_once_and_bulk_updates(
        self, associations, monkeypatch
    ):
        rows = [
            _MigrationRow(1, "AFCVTH"),
            _MigrationRow(2, "afcvth"),
            _MigrationRow(3, "AFCVTH"),
            _MigrationRow(4, "Spielverbund Nord"),
        ]
        manager = MagicMock()
        manager.values_list.return_value = [
            "AFCVTH",
            "afcvth",
            "Spielverbund Nord",
        ]
        manager.all.return_value.only.return_value.iterator.return_value = iter(rows)
        bulk_updates = []
        manager.bulk_update.side_effect = lambda objs, fields: bulk_updates.append(
            (
                [row.pk for row in objs],
                list(fields),
                [row.association_new_id for row in objs],
            )
        )
        fake_model = MagicMock()
        fake_model.objects = manager
        fake_apps = MagicMock()
        fake_apps.get_model.side_effect = lambda app, model: (
            fake_model if model == "OfficialExternalGames" else Association
        )

        seen = []
        original = MIGRATION._resolve_distinct

        def spy(values, association_model):
            seen.append(set(values))
            return original(values, association_model)

        monkeypatch.setattr(MIGRATION, "_resolve_distinct", spy)

        MIGRATION.forwards(fake_apps, None)

        assert seen == [{"AFCVTH", "afcvth", "Spielverbund Nord"}]
        afcvt_pk = Association.objects.get(abbr="AFCVT").pk
        nord_pk = Association.objects.get(abbr="AFCVNORD").pk
        assert bulk_updates == [
            ([1, 2, 3, 4], ["association_new"], [afcvt_pk, afcvt_pk, afcvt_pk, nord_pk])
        ]
