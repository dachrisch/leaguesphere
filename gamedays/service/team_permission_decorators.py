from functools import wraps

from django.views import View

from gamedays.service.team_permission import PermissionHelper


def get_user_request_permission(view_func):
    @wraps(view_func)
    def _wrapped_view(request: View, *args, **kwargs):
        user_permission = PermissionHelper.get_user_request_permission(
            request.request, kwargs.get("pk")
        )
        kwargs["user_permission"] = user_permission
        return view_func(request, *args, **kwargs)

    return _wrapped_view
