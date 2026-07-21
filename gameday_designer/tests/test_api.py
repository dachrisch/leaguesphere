"""
Tests for gameday_designer API endpoints.

Following TDD methodology (RED phase) - writing tests BEFORE ViewSet implementation.
Tests define expected API behavior for all endpoints and actions.
"""

import pytest
from django.contrib.auth.models import User
from rest_framework.test import APIClient
from rest_framework import status

from gamedays.models import Association, Gameday, Team, Season, League
from gameday_designer.models import (
    ScheduleTemplate,
    TemplateSlot,
    TemplateUpdateRule,
    TemplateUpdateRuleTeam,
    TemplateApplication,
)


@pytest.mark.django_db
class TestTemplateListEndpoint:
    """Test GET /api/designer/templates/ (list)."""

    def test_anonymous_cannot_list_templates(self, api_client, template, global_template):
        """Anonymous users cannot list templates — IsStaffOrReadOnly requires authentication for reads."""
        response = api_client.get("/api/designer/templates/")

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_list_returns_lightweight_serializer(self, api_client, association_user, template_with_slots):
        """List endpoint uses lightweight serializer (no nested data)."""
        api_client.force_authenticate(user=association_user)
        response = api_client.get("/api/designer/templates/")

        assert response.status_code == status.HTTP_200_OK
        template_data = next(
            (t for t in response.data["results"] if t["id"] == template_with_slots.pk), None
        )

        assert template_data is not None
        assert "name" in template_data
        assert "association_name" in template_data
        assert "slots" not in template_data  # Not in list view
        assert "update_rules" not in template_data  # Not in list view

    def test_staff_sees_all_templates(
        self, api_client, staff_user, template, global_template
    ):
        """Staff users see all templates."""
        api_client.force_authenticate(user=staff_user)
        response = api_client.get("/api/designer/templates/")

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) >= 2

    def test_association_user_cannot_see_other_associations_shared_templates(
        self, api_client, association_user, association, staff_user
    ):
        """A user must not see ASSOCIATION-tier templates belonging to a
        different association than their own team's."""
        from gamedays.models import UserProfile

        own_team = Team.objects.create(
            name="Own Team",
            description="Own team desc",
            location="Hometown",
            association=association,
        )
        UserProfile.objects.create(user=association_user, team=own_team)

        other_association = Association.objects.create(name="Other Association", abbr="OTH")
        other_associations_template = ScheduleTemplate.objects.create(
            name="Other Association Template",
            description="Belongs to a different association",
            num_teams=6,
            num_fields=2,
            num_groups=1,
            game_duration=70,
            sharing=ScheduleTemplate.SHARING_ASSOCIATION,
            association=other_association,
            created_by=staff_user,
            updated_by=staff_user,
        )

        api_client.force_authenticate(user=association_user)
        response = api_client.get("/api/designer/templates/")

        assert response.status_code == status.HTTP_200_OK
        returned_ids = [t["id"] for t in response.data["results"]]
        assert other_associations_template.id not in returned_ids

    def test_filtering_by_association(self, api_client, association_user, template, global_template):
        """Authenticated users can filter templates by association."""
        api_client.force_authenticate(user=association_user)
        response = api_client.get(
            f"/api/designer/templates/?association={template.association.pk}"
        )

        assert response.status_code == status.HTTP_200_OK
        # Should only return templates for that association
        for t in response.data["results"]:
            if t["association"] is not None:
                assert t["association"] == template.association.pk

    def test_list_filters_by_sharing_personal(self, api_client, staff_user, association, db):
        """sharing=personal returns only PRIVATE templates created by the requesting user."""
        other_user = User.objects.create_user(username="other_sharing", password="pw")
        ScheduleTemplate.objects.create(
            name="Mine", num_teams=6, num_fields=2, num_groups=1, game_duration=70,
            sharing=ScheduleTemplate.SHARING_PRIVATE, created_by=staff_user, updated_by=staff_user,
        )
        ScheduleTemplate.objects.create(
            name="Theirs", num_teams=6, num_fields=2, num_groups=1, game_duration=70,
            sharing=ScheduleTemplate.SHARING_PRIVATE, created_by=other_user, updated_by=other_user,
        )
        api_client.force_authenticate(user=staff_user)
        response = api_client.get("/api/designer/templates/?sharing=personal")
        assert response.status_code == 200
        names = [t["name"] for t in response.data["results"]]
        assert "Mine" in names
        assert "Theirs" not in names

    def test_list_filters_by_sharing_global(self, api_client, staff_user, db):
        """sharing=global returns all GLOBAL templates regardless of creator."""
        ScheduleTemplate.objects.create(
            name="Global One", num_teams=6, num_fields=2, num_groups=1, game_duration=70,
            sharing=ScheduleTemplate.SHARING_GLOBAL, created_by=staff_user, updated_by=staff_user,
        )
        api_client.force_authenticate(user=staff_user)
        response = api_client.get("/api/designer/templates/?sharing=global")
        assert response.status_code == 200
        names = [t["name"] for t in response.data["results"]]
        assert "Global One" in names
        # No PRIVATE or ASSOCIATION templates should appear
        for t in response.data["results"]:
            assert t["sharing"] == ScheduleTemplate.SHARING_GLOBAL


