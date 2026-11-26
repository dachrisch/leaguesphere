"""Officials journey: official role, signup guard and profile licence view."""

from .common import click_if_present, role_view, run_steps


def run(context, run_id, credentials):
    view = role_view(context, "official")
    if view is None:
        return {}, ["officials:official-login-unavailable"]
    steps, skipped = {}, []
    actions = [
        (
            "signup-list",
            lambda page: click_if_present(page, "a[href*='signup']"),
        ),
        (
            "profile",
            lambda page: click_if_present(page, "a[href*='profile']"),
        ),
    ]
    run_steps(view, "/officials/", steps, skipped, actions=actions)
    return steps, skipped
