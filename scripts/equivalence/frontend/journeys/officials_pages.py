"""Officials journey: official role, signup guard and profile licence view."""

from .common import click, role_view, run_steps


def run(context, run_id, credentials):
    view = role_view(context, "official")
    if view is None:
        return {}, ["officials:official-login-unavailable"]
    steps, skipped = {}, []
    actions = [
        ("signup-list", click("a[href*='signup']")),
        ("profile", click("a[href*='profile']")),
    ]
    run_steps(view, "/officials/", steps, skipped, actions=actions)
    return steps, skipped
