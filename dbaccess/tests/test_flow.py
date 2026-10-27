"""The write side of the flow: submit, and the branches that refuse."""

import pytest
from cryptography.fernet import Fernet
from django.contrib.auth.models import Permission
from django.urls import reverse

from dbaccess.forms import AccessRequestForm
from dbaccess.models import AccessRequest, GrantableTable
from gamedays.tests.setup_factories.factories import UserFactory


@pytest.fixture
def tables(db):
    GrantableTable.objects.create(name="divisions", grantable=True)
    GrantableTable.objects.create(name="team", grantable=True)
    GrantableTable.objects.create(name="auth_user", grantable=False)


@pytest.fixture
def staff(db):
    return UserFactory(username="staff", is_staff=True)


@pytest.mark.django_db
def test_index_redirects_anonymous_to_login(client):
    response = client.get(reverse("dbaccess-index"))

    assert response.status_code == 302
    assert "login" in response["Location"]


@pytest.mark.django_db
def test_index_redirects_staff_to_the_list(client, staff):
    client.force_login(staff)

    response = client.get(reverse("dbaccess-index"))

    assert response.status_code == 302
    assert response["Location"] == reverse("dbaccess-list")


@pytest.mark.django_db
def test_submitting_a_request_records_it_and_the_event(client, staff, tables):
    client.force_login(staff)

    response = client.post(
        reverse("dbaccess-create"),
        {
            # Ignored on purpose: the handle comes from the login, not the form.
            "person": "someone-else",
            "purpose": "fix the standings",
            "ticket_url": "https://example.invalid/T-1",
            "ttl_hours": 2,
            "tables": [t.pk for t in GrantableTable.objects.filter(grantable=True)],
        },
    )

    assert response.status_code == 302
    created = AccessRequest.objects.get()
    assert created.state == AccessRequest.State.REQUESTED
    assert created.requester == staff
    assert created.person == "staff"  # taken from the login, not the post
    assert created.tables_csv == "divisions,team"  # sorted
    assert created.events.filter(action="requested").exists()


@pytest.mark.django_db
def test_the_form_has_no_person_field(staff, tables):
    form = AccessRequestForm()

    assert "person" not in form.fields


@pytest.mark.django_db
def test_the_form_refuses_an_empty_table_list(staff, tables):
    form = AccessRequestForm(
        data={"person": "nn", "purpose": "x", "ttl_hours": 2, "tables": []}
    )

    assert not form.is_valid()
    assert "tables" in form.errors


@pytest.mark.django_db
def test_the_form_prefills_tables_when_editing(staff, tables):
    access_request = AccessRequest.objects.create(
        requester=staff,
        person="nn",
        purpose="x",
        tables_csv="divisions,team",
        ttl_hours=2,
    )

    form = AccessRequestForm(instance=access_request)

    assert set(form.fields["tables"].initial) == {"divisions", "team"}


@pytest.mark.django_db
def test_a_non_approver_only_sees_their_own_requests(client, staff, tables):
    other = UserFactory(username="other", is_staff=True)
    AccessRequest.objects.create(
        requester=other, person="other", purpose="x", tables_csv="divisions", ttl_hours=1
    )
    AccessRequest.objects.create(
        requester=staff, person="mine", purpose="x", tables_csv="divisions", ttl_hours=1
    )
    client.force_login(staff)

    response = client.get(reverse("dbaccess-list"))

    assert [r.person for r in response.context["requests"]] == ["mine"]
    assert response.context["can_approve"] is False


@pytest.mark.django_db
def test_an_approver_sees_the_queue(client, staff, tables):
    approver = UserFactory(username="approver", is_staff=True)
    approver.user_permissions.add(Permission.objects.get(codename="approve_requests"))
    AccessRequest.objects.create(
        requester=staff,
        person="nn",
        purpose="x",
        tables_csv="divisions",
        ttl_hours=1,
        state=AccessRequest.State.REQUESTED,
    )
    client.force_login(approver)

    response = client.get(reverse("dbaccess-list"))

    assert response.context["can_approve"] is True
    assert response.context["pending"].count() == 1


@pytest.mark.django_db
def test_the_list_page_links_the_staff_help_guide(client, staff):
    client.force_login(staff)

    response = client.get(reverse("dbaccess-list"))

    assert reverse("help-topic", args=["dbaccess"]) in response.content.decode()


@pytest.mark.django_db
def test_the_detail_page_offers_reveal_only_while_active(client, staff, settings):
    settings.DBACCESS_SECRET_KEY = Fernet.generate_key().decode()
    access_request = AccessRequest.objects.create(
        requester=staff,
        person="nn",
        purpose="x",
        tables_csv="divisions",
        ttl_hours=1,
        state=AccessRequest.State.REQUESTED,
    )
    client.force_login(staff)

    response = client.get(reverse("dbaccess-detail", args=[access_request.pk]))

    assert response.status_code == 200
    assert response.context["may_reveal"] is True
    assert response.context["can_approve"] is False


@pytest.mark.django_db
def test_an_unrelated_user_cannot_revoke(client, tables):
    owner = UserFactory(username="owner", is_staff=True)
    access_request = AccessRequest.objects.create(
        requester=owner,
        person="nn",
        purpose="x",
        tables_csv="divisions",
        ttl_hours=1,
        state=AccessRequest.State.ACTIVE,
    )
    client.force_login(UserFactory(username="nosy", is_staff=True))

    response = client.post(reverse("dbaccess-revoke", args=[access_request.pk]))

    assert response.status_code == 403
    access_request.refresh_from_db()
    assert access_request.state == AccessRequest.State.ACTIVE


@pytest.mark.django_db
def test_revoking_a_dropped_session_is_a_no_op(client, staff):
    access_request = AccessRequest.objects.create(
        requester=staff,
        person="nn",
        purpose="x",
        tables_csv="divisions",
        ttl_hours=1,
        state=AccessRequest.State.DROPPED,
    )
    client.force_login(staff)

    client.post(reverse("dbaccess-revoke", args=[access_request.pk]))

    access_request.refresh_from_db()
    assert access_request.state == AccessRequest.State.DROPPED


@pytest.mark.django_db
def test_a_decision_on_an_already_decided_request_is_refused(
    client, staff
):
    approver = UserFactory(username="approver", is_staff=True)
    approver.user_permissions.add(Permission.objects.get(codename="approve_requests"))
    access_request = AccessRequest.objects.create(
        requester=staff,
        person="nn",
        purpose="x",
        tables_csv="divisions",
        ttl_hours=1,
        state=AccessRequest.State.ACTIVE,
    )
    client.force_login(approver)

    response = client.post(
        reverse("dbaccess-decide", args=[access_request.pk]), {"decision": "approve"}
    )

    assert response.status_code == 302
    access_request.refresh_from_db()
    assert access_request.state == AccessRequest.State.ACTIVE
