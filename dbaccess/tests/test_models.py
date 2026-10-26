"""Model rules: the fence, the cap, and the credential handover."""

import datetime as dt

import pytest
from cryptography.fernet import Fernet
from django.core.exceptions import ImproperlyConfigured
from django.db import IntegrityError, transaction

from dbaccess.models import AccessRequest, TTL_CAP_HOURS
from gamedays.tests.setup_factories.factories import UserFactory


def _request(**kwargs):
    requester = kwargs.pop("requester", None) or UserFactory(
        username=kwargs.pop("requester_name", "requester")
    )
    defaults = dict(
        person="rehearsal",
        purpose="rehearsal",
        tables_csv="divisions",
        ttl_hours=4,
        state=AccessRequest.State.REQUESTED,
    )
    defaults.update(kwargs)
    return AccessRequest.objects.create(requester=requester, **defaults)


@pytest.mark.django_db
def test_requester_cannot_be_their_own_approver():
    """The two-person rule is a constraint, not a view check."""
    user = UserFactory(username="solo")

    with pytest.raises(IntegrityError), transaction.atomic():
        _request(requester=user, approver=user)


@pytest.mark.django_db
def test_ttl_above_the_cap_is_rejected_by_the_database():
    with pytest.raises(IntegrityError), transaction.atomic():
        _request(ttl_hours=TTL_CAP_HOURS + 1)


@pytest.mark.django_db
def test_expiry_is_created_at_plus_ttl():
    """The value is for display; the reaper recomputes it from created_at."""
    access_request = _request(ttl_hours=2)

    assert access_request.expires_at == access_request.created_at + dt.timedelta(hours=2)


@pytest.mark.django_db
def test_tables_are_parsed_from_the_csv_column():
    access_request = _request(tables_csv="divisions, team ,gameday")

    assert access_request.tables() == ["divisions", "team", "gameday"]


@pytest.mark.django_db
def test_reveal_moves_the_password_out_of_the_plaintext_column(settings):
    settings.DBACCESS_SECRET_KEY = Fernet.generate_key().decode()
    access_request = _request(secret="Sup3rSecret")

    assert access_request.reveal() == "Sup3rSecret"

    access_request.refresh_from_db()
    assert access_request.secret is None
    assert access_request.secret_ct  # ciphertext remains, readable only with the key
    # A second reveal still works: the session page may be reloaded, and forcing
    # a brand-new request because a browser restarted would be worse.
    assert access_request.reveal() == "Sup3rSecret"


@pytest.mark.django_db
def test_reveal_without_a_configured_key_fails_loudly(settings):
    settings.DBACCESS_SECRET_KEY = None
    access_request = _request(secret="Sup3rSecret")

    with pytest.raises(ImproperlyConfigured):
        access_request.reveal()


@pytest.mark.django_db
def test_is_live_is_false_for_a_dropped_session():
    access_request = _request(state=AccessRequest.State.DROPPED)

    assert access_request.is_live is False


@pytest.mark.django_db
def test_log_appends_an_event():
    access_request = _request()

    access_request.log("someone", "requested", detail="tables: divisions")

    assert list(access_request.events.values_list("action", flat=True)) == ["requested"]
