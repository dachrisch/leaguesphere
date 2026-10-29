"""The one additive field the legacy log payload gains: an event ``seq``.

The v2 client appends events, and an undo is a ``correction`` naming the target
by ``payload.undo_of`` -- the target event's ``seq``. ``GET /api/gamelog/<id>``
is built from ``TeamLog`` rows, which know their ``sequence`` but not the
event that produced them, so the client could not address a row it sees.

The link is stored, not guessed: an event that writes a row carries it
(``GameEvent.team_log``), so the payload publishes exactly that event's ``seq``
for exactly that row. That is the only way to address the *shared* sequence 0:
every penalty, clock, timeout and marker lives there, and a sequence cannot
name one of them.

Rows without a link (a shadow write from before the link existed) keep the
older, group-level answer:

- a canonical submission's rows carry ``sequence = min(event seq)`` (the
  projector's rule), so its group's ``seq`` *is* the sequence;
- a submission recorded by the shadow carries the ``TeamLog.sequence`` the
  legacy writer allocated (``GameEvent.legacy_sequence``), which diverges from
  its event ``seq`` on a game that mixes both write paths. Any event of the
  group resolves to the same group server-side (``replay._groups`` groups by
  ``client_id``), so the group's smallest ``seq`` is the one to publish.

A row that no event wrote (a game the old app wrote before the store existed)
gets ``None``: there is no event to correct, and inventing one would be a lie.

Both maps are derived from **one** query per call: the snapshot serves a whole
scope and must not pay a query per game, and this is one of the reads the
gamelog endpoint already declares.
"""

from gameevents.models import GameEvent


def _maps(game_ids) -> tuple[dict[int, dict[int, int]], dict[int, dict[int, int]]]:
    """``(row pk -> seq, sequence -> seq)`` per game, from one query."""

    game_ids = list(game_ids)
    if not game_ids:
        return {}, {}

    per_row: dict[int, dict[int, int]] = {}
    groups: dict[tuple[int, str], list[tuple[int, int | None]]] = {}
    for game_id, client_id, seq, legacy_sequence, team_log_id in (
        GameEvent.objects.filter(game_id__in=game_ids).values_list(
            "game_id", "client_id", "seq", "legacy_sequence", "team_log_id"
        )
    ):
        if team_log_id is not None:
            per_row.setdefault(game_id, {})[team_log_id] = seq
        groups.setdefault((game_id, client_id), []).append((seq, legacy_sequence))

    per_sequence: dict[int, dict[int, int]] = {}
    for (game_id, _client_id), events in groups.items():
        first = min(seq for seq, _ in events)
        legacy = next(
            (sequence for _, sequence in events if sequence is not None),
            None,
        )
        sequence = first if legacy is None else legacy
        if not sequence:
            continue
        mapping = per_sequence.setdefault(game_id, {})
        mapping[sequence] = min(first, mapping.get(sequence, first))
    return per_row, per_sequence


def _compose(rows, linked, groups) -> dict[int, int]:
    mapping: dict[int, int] = {}
    for row in rows:
        seq = linked.get(row.pk)
        if seq is None:
            seq = groups.get(row.sequence)
        if seq is not None:
            mapping[row.pk] = seq
    return mapping


def event_seqs_for_rows(rows, game_id) -> dict[int, int]:
    """``TeamLog`` pk -> event ``seq`` for exactly these rows."""

    rows = list(rows)
    per_row, per_sequence = _maps([game_id])
    return _compose(rows, per_row.get(game_id, {}), per_sequence.get(game_id, {}))


def event_seqs_for_rows_by_game(
    rows_by_game, game_ids
) -> dict[int, dict[int, int]]:
    """The same, for many games, in one query (the snapshot)."""

    game_ids = list(game_ids)
    per_row, per_sequence = _maps(game_ids)
    composed: dict[int, dict[int, int]] = {}
    for game_id in game_ids:
        mapping = _compose(
            rows_by_game.get(game_id, ()),
            per_row.get(game_id, {}),
            per_sequence.get(game_id, {}),
        )
        if mapping:
            composed[game_id] = mapping
    return composed
