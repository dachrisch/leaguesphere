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
        requester=other,
        person="other",
        purpose="x",
        tables_csv="divisions",
        ttl_hours=1,
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


def _post_request(client, tables, **extra):
    data = {
        "purpose": "fix the standings",
        "ticket_url": "",
        "ttl_hours": 2,
        "tables": [t.pk for t in tables],
    }
    data.update(extra)
    return client.post(reverse("dbaccess-create"), data)


@pytest.fixture
def grantable(tables):
    return list(GrantableTable.objects.filter(grantable=True))


@pytest.mark.django_db
def test_a_request_defaults_to_read_and_update_only(client, staff, grantable):
    """The two new checkboxes are off unless somebody ticks them."""
    client.force_login(staff)

    response = _post_request(client, grantable)

    assert response.status_code == 302
    created = AccessRequest.objects.get()
    assert created.may_insert is False
    assert created.may_delete is False
    event = created.events.get(action="requested")
    assert "privileges: read+update" in event.detail


@pytest.mark.django_db
def test_a_request_can_ask_for_insert(client, staff, grantable):
    client.force_login(staff)

    _post_request(client, grantable, may_insert="on")

    created = AccessRequest.objects.get()
    assert created.may_insert is True
    assert created.may_delete is False
    assert (
        "privileges: read+update+insert"
        in created.events.get(action="requested").detail
    )


@pytest.mark.django_db
def test_a_request_can_ask_for_delete(client, staff, grantable):
    client.force_login(staff)

    _post_request(client, grantable, may_delete="on")

    created = AccessRequest.objects.get()
    assert created.may_insert is False
    assert created.may_delete is True
    assert (
        "privileges: read+update+delete"
        in created.events.get(action="requested").detail
    )


@pytest.mark.django_db
def test_a_request_can_ask_for_both_and_the_event_records_both(
    client, staff, grantable
):
    client.force_login(staff)

    _post_request(client, grantable, may_insert="on", may_delete="on")

    created = AccessRequest.objects.get()
    assert created.may_insert is True
    assert created.may_delete is True
    assert (
        "privileges: read+update+insert+delete"
        in created.events.get(action="requested").detail
    )


@pytest.mark.django_db
def test_the_form_explains_what_insert_and_delete_mean(staff, tables):
    form = AccessRequestForm()

    insert_help = form.fields["may_insert"].help_text
    delete_help = form.fields["may_delete"].help_text

    assert form.fields["may_insert"].required is False
    assert form.fields["may_delete"].required is False
    assert "Neue Zeilen" in insert_help
    assert "nicht in der Sicherungskopie" in insert_help
    assert "löschen" in delete_help
    assert "nur über die Sicherungskopie wiederherstellbar" in delete_help


@pytest.mark.django_db
def test_the_detail_page_shows_the_privileges_and_marks_delete_irreversible(
    client, staff, grantable, django_assert_num_queries
):
    access_request = AccessRequest.objects.create(
        requester=staff,
        person="staff",
        purpose="x",
        tables_csv="divisions",
        ttl_hours=2,
        may_insert=True,
        may_delete=True,
        state=AccessRequest.State.REQUESTED,
    )
    client.force_login(staff)

    url = reverse("dbaccess-detail", args=[access_request.pk])
    client.get(url)  # warm the permission/content-type caches
    with django_assert_num_queries(9):
        html = client.get(url).content.decode()

    assert "Read + UPDATE" in html
    assert "+ INSERT" in html
    assert "+ DELETE" in html
    assert "irreversible" in html
    assert "backup copy" in html


@pytest.mark.django_db
def test_the_queue_shows_what_each_pending_request_would_get(
    client, staff, grantable, django_assert_num_queries
):
    approver = UserFactory(username="approver", is_staff=True)
    approver.user_permissions.add(Permission.objects.get(codename="approve_requests"))
    AccessRequest.objects.create(
        requester=staff,
        person="staff",
        purpose="x",
        tables_csv="divisions",
        ttl_hours=2,
        may_insert=True,
        may_delete=True,
        state=AccessRequest.State.REQUESTED,
    )
    client.force_login(approver)

    client.get(reverse("dbaccess-list"))  # warm the permission/content-type caches
    with django_assert_num_queries(8):
        html = client.get(reverse("dbaccess-list")).content.decode()

    assert "Read + UPDATE" in html
    assert "+ INSERT" in html
    assert "+ DELETE" in html


@pytest.mark.django_db
def test_the_decision_card_repeats_the_privilege_set_to_the_approver(
    client, staff, grantable
):
    approver = UserFactory(username="approver", is_staff=True)
    approver.user_permissions.add(Permission.objects.get(codename="approve_requests"))
    access_request = AccessRequest.objects.create(
        requester=staff,
        person="staff",
        purpose="x",
        tables_csv="divisions",
        ttl_hours=2,
        may_delete=True,
        state=AccessRequest.State.REQUESTED,
    )
    client.force_login(approver)

    html = client.get(
        reverse("dbaccess-detail", args=[access_request.pk])
    ).content.decode()

    assert "You are approving" in html
    assert "Read + UPDATE" in html
    assert "+ DELETE" in html


@pytest.mark.django_db
def test_a_never_grantable_table_cannot_be_requested_even_with_delete(
    client, staff, tables
):
    """The write checkboxes must not reopen `auth_user` by the back door."""
    from dbaccess.management.commands.dbaccess_sync_tables import NEVER_GRANTABLE

    assert "auth_user" in NEVER_GRANTABLE  # the fixture cannot drift from policy
    blocked = GrantableTable.objects.get(name="auth_user")
    client.force_login(staff)

    response = _post_request(
        client,
        [blocked],
        purpose="x",
        may_insert="on",
        may_delete="on",
    )

    assert response.status_code == 200  # the form is redisplayed, not saved
    assert not AccessRequest.objects.exists()


@pytest.mark.django_db
def test_a_decision_on_an_already_decided_request_is_refused(client, staff):
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
