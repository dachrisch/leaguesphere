"""Officials journey: official role, signup guard and profile licence view."""

from .common import click_if_present, run_steps


def run(context, run_id, credentials):
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
    run_steps(context, "/officials/", steps, skipped, actions=actions)
    return steps, skipped
