"""Admin is the read-mostly back office; these checks pin the read-only promises."""

import pytest
from django.contrib import admin
from django.urls import reverse

from dbaccess.models import AccessEvent, AccessRequest, GrantableTable
from dbaccess.admin import AccessEventAdmin, AccessRequestAdmin
from gamedays.tests.setup_factories.factories import UserFactory


@pytest.mark.django_db
def test_the_models_are_registered():
    assert GrantableTable in admin.site._registry
    assert AccessRequest in admin.site._registry
    assert AccessEvent in admin.site._registry


@pytest.mark.django_db
def test_requests_cannot_be_created_through_the_admin():
    model_admin = AccessRequestAdmin(AccessRequest, admin.site)

    assert model_admin.has_add_permission(request=None) is False


@pytest.mark.django_db
def test_the_audit_trail_is_immutable_in_the_admin():
    model_admin = AccessEventAdmin(AccessEvent, admin.site)

    assert model_admin.has_add_permission(request=None) is False
    assert model_admin.has_change_permission(request=None) is False
    assert model_admin.has_delete_permission(request=None) is False


@pytest.mark.django_db
def test_the_change_page_renders_for_a_superuser(client):
    superuser = UserFactory(username="root", is_staff=True, is_superuser=True)
    access_request = AccessRequest.objects.create(
        requester=superuser,
        person="nn",
        purpose="x",
        tables_csv="divisions",
        ttl_hours=1,
    )
    access_request.log("root", "requested")
    client.force_login(superuser)

    response = client.get(
        reverse("admin:dbaccess_accessrequest_change", args=[access_request.pk])
    )

    assert response.status_code == 200
    assert b"requested" in response.content