@pytest.mark.django_db
class TestTemplateDetailEndpoint:
    """Test GET /api/designer/templates/{id}/ (retrieve)."""

    def test_anonymous_cannot_retrieve_template(self, api_client, template_with_slots):
        """Anonymous users cannot retrieve template details — requires authentication."""
        response = api_client.get(f"/api/designer/templates/{template_with_slots.pk}/")

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_detail_includes_nested_slots(self, api_client, staff_user, template_with_slots, assert_num_queries):
        """Detail endpoint includes nested slots."""
        api_client.force_authenticate(user=staff_user)
        # Warm request-path caches (maintenance-mode SiteConfiguration lookup + connection
        # liveness check) so the query count is not order-dependent under parallel (xdist) runs.
        api_client.get(f"/api/designer/templates/{template_with_slots.pk}/")
        with assert_num_queries(3):
            response = api_client.get(f"/api/designer/templates/{template_with_slots.pk}/")

        assert response.status_code == status.HTTP_200_OK
        assert "slots" in response.data
        assert len(response.data["slots"]) == 2
        assert response.data["slots"][0]["slot_order"] == 1

    def test_detail_includes_nested_update_rules(self, api_client, staff_user, template, db, assert_num_queries):
        """Detail endpoint includes nested update rules."""
        api_client.force_authenticate(user=staff_user)
        slot = TemplateSlot.objects.create(
            template=template,
            field=1,
            slot_order=1,
            stage="Finalrunde",
            standing="Finale",
            home_reference="Gewinner HF1",
            away_reference="Gewinner HF2",
        )

        update_rule = TemplateUpdateRule.objects.create(
            template=template, slot=slot, pre_finished="Halbfinale"
        )

        TemplateUpdateRuleTeam.objects.create(
            update_rule=update_rule, role="home", standing="HF1", place=1
        )

        # Warm request-path caches (maintenance-mode SiteConfiguration lookup + connection
        # liveness check) so the query count is not order-dependent under parallel (xdist) runs.
        api_client.get(f"/api/designer/templates/{template.pk}/")
        with assert_num_queries(4):
            response = api_client.get(f"/api/designer/templates/{template.pk}/")

        assert response.status_code == status.HTTP_200_OK
        assert "update_rules" in response.data
        assert len(response.data["update_rules"]) == 1
        assert response.data["update_rules"][0]["pre_finished"] == "Halbfinale"

    def test_retrieve_nonexistent_template_returns_404(self, api_client, association_user):
        """Retrieving non-existent template returns 404 (when authenticated)."""
        api_client.force_authenticate(user=association_user)
        response = api_client.get("/api/designer/templates/99999/")

        assert response.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.django_db
