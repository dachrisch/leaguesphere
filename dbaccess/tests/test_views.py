"""The staff surface: who may see, decide, reveal and revoke."""

import pytest
from cryptography.fernet import Fernet
from django.contrib.auth.models import Permission
from django.urls import reverse

from dbaccess.models import AccessRequest, GrantableTable
from gamedays.tests.setup_factories.factories import UserFactory


@pytest.fixture
def approver(db):
    user = UserFactory(username="approver", is_staff=True)
    user.user_permissions.add(Permission.objects.get(codename="approve_requests"))
    return user


@pytest.fixture
def requester(db):
    return UserFactory(username="requester", is_staff=True)


def _request(requester, **kwargs):
    defaults = dict(
        person="rehearsal",
        purpose="fix the standings",
        tables_csv="divisions",
        ttl_hours=2,
        state=AccessRequest.State.REQUESTED,
    )
    defaults.update(kwargs)
    return AccessRequest.objects.create(requester=requester, **defaults)


@pytest.mark.django_db
def test_anonymous_is_sent_to_login(client):
    response = client.get(reverse("dbaccess-list"))

    assert response.status_code == 302
    assert "login" in response["Location"]


@pytest.mark.django_db
def test_non_staff_cannot_open_the_queue(client, django_user_model):
    client.force_login(django_user_model.objects.create_user("visitor", password="x"))

    assert client.get(reverse("dbaccess-list")).status_code == 403


@pytest.mark.django_db
def test_a_requester_without_the_permission_cannot_approve(client, requester):
    access_request = _request(requester)
    client.force_login(UserFactory(username="other", is_staff=True))

    response = client.post(
        reverse("dbaccess-decide", args=[access_request.pk]), {"decision": "approve"}
    )

    assert response.status_code == 403
    access_request.refresh_from_db()
    assert access_request.state == AccessRequest.State.REQUESTED


@pytest.mark.django_db
def test_an_approver_cannot_approve_their_own_request(client, approver):
    access_request = _request(approver)
    client.force_login(approver)

    response = client.post(
        reverse("dbaccess-decide", args=[access_request.pk]), {"decision": "approve"}
    )

    assert response.status_code == 403
    access_request.refresh_from_db()
    assert access_request.state == AccessRequest.State.REQUESTED


@pytest.mark.django_db
def test_a_second_person_can_approve_and_it_is_recorded(client, requester, approver):
    access_request = _request(requester)
    client.force_login(approver)

    response = client.post(
        reverse("dbaccess-decide", args=[access_request.pk]), {"decision": "approve"}
    )

    assert response.status_code == 302
    access_request.refresh_from_db()
    assert access_request.state == AccessRequest.State.APPROVED
    assert access_request.approver == approver
    assert access_request.events.filter(action="approve", actor="approver").exists()


@pytest.mark.django_db
def test_a_denial_keeps_the_request_out_of_the_minting_queue(
    client, requester, approver
):
    access_request = _request(requester)
    client.force_login(approver)

    client.post(
        reverse("dbaccess-decide", args=[access_request.pk]),
        {"decision": "deny", "reason": "not needed"},
    )

    access_request.refresh_from_db()
    assert access_request.state == AccessRequest.State.REJECTED
    assert not AccessRequest.objects.pending().exists()


@pytest.mark.django_db
def test_reveal_is_refused_for_an_unrelated_staff_user(client, requester):
    access_request = _request(requester, state=AccessRequest.State.ACTIVE)
    client.force_login(UserFactory(username="nosy", is_staff=True))

    response = client.post(reverse("dbaccess-reveal", args=[access_request.pk]))

    assert response.status_code == 403


@pytest.mark.django_db
def test_reveal_hands_the_password_over_once_and_logs_it(client, requester, settings):
    settings.DBACCESS_SECRET_KEY = Fernet.generate_key().decode()
    access_request = _request(requester, state=AccessRequest.State.ACTIVE, secret="pw123")
    client.force_login(requester)

    response = client.post(reverse("dbaccess-reveal", args=[access_request.pk]))

    assert response.status_code == 200
    assert b"pw123" in response.content
    access_request.refresh_from_db()
    assert access_request.secret is None
    assert access_request.events.filter(action="revealed").exists()


@pytest.mark.django_db
def test_reveal_is_refused_once_the_session_is_dropped(client, requester, settings):
    settings.DBACCESS_SECRET_KEY = Fernet.generate_key().decode()
    access_request = _request(requester, state=AccessRequest.State.DROPPED, secret="pw")
    client.force_login(requester)

    response = client.post(reverse("dbaccess-reveal", args=[access_request.pk]))

    assert response.status_code == 302
    access_request.refresh_from_db()
    assert access_request.secret == "pw"


@pytest.mark.django_db
def test_revoke_sets_the_state_the_sidecar_acts_on(client, requester):
    access_request = _request(requester, state=AccessRequest.State.ACTIVE)
    client.force_login(requester)

    client.post(reverse("dbaccess-revoke", args=[access_request.pk]))

    access_request.refresh_from_db()
    assert access_request.state == AccessRequest.State.REVOKE_REQUESTED


@pytest.mark.django_db
def test_the_form_only_offers_grantable_tables(client, requester):
    GrantableTable.objects.create(name="divisions", grantable=True)
    GrantableTable.objects.create(name="auth_user", grantable=False)
    client.force_login(requester)

    response = client.get(reverse("dbaccess-create"))

    assert response.status_code == 200
    offered = response.context["form"].fields["tables"].queryset
    assert list(offered.values_list("name", flat=True)) == ["divisions"]
