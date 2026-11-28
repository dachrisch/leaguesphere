from unittest.mock import patch

from django.http import HttpRequest

from gamedays.service.team_permission_decorators import get_user_request_permission


class TestGetUserRequestPermission:

    @patch(
        "gamedays.service.team_permission.PermissionHelper.get_user_request_permission"
    )
    def test_user_request_permission(self, get_permission_mock):
        def dummy_view(request, *args, **kwargs):
            return kwargs["user_permission"]

        get_permission_mock.return_value = "some_permission"

        decorated_view = get_user_request_permission(dummy_view)

        request = HttpRequest()
        request.user = "some_user"
        request.request = request

        user_permission = decorated_view(request, pk=1)

        assert user_permission == "some_permission"

        get_permission_mock.assert_called_once_with(request, 1)
