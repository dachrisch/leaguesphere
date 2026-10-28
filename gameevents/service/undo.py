"""Record today's undo as a correction event (transition safety).

``DELETE /api/gamelog/<game>/`` is the only undo the app has: the legacy writer
flips ``TeamLog.isDeleted`` and shifts ``Gameresult``, but knows nothing about
the event log. Left alone, every corrected play would leave ``GameState``
holding a score its rows no longer have -- the drift T6 exists to detect, and a
hard blocker before T5 serves scores from the projection.

The view therefore calls :func:`record_legacy_undo` inside the delete's
transaction (the same transaction that wrote the rows). The affected
``TeamLog.sequence`` is resolved back to the *submission* that produced it --
``GameEvent.legacy_sequence`` for a shadow write, the smallest event ``seq`` for
a canonical one, i.e. exactly the rule ``gameevents.service.replay`` uses -- and
a ``correction`` naming that submission's first event is appended. The append
service then re-projects the log into ``GameState``; the rows need no second
write because the legacy delete already marked them.

Two situations have no event to correct:

- **the sequence is already deleted.** A second undo of the same play is a
  no-op in the row table and must be a no-op here too: no second event, no
  second score change.
- **no stored event produced the sequence** (a row written before the store
  existed, or by a path outside slice 1). The rows stay deleted -- that is what
  the official asked for -- but inventing history would be a lie, so the game's
  ``GameState`` is flagged ``needs_reconciliation`` with a note and T6
  reconciles it. The flag is sticky; only a rebuild clears it.

The v2 app's per-row undo (``team_log_id``) arrives on ``feat/scorecard-v2``;
it is accepted here already. A single row of a multi-row sequence cannot be
expressed by the log (a correction deletes a whole submission's row group), so
that case takes the reconciliation path rather than deleting sibling rows in
the projection.
"""

import logging
import uuid

from gameevents.models import GameEvent, GameState
from gameevents.service.append import append_submission, values_from_rows
from gameevents.service.projector import GameEventValue
from gameevents.service.replay import replay_events
from gamedays.models import TeamLog

logger = logging.getLogger(__name__)


def record_legacy_undo(game, *, sequence=None, team_log_id=None, author=None):
    """Append the correction that represents a legacy ``DELETE``.

    Called after the legacy writer marked the rows deleted, in its transaction.
    Returns the appended ``GameEvent``, or ``None`` when nothing was recorded
    (nothing to undo, an already-undone play, or a log that cannot express it
    -- the last case flags the projection instead).
    """

    if sequence is None and team_log_id is None:
        # Not an undo the endpoint recognises (e.g. a malformed body); the
        # legacy delete touched nothing, so neither does the log.
        return None

    if team_log_id is not None:
        row = _team_log_row(game, team_log_id)
        if row is None:
            return None
        sequence = row.sequence
        if sequence == 0 or _has_live_siblings(game, row):
            # One row out of a group the log cannot name: a correction would
            # delete the whole submission, not this row.
            return _flag_reconciliation(
                game, f"row-level undo of team log {row.pk} (sequence {sequence})"
            )
    elif not TeamLog.objects.filter(gameinfo=game, sequence=sequence).exists():
        # Nothing was deleted (a stale client's sequence): no undo happened.
        return None

    events = list(GameEvent.objects.filter(game=game).order_by("seq"))
    if not events:
        return _flag_reconciliation(
            game,
            f"undo of sequence {sequence} has no stored event (rows predate the log)",
        )

    values = values_from_rows(events)
    replay = replay_events(values)
    if sequence == 0:
        # Every excluded row and every marker shares sequence 0, so no single
        # event produced "the group"; the projection has no way to mark just
        # the rows the writer deleted.
        return _flag_reconciliation(
            game, f"undo of the shared launch/penalty sequence {sequence}"
        )

    target = _submission_of_sequence(values, replay, sequence)
    if target is None:
        return _flag_reconciliation(
            game, f"undo of sequence {sequence} has no stored event"
        )

    rows = replay.rows_by_sequence.get(sequence, ())
    if rows and all(row.isDeleted for row in rows):
        # Already undone: the writer repeats a no-op, and so does the log.
        return None

    value = GameEventValue(
        type=GameEvent.Type.CORRECTION,
        code="undo",
        period=target.period,
        payload={"undo_of": target.seq},
        client_id=str(uuid.uuid4()),
    )
    outcome = append_submission(
        game,
        [value],
        client_id=value.client_id,
        source=GameEvent.Source.LEGACY,
        write_rows=False,
        author=author,
    )
    logger.info(
        "Recorded undo of game %s sequence %s as correction seq %s",
        game.pk,
        sequence,
        outcome.last_seq,
    )
    return GameEvent.objects.get(game=game, client_id=value.client_id)


def _team_log_row(game, team_log_id):
    """The row a v2 undo names, or ``None`` when it does not belong to ``game``."""

    try:
        team_log_id = int(team_log_id)
    except (TypeError, ValueError):
        return None
    return TeamLog.objects.filter(gameinfo=game, pk=team_log_id).first()


def _has_live_siblings(game, row) -> bool:
    """Whether the row's sequence still holds live rows besides ``row``."""

    return (
        TeamLog.objects.filter(gameinfo=game, sequence=row.sequence, isDeleted=False)
        .exclude(pk=row.pk)
        .exists()
    )


def _submission_of_sequence(values, replay, sequence):
    """The first event of the submission whose rows carry ``sequence``.

    ``values`` are in ``seq`` order, so the first hit is the submission's first
    event -- the target a correction needs (the projector resolves it back to
    the whole group).
    """

    for value in values:
        if value.client_id is None:
            continue
        if replay.seqs_by_client.get(value.client_id) == sequence:
            return value
    return None


def _flag_reconciliation(game, note):
    """Admit the projection cannot represent this undo; do not invent history."""

    GameState.objects.update_or_create(
        game=game,
        defaults={
            "needs_reconciliation": True,
            "reconciliation_note": note[:255],
        },
    )
    logger.warning(
        "Game %s needs reconciliation: %s",
        game.pk,
        note,
    )
    return None