class TestTemplateCreateEndpoint:
    """Test POST /api/designer/templates/ (create)."""

    def test_anonymous_cannot_create_template(self, api_client, association):
        """Anonymous users cannot create templates."""
        data = {
            "name": "New Template",
            "description": "Should fail",
            "num_teams": 6,
            "num_fields": 2,
            "num_groups": 1,
            "game_duration": 70,
            "association": association.pk,
        }

        response = api_client.post("/api/designer/templates/", data, format="json")

        assert response.status_code in [
            status.HTTP_401_UNAUTHORIZED,
            status.HTTP_403_FORBIDDEN,
        ]

    def test_staff_can_create_template(self, api_client, staff_user, association):
        """Staff users can create templates."""
        api_client.force_authenticate(user=staff_user)

        data = {
            "name": "Staff Template",
            "description": "Created by staff",
            "num_teams": 4,
            "num_fields": 1,
            "num_groups": 1,
            "game_duration": 60,
            "association": association.pk,
        }

        response = api_client.post("/api/designer/templates/", data, format="json")

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["name"] == "Staff Template"
        assert response.data["created_by"] == staff_user.pk
        assert response.data["updated_by"] == staff_user.pk

    def test_staff_can_create_global_template(self, api_client, staff_user):
        """Staff users can create global templates."""
        api_client.force_authenticate(user=staff_user)

        data = {
            "name": "Global Template",
            "description": "For all associations",
            "num_teams": 8,
            "num_fields": 3,
            "num_groups": 2,
            "game_duration": 60,
            "association": None,
        }

        response = api_client.post("/api/designer/templates/", data, format="json")

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["association"] is None
        assert response.data["association_name"] == "Global"

    def test_association_user_can_create_private_template(
        self, api_client, association_user, association
    ):
        """Association users can create PRIVATE templates."""
        api_client.force_authenticate(user=association_user)

        data = {
            "name": "User Template",
            "description": "Created by association user",
            "num_teams": 6,
            "num_fields": 2,
            "num_groups": 1,
            "game_duration": 70,
            "sharing": "PRIVATE",
        }

        response = api_client.post("/api/designer/templates/", data, format="json")

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["sharing"] == "PRIVATE"
        assert response.data["created_by"] == association_user.id

    def test_create_validates_required_fields(self, api_client, staff_user):
        """Creating template validates required fields."""
        api_client.force_authenticate(user=staff_user)

        data = {
            "name": "Incomplete Template",
            # Missing required fields
        }

        response = api_client.post("/api/designer/templates/", data, format="json")

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "num_teams" in response.data or "non_field_errors" in response.data


