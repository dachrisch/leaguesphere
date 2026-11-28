"""Tracking journey: real play/undo, PAT, halftime and the panel states."""

from . import fixture
from .common import click, id_tokens, optional, press, role_view, run_steps

# Every write below is a required click: a missing control raises, run_steps
# records the step as skipped and the runner fails, so a "0 diffs" report can
# no longer come from two sides that both wrote nothing.
_sheet_save = click(".sheet .sheetfoot button.startbtn")


def run(context, run_id, credentials):
    """Drive every Tracking slice on dedicated run-id-tagged games."""
    view = role_view(context, "staff")
    if view is None:
        return {}, ["tracking:staff-login-unavailable"]
    steps, skipped = {}, []
    games = []
    try:
        live = fixture.create(view, f"fe-track-{run_id}", started=True)
        games.append(live)
        tokens = id_tokens(
            {live["gameday_id"]: "<entity-1>", live["game_id"]: "<entity-2>"}, run_id
        )
        path = f"/scorecard/v2/gameday/{live['gameday_id']}/game/{live['game_id']}/"
        actions = [
            ("log-filter", optional('button:has-text("Nur Punkte")')),
            ("series-sheet", optional(".action.spielzug")),
            ("series-close", press("Escape")),
            # A real write: the touchdown sheet's save posts the event and
            # opens the extra-point sheet, which the next step writes too.
            ("play-td", click(".tdbtn")),
            ("play-save", _sheet_save),
            ("pat-save", click('.patbar button.choice:has-text("+1")')),
            # +1 opens the PAT detail sheet; it must be saved before the
            # log's undo control is rendered.
            ("pat-confirm", click('.sheet button:has-text("Speichern")')),
            ("play-undo", press("Control+z")),
            # Undo removes the last entry (the PAT) and reopens its choice
            # bar. Answer and save it again so the halftime control is enabled.
            (
                "pat-reanswer",
                click('.patbar button.choice:has-text("+1")'),
            ),
            ("pat-reconfirm", click('.sheet button:has-text("Speichern")')),
            ("halftime-open", click(".halfbtn")),
            ("halftime-write", _sheet_save),
            ("series-tile", optional('.action:has-text("1st Down")')),
            ("panels", optional('button:has-text("Feldposition")')),
        ]
        run_steps(view, path, steps, skipped, actions=actions, tokens=tokens)

        # The finished panel is a different state of the same component.
        done = fixture.create(view, f"fe-done-{run_id}", started=True, finished=True)
        games.append(done)
        done_tokens = id_tokens(
            {done["gameday_id"]: "<entity-1>", done["game_id"]: "<entity-2>"}, run_id
        )
        run_steps(
            view,
            f"/scorecard/v2/gameday/{done['gameday_id']}/game/{done['game_id']}/",
            steps,
            skipped,
            prefix="finished-",
            tokens=done_tokens,
        )

        # A stored device lock reaches the stranded/read-only branch.
        locked = fixture.create(view, f"fe-locked-{run_id}", started=True, locked=True)
        games.append(locked)
        locked_tokens = id_tokens(
            {locked["gameday_id"]: "<entity-1>", locked["game_id"]: "<entity-2>"},
            run_id,
        )
        run_steps(
            view,
            f"/scorecard/v2/gameday/{locked['gameday_id']}/game/{locked['game_id']}/",
            steps,
            skipped,
            prefix="stranded-",
            tokens=locked_tokens,
        )
    finally:
        for game in games:
            fixture.cleanup(view, game)
    return steps, skipped
