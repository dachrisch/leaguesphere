"""GameSetup journey: open the setup screen and fill a crew slot."""

from .common import click_if_present, discover, run_steps


def run(context, run_id, credentials):
    user, password = credentials.get("staff", ("", ""))
    ids = discover(context, user, password)
    if not ids.get("gameday_id"):
        return {}, ["gamesetup:no-gameday-on-stage"]
    tokens = {ids["gameday_id"]: "<entity-1>", ids["game_id"]: "<entity-2>"}
    steps, skipped = {}, []
    actions = [
        (
            "open-setup",
            lambda page: click_if_present(
                page, 'a:has-text("Aufstellung"), button:has-text("Aufstellung")'
            ),
        ),
        (
            "fill-crew",
            lambda page: click_if_present(
                page, ".crew-slot, [data-testid='crew-slot']"
            ),
        ),
    ]
    run_steps(
        context,
        f"/scorecard/v2/gameday/{ids['gameday_id']}/",
        steps,
        skipped,
        actions=actions,
        tokens=tokens,
    )
    return steps, skipped