@pytest.mark.django_db
class TestTemplateUpdateEndpoint:
    """Test PUT/PATCH /api/designer/templates/{id}/ (update)."""

    def test_anonymous_cannot_update_template(self, api_client, template):
        """Anonymous users cannot update templates."""
        data = {
            "name": "Updated Name",
            "description": template.description,
            "num_teams": template.num_teams,
            "num_fields": template.num_fields,
            "num_groups": template.num_groups,
            "game_duration": template.game_duration,
            "association": template.association.pk,
        }

        response = api_client.put(
            f"/api/designer/templates/{template.pk}/", data, format="json"
        )

        assert response.status_code in [
            status.HTTP_401_UNAUTHORIZED,
            status.HTTP_403_FORBIDDEN,
        ]

    def test_staff_can_update_any_template(self, api_client, staff_user, template):
        """Staff users can update any template."""
        api_client.force_authenticate(user=staff_user)

        data = {
            "name": "Updated by Staff",
            "description": template.description,
            "num_teams": template.num_teams,
            "num_fields": template.num_fields,
            "num_groups": template.num_groups,
            "game_duration": template.game_duration,
            "association": template.association.pk,
        }

        response = api_client.put(
            f"/api/designer/templates/{template.pk}/", data, format="json"
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["name"] == "Updated by Staff"
        assert response.data["updated_by"] == staff_user.pk

    def test_partial_update_with_patch(self, api_client, staff_user, template):
        """PATCH allows partial updates."""
        api_client.force_authenticate(user=staff_user)

        data = {"description": "Partially updated description"}

        response = api_client.patch(
            f"/api/designer/templates/{template.pk}/", data, format="json"
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["description"] == "Partially updated description"
        assert response.data["name"] == template.name  # Unchanged

    def test_association_user_cannot_update_association_template(
        self, api_client, association_user, template
    ):
        """Association users cannot update templates — write requires staff."""
        api_client.force_authenticate(user=association_user)

        data = {
            "name": "Updated by User",
            "description": template.description,
            "num_teams": template.num_teams,
            "num_fields": template.num_fields,
            "num_groups": template.num_groups,
            "game_duration": template.game_duration,
            "association": template.association.pk,
        }

        response = api_client.put(
            f"/api/designer/templates/{template.pk}/", data, format="json"
        )

        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_association_user_cannot_update_global_template(
        self, api_client, association_user, global_template
    ):
        """Association users cannot update global templates."""
        api_client.force_authenticate(user=association_user)

        data = {
            "name": "Trying to update",
            "description": global_template.description,
            "num_teams": global_template.num_teams,
            "num_fields": global_template.num_fields,
            "num_groups": global_template.num_groups,
            "game_duration": global_template.game_duration,
            "association": None,
        }

        response = api_client.put(
            f"/api/designer/templates/{global_template.pk}/", data, format="json"
        )

        assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.django_db
class TestTemplateDeleteEndpoint:
    """Test DELETE /api/designer/templates/{id}/ (delete)."""

    def test_anonymous_cannot_delete_template(self, api_client, template):
        """Anonymous users cannot delete templates."""
        response = api_client.delete(f"/api/designer/templates/{template.pk}/")

        assert response.status_code in [
            status.HTTP_401_UNAUTHORIZED,
            status.HTTP_403_FORBIDDEN,
        ]

    def test_staff_can_delete_template(self, api_client, staff_user, template):
        """Staff users can delete templates."""
        api_client.force_authenticate(user=staff_user)

        template_pk = template.pk
        response = api_client.delete(f"/api/designer/templates/{template_pk}/")

        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert not ScheduleTemplate.objects.filter(pk=template_pk).exists()

    def test_association_user_cannot_delete_template(
        self, api_client, association_user, template
    ):
        """Association users cannot delete templates."""
        api_client.force_authenticate(user=association_user)

        response = api_client.delete(f"/api/designer/templates/{template.pk}/")

        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert ScheduleTemplate.objects.filter(pk=template.pk).exists()


@pytest.mark.django_db
class TestTemplateApplyEndpoint:
    """Test POST /api/designer/templates/{id}/apply/ (custom action)."""

    def test_anonymous_cannot_apply_template(
        self, api_client, template_with_slots, gameday, teams
    ):
        """Anonymous users cannot apply templates."""
        data = {
            "gameday_id": gameday.pk,
            "team_mapping": {
                "0_0": teams[0].pk,
                "0_1": teams[1].pk,
                "0_2": teams[2].pk,
                "0_3": teams[3].pk,
                "0_4": teams[4].pk,
                "0_5": teams[5].pk,
            },
        }

        response = api_client.post(
            f"/api/designer/templates/{template_with_slots.pk}/apply/",
            data,
            format="json",
        )

        assert response.status_code in [
            status.HTTP_401_UNAUTHORIZED,
            status.HTTP_403_FORBIDDEN,
        ]

    def test_staff_can_apply_template(
        self, api_client, staff_user, template_with_slots, gameday, teams
    ):
        """Staff users can apply templates."""
        api_client.force_authenticate(user=staff_user)

        data = {
            "gameday_id": gameday.pk,
            "team_mapping": {
                "0_0": teams[0].pk,
                "0_1": teams[1].pk,
                "0_2": teams[2].pk,
                "0_3": teams[3].pk,
                "0_4": teams[4].pk,
                "0_5": teams[5].pk,
            },
        }

        response = api_client.post(
            f"/api/designer/templates/{template_with_slots.pk}/apply/",
            data,
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert "success" in response.data
        assert response.data["success"] is True

    def test_association_user_cannot_apply_template(
        self, api_client, association_user, template_with_slots, gameday, teams
    ):
        """Association users cannot apply templates — apply requires staff."""
        api_client.force_authenticate(user=association_user)

        data = {
            "gameday_id": gameday.pk,
            "team_mapping": {
                "0_0": teams[0].pk,
                "0_1": teams[1].pk,
                "0_2": teams[2].pk,
                "0_3": teams[3].pk,
                "0_4": teams[4].pk,
                "0_5": teams[5].pk,
            },
        }

        response = api_client.post(
            f"/api/designer/templates/{template_with_slots.pk}/apply/",
            data,
            format="json",
        )

        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_apply_validates_gameday_exists(
        self, api_client, staff_user, template_with_slots, teams
    ):
        """Apply endpoint validates gameday exists."""
        api_client.force_authenticate(user=staff_user)

        data = {
            "gameday_id": 99999,  # Non-existent
            "team_mapping": {
                "0_0": teams[0].pk,
                "0_1": teams[1].pk,
                "0_2": teams[2].pk,
                "0_3": teams[3].pk,
                "0_4": teams[4].pk,
                "0_5": teams[5].pk,
            },
        }

        response = api_client.post(
            f"/api/designer/templates/{template_with_slots.pk}/apply/",
            data,
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_apply_creates_audit_record(
        self, api_client, staff_user, template_with_slots, gameday, teams
    ):
        """Applying template creates TemplateApplication audit record."""
        api_client.force_authenticate(user=staff_user)

        data = {
            "gameday_id": gameday.pk,
            "team_mapping": {
                "0_0": teams[0].pk,
                "0_1": teams[1].pk,
                "0_2": teams[2].pk,
                "0_3": teams[3].pk,
                "0_4": teams[4].pk,
                "0_5": teams[5].pk,
            },
        }

        response = api_client.post(
            f"/api/designer/templates/{template_with_slots.pk}/apply/",
            data,
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK

        # Check audit record created
        application = TemplateApplication.objects.filter(
            template=template_with_slots, gameday=gameday
        ).first()

        assert application is not None
        assert application.applied_by == staff_user


@pytest.mark.django_db
class TestTemplateCloneEndpoint:
    """Test POST /api/designer/templates/{id}/clone/ (custom action)."""

    def test_anonymous_cannot_clone_template(self, api_client, template):
        """Anonymous users cannot clone templates."""
        response = api_client.post(
            f"/api/designer/templates/{template.pk}/clone/", format="json"
        )

        assert response.status_code in [
            status.HTTP_401_UNAUTHORIZED,
            status.HTTP_403_FORBIDDEN,
        ]

    def test_staff_can_clone_template(
        self, api_client, staff_user, template_with_slots
    ):
        """Staff users can clone templates."""
        api_client.force_authenticate(user=staff_user)

        original_count = ScheduleTemplate.objects.count()

        response = api_client.post(
            f"/api/designer/templates/{template_with_slots.pk}/clone/", format="json"
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert ScheduleTemplate.objects.count() == original_count + 1
        assert response.data["name"].startswith("Copy of ")

    def test_clone_includes_slots(self, api_client, staff_user, template_with_slots):
        """Cloning template copies slots."""
        api_client.force_authenticate(user=staff_user)

        original_slot_count = template_with_slots.slots.count()

        response = api_client.post(
            f"/api/designer/templates/{template_with_slots.pk}/clone/", format="json"
        )

        assert response.status_code == status.HTTP_201_CREATED

        cloned_template = ScheduleTemplate.objects.get(pk=response.data["id"])
        assert cloned_template.slots.count() == original_slot_count

    def test_association_user_can_clone_template(
        self, api_client, association_user, template
    ):
        """Association users can clone templates — clone creates a new PRIVATE template."""
        api_client.force_authenticate(user=association_user)

        response = api_client.post(
            f"/api/designer/templates/{template.pk}/clone/", format="json"
        )

        assert response.status_code == status.HTTP_201_CREATED

    def test_clone_uses_new_name_from_request(self, api_client, staff_user, template):
        """Clone uses new_name from request body instead of hardcoded prefix."""
        api_client.force_authenticate(user=staff_user)
        response = api_client.post(
            f"/api/designer/templates/{template.pk}/clone/",
            data={"new_name": "My Custom Clone"},
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["name"] == "My Custom Clone"

    def test_clone_always_private_and_no_association(self, api_client, staff_user, template):
        """Clone is always sharing=PRIVATE with association=None regardless of source."""
        api_client.force_authenticate(user=staff_user)
        response = api_client.post(
            f"/api/designer/templates/{template.pk}/clone/",
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED
        cloned = ScheduleTemplate.objects.get(pk=response.data["id"])
        assert cloned.sharing == ScheduleTemplate.SHARING_PRIVATE
        assert cloned.association is None

    def test_clone_sets_created_by_to_requesting_user(self, api_client, staff_user, template):
        """Clone's created_by is always the requesting user."""
        api_client.force_authenticate(user=staff_user)
        response = api_client.post(
            f"/api/designer/templates/{template.pk}/clone/", format="json"
        )
        assert response.status_code == status.HTTP_201_CREATED
        cloned = ScheduleTemplate.objects.get(pk=response.data["id"])
        assert cloned.created_by == staff_user


@pytest.mark.django_db
class TestTemplateValidateEndpoint:
    """Test GET /api/designer/templates/{id}/validate/ (custom action)."""

    def test_authenticated_user_can_validate_template(self, api_client, association_user, template_with_slots):
        """Any authenticated user can validate templates."""
        api_client.force_authenticate(user=association_user)
        response = api_client.get(
            f"/api/designer/templates/{template_with_slots.pk}/validate/"
        )

        assert response.status_code == status.HTTP_200_OK
        assert "is_valid" in response.data
        assert "errors" in response.data
        assert "warnings" in response.data

    def test_validate_returns_validation_result(self, api_client, association_user, template_with_slots):
        """Validate endpoint returns validation result from service."""
        api_client.force_authenticate(user=association_user)
        response = api_client.get(
            f"/api/designer/templates/{template_with_slots.pk}/validate/"
        )

        assert response.status_code == status.HTTP_200_OK
        assert isinstance(response.data["is_valid"], bool)
        assert isinstance(response.data["errors"], list)
        assert isinstance(response.data["warnings"], list)


@pytest.mark.django_db
class TestTemplatePreviewEndpoint:
    """Test GET /api/designer/templates/{id}/preview/ (custom action)."""

    def test_authenticated_user_can_preview_template(self, api_client, association_user, template_with_slots):
        """Any authenticated user can preview template schedule."""
        api_client.force_authenticate(user=association_user)
        response = api_client.get(
            f"/api/designer/templates/{template_with_slots.pk}/preview/"
        )

        assert response.status_code == status.HTTP_200_OK
        assert "slots" in response.data
        assert len(response.data["slots"]) == 2

    def test_preview_includes_slot_details(self, api_client, association_user, template_with_slots):
        """Preview includes detailed slot information."""
        api_client.force_authenticate(user=association_user)
        response = api_client.get(
            f"/api/designer/templates/{template_with_slots.pk}/preview/"
        )

        assert response.status_code == status.HTTP_200_OK

        first_slot = response.data["slots"][0]
        assert "field" in first_slot
        assert "slot_order" in first_slot
        assert "stage" in first_slot
        assert "standing" in first_slot


@pytest.mark.django_db
class TestTemplateUsageEndpoint:
    """Test GET /api/designer/templates/{id}/usage/ (custom action)."""

    def test_authenticated_user_can_view_usage_statistics(self, api_client, association_user, template):
        """Any authenticated user can view template usage statistics."""
        api_client.force_authenticate(user=association_user)
        response = api_client.get(f"/api/designer/templates/{template.pk}/usage/")

        assert response.status_code == status.HTTP_200_OK
        assert "applications_count" in response.data
        assert "recent_applications" in response.data

    def test_usage_shows_application_count(
        self, api_client, association_user, template, gameday, staff_user
    ):
        """Usage endpoint shows number of applications."""
        api_client.force_authenticate(user=association_user)
        # Create some applications
        TemplateApplication.objects.create(
            template=template, gameday=gameday, applied_by=staff_user, team_mapping={}
        )

        response = api_client.get(f"/api/designer/templates/{template.pk}/usage/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["applications_count"] >= 1


@pytest.mark.django_db
class TestTemplateWriteGating:
    URL = "/api/designer/templates/"

    PAYLOAD = {
        "name": "Gated Template",
        "description": "x",
        "num_teams": 6,
        "num_fields": 2,
        "num_groups": 1,
        "game_duration": 70,
    }

    def test_non_staff_can_list(self, api_client, association_user):
        api_client.force_authenticate(user=association_user)
        assert api_client.get(self.URL).status_code == 200

    def test_non_staff_can_create_private(self, api_client, association_user):
        api_client.force_authenticate(user=association_user)
        payload = {**self.PAYLOAD, "sharing": "PRIVATE"}
        assert api_client.post(self.URL, payload, format="json").status_code == 201

    def test_non_staff_cannot_create_global(self, api_client, association_user):
        api_client.force_authenticate(user=association_user)
        payload = {**self.PAYLOAD, "sharing": "GLOBAL"}
        assert api_client.post(self.URL, payload, format="json").status_code == 400

    def test_staff_can_create(self, api_client, staff_user):
        api_client.force_authenticate(user=staff_user)
        assert api_client.post(self.URL, self.PAYLOAD, format="json").status_code == 201
