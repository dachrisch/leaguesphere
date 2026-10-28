"""Replay stored events into state and ``TeamLog`` rows (no database).

``project_submission`` projects one submission at a time; this module chains
submissions, which is what a correction needs: it has to see the rows its
target's submission produced *at the moment it is applied*. Keeping that state
in memory means ``GameState`` can always be checked against (and rebuilt from)
the log alone -- the acceptance for T3 and the basis for T6's ``rebuild``.

Sequences: ``project_submission`` assigns one ``TeamLog.sequence`` per
submission (the smallest event ``seq`` of the group). The rows are indexed by
that number. A submitted-by-the-shadow group instead carries the sequence the
legacy writer allocated (``GameEvent.legacy_sequence``), because the two
schemes disagree on a game that mixes the write paths and a correction must
delete the row group that really exists. A submission whose rows are all
excluded/markers keeps sequence 0, for which ``rows_by_sequence`` therefore
holds every excluded row of the game -- but it is never a correction's target
sequence: a correction names the submission's own sequence only when that
sequence actually produced rows.
"""

from dataclasses import dataclass, replace
from typing import Iterable, Mapping

from gameevents.service.projector import (
    GameEventValue,
    GameStateValue,
    InvalidEnvelope,
    project_submission,
)


@dataclass(frozen=True)
class Replay:
    """The projection of a whole log: state plus the rows it produced."""

    state: GameStateValue
    rows_by_sequence: Mapping[int, tuple]
    seqs_by_client: Mapping[str, int]


def _groups(values):
    """Group consecutive events of one submission (same ``client_id``)."""

    group = []
    key = None
    for value in values:
        ident = (
            value.client_id
            if value.client_id is not None
            else ("event", value.seq)
        )
        if group and ident == key:
            group.append(value)
        else:
            if group:
                yield group
            group = [value]
            key = ident
    if group:
        yield group


def _sequence_of(target: GameEventValue, seqs_by_client: Mapping[str, int]):
    if target.client_id is not None and target.client_id in seqs_by_client:
        return seqs_by_client[target.client_id]
    return target.legacy_sequence


def _resolve_target(
    target: GameEventValue,
    *,
    rows_by_sequence: Mapping[int, tuple],
    seqs_by_client: Mapping[str, int],
    force_live: bool,
) -> GameEventValue:
    sequence = _sequence_of(target, seqs_by_client)
    rows: tuple = ()
    if sequence is not None:
        # Only a sequence that really produced rows can be deleted/restored;
        # a submission of excluded events only has rows in sequence 0, and the
        # projector handles that fallback itself.
        rows = tuple(rows_by_sequence.get(sequence, ()))
    if force_live:
        # We are undoing a correction: the score it removed must come back,
        # whatever the target rows' current isDeleted flag says.
        rows = tuple(replace(row, isDeleted=False) for row in rows)
    target = replace(
        target,
        legacy_sequence=sequence if rows else None,
        undo_rows=rows,
    )
    if target.undo_of is not None:
        target = replace(
            target,
            undo_of=_resolve_target(
                target.undo_of,
                rows_by_sequence=rows_by_sequence,
                seqs_by_client=seqs_by_client,
                force_live=True,
            ),
        )
    return target


def resolve_correction(
    value: GameEventValue,
    *,
    rows_by_sequence: Mapping[int, tuple],
    seqs_by_client: Mapping[str, int],
) -> GameEventValue:
    """Attach the target's sequence and rows to a ``correction`` event."""

    if value.type != "correction":
        return value
    if value.undo_of is None:
        raise InvalidEnvelope("a correction event needs an undo_of target")
    return replace(
        value,
        undo_of=_resolve_target(
            value.undo_of,
            rows_by_sequence=rows_by_sequence,
            seqs_by_client=seqs_by_client,
            force_live=False,
        ),
    )


def replay_events(values: Iterable[GameEventValue]) -> Replay:
    """Project a whole (seq-ordered) log."""

    groups = list(_groups(list(values)))
    seqs_by_client: dict[str, int] = {}
    for group in groups:
        client_id = group[0].client_id
        if client_id is None:
            continue
        # A shadow submission remembers the sequence the legacy writer used;
        # everything else uses the projector's own rule (smallest event seq).
        stored = next(
            (
                value.legacy_sequence
                for value in group
                if value.legacy_sequence is not None
            ),
            None,
        )
        if stored is not None:
            seqs_by_client[client_id] = stored
        else:
            seqs = [value.seq for value in group if value.seq is not None]
            if seqs:
                seqs_by_client[client_id] = min(seqs)

    state = GameStateValue()
    rows: dict[int, list] = {}
    for group in groups:
        resolved = [
            resolve_correction(
                value,
                rows_by_sequence=rows,
                seqs_by_client=seqs_by_client,
            )
            for value in group
        ]
        projection = project_submission(state, resolved)
        sequence = seqs_by_client.get(group[0].client_id)
        if sequence is not None:
            projection = replace(
                projection,
                rows=[
                    replace(row, sequence=sequence) if row.sequence else row
                    for row in projection.rows
                ],
            )
        state = projection.state
        for row in projection.rows:
            rows.setdefault(row.sequence, []).append(row)
        for sequence in projection.deleted_sequences:
            rows[sequence] = [
                replace(row, isDeleted=True) for row in rows.get(sequence, [])
            ]
        for sequence in projection.restored_sequences:
            rows[sequence] = [
                replace(row, isDeleted=False) for row in rows.get(sequence, [])
            ]
    return Replay(
        state=state,
        rows_by_sequence={key: tuple(value) for key, value in rows.items()},
        seqs_by_client=seqs_by_client,
    )
