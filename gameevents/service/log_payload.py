"""The one additive field the legacy log payload gains: an event ``seq``.

The v2 client appends events, and an undo is a ``correction`` naming the target
by ``payload.undo_of`` -- the target event's ``seq``. ``GET /api/gamelog/<id>``
is built from ``TeamLog`` rows, which know their ``sequence`` but not the
event that produced them, so the client could not address a row it sees.

This module bridges the two: one ``TeamLog.sequence`` -> the event ``seq`` a
correction may name. The mapping is derived from the log itself, not guessed:

- a canonical submission's rows carry ``sequence = min(event seq)`` (the
  projector's rule), so its group's ``seq`` *is* the sequence;
- a submission recorded by the shadow carries the ``TeamLog.sequence`` the
  legacy writer allocated (``GameEvent.legacy_sequence``), which diverges from
  its event ``seq`` on a game that mixes both write paths. Any event of the
  group resolves to the same group server-side (``replay._groups`` groups by
  ``client_id``), so the group's smallest ``seq`` is the one to publish.

Sequence ``0`` is deliberately absent: penalties, clocks, timeouts, first downs
and the period markers of *every* submission share it, so it names no single
group. A correction cannot address one of those rows; the client keeps undoing
them by ``team_log_id`` (the pre-slice-2 path), because deleting sequence 0
would wipe all of them.
"""

from gameevents.models import GameEvent


def event_seqs_by_sequence(game_id) -> dict[int, int]:
    """``TeamLog.sequence`` -> the event ``seq`` a correction names.

    Only groups that really produced rows are listed; an empty mapping means
    "this game has no events", i.e. a purely legacy log whose rows cannot be
    corrected by ``seq``.
    """

    return event_seqs_by_game([game_id]).get(game_id, {})


def event_seqs_by_game(game_ids) -> dict[int, dict[int, int]]:
    """The same mapping for many games, in **one** query.

    The snapshot endpoint serves a whole scope and must not pay a query per
    game (that is the N+1 it exists to replace), so it asks once for every
    game in the payload.
    """

    game_ids = list(game_ids)
    if not game_ids:
        return {}

    groups: dict[tuple[int, str], list[tuple[int, int | None]]] = {}
    rows = GameEvent.objects.filter(game_id__in=game_ids).values_list(
        "game_id", "client_id", "seq", "legacy_sequence"
    )
    for game_id, client_id, seq, legacy_sequence in rows:
        groups.setdefault((game_id, client_id), []).append((seq, legacy_sequence))

    mappings: dict[int, dict[int, int]] = {}
    for (game_id, _client_id), events in groups.items():
        first = min(seq for seq, _ in events)
        legacy = next(
            (sequence for _, sequence in events if sequence is not None),
            None,
        )
        sequence = first if legacy is None else legacy
        if not sequence:
            continue
        mapping = mappings.setdefault(game_id, {})
        mapping[sequence] = min(first, mapping.get(sequence, first))
    return mappings
