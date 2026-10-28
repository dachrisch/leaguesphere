"""The initial copy of the defaults is a command, not hand-typed admin rows."""

import pytest
from django.core.management import call_command
from django.core.management.base import CommandError

from gamedays.tests.setup_factories.factories import LeagueFactory
from officials.models import CrewPosition
from officials.service.crew_positions import DEFAULT_CREW_POSITIONS


@pytest.mark.django_db
def test_it_copies_the_defaults_into_the_league():
    league = LeagueFactory(name="Liga A")

    call_command("seed_crew_positions", league.slug)

    assert list(
        CrewPosition.objects.filter(league=league).values(
            "position", "label", "order", "required"
        )
    ) == DEFAULT_CREW_POSITIONS


@pytest.mark.django_db
def test_it_accepts_the_league_id_too():
    league = LeagueFactory(name="Liga A")

    call_command("seed_crew_positions", str(league.pk))

    assert CrewPosition.objects.filter(league=league).count() == len(
        DEFAULT_CREW_POSITIONS
    )


@pytest.mark.django_db
def test_it_leaves_an_already_configured_league_alone():
    league = LeagueFactory(name="Liga A")
    CrewPosition.objects.create(
        league=league, position="Referee", label="Head Referee", order=9
    )

    call_command("seed_crew_positions", league.slug)

    # The existing row is not overwritten, the missing ones are added.
    assert CrewPosition.objects.get(league=league, position="Referee").label == (
        "Head Referee"
    )
    assert CrewPosition.objects.filter(league=league).count() == len(
        DEFAULT_CREW_POSITIONS
    )


@pytest.mark.django_db
def test_it_is_idempotent():
    league = LeagueFactory(name="Liga A")
    call_command("seed_crew_positions", league.slug)
    call_command("seed_crew_positions", league.slug)

    assert CrewPosition.objects.filter(league=league).count() == len(
        DEFAULT_CREW_POSITIONS
    )


@pytest.mark.django_db
def test_all_seeds_every_league():
    first = LeagueFactory(name="Liga A")
    second = LeagueFactory(name="Liga B")

    call_command("seed_crew_positions", all=True)

    assert CrewPosition.objects.filter(league=first).count() == len(
        DEFAULT_CREW_POSITIONS
    )
    assert CrewPosition.objects.filter(league=second).count() == len(
        DEFAULT_CREW_POSITIONS
    )


@pytest.mark.django_db
def test_an_unknown_league_is_reported_not_silently_ignored():
    with pytest.raises(CommandError) as error:
        call_command("seed_crew_positions", "gibt-es-nicht")

    assert "gibt-es-nicht" in str(error.value)
    assert CrewPosition.objects.count() == 0
