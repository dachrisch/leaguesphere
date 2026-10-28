"""Model-level acceptance for the event store (slice 1, T1).

Everything here is DB-backed: the migration must have created the two tables,
both unique constraints must be enforced by the database, and the admin must
be a read-only view of the store.
"""

import pytest
from django.contrib.admin.sites import AdminSite
from django.db import IntegrityError, connection, transaction
from django.utils import timezone

from gameevents.admin import GameEventAdmin
from gameevents.models import GameEvent, GameState
from gamedays.tests.setup_factories.factories import GameinfoFactory


def event_values(game, **overrides):
    values = {
        "game": game,
        "seq": 1,
        "client_id": "client-1",
        "type": GameEvent.Type.SCORE,
        "code": "touchdown",
        "side": GameEvent.Side.HOME,
        "player": 7,
        "period": 1,
        "payload": {},
        "source": GameEvent.Source.V2,
        "client_at": timezone.now(),
    }
    values.update(overrides)
    return values


@pytest.mark.django_db
def test_migration_created_the_event_store_tables():
    tables = connection.introspection.table_names()

    assert "gameevents_gameevent" in tables
    assert "gameevents_gamestate" in tables


@pytest.mark.django_db
def test_duplicate_sequence_for_one_game_is_rejected():
    game = GameinfoFactory()
    GameEvent.objects.create(**event_values(game))

    with pytest.raises(IntegrityError):
        with transaction.atomic():
            GameEvent.objects.create(**event_values(game, client_id="client-2"))


@pytest.mark.django_db
def test_duplicate_client_id_for_one_game_is_rejected():
    game = GameinfoFactory()
    GameEvent.objects.create(**event_values(game))

    with pytest.raises(IntegrityError):
        with transaction.atomic():
            GameEvent.objects.create(**event_values(game, seq=2))


@pytest.mark.django_db
def test_next_client_id_and_next_sequence_are_accepted():
    game = GameinfoFactory()
    GameEvent.objects.create(**event_values(game))
    GameEvent.objects.create(**event_values(game, seq=2, client_id="client-2"))

    assert GameEvent.objects.filter(game=game).count() == 2


@pytest.mark.django_db
def test_game_state_is_a_one_to_one_projection():
    game = GameinfoFactory()
    state = GameState.objects.create(game=game, in_possession="home")

    assert game.game_state == state
    assert state.score_home == 0
    assert state.score_away == 0
    assert state.period == 1
    assert state.last_seq == 0


def test_event_admin_has_no_write_permissions():
    model_admin = GameEventAdmin(GameEvent, AdminSite())

    assert model_admin.has_add_permission(None) is False
    assert model_admin.has_change_permission(None) is False
    assert model_admin.has_delete_permission(None) is False
    assert set(model_admin.readonly_fields) == {
        field.name for field in GameEvent._meta.fields
    }
