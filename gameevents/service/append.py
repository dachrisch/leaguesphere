"""Append events to the store and project them, all or nothing.

Two callers, one service:

- ``append_legacy`` -- the shadow on ``POST /api/gamelog``. The legacy writer
  already inserted the ``TeamLog`` rows, so ``write_rows=False``: the events
  are recorded and ``GameState`` is moved, but no row is written twice.
- ``append_submission`` -- the canonical endpoint. The rows come from the
  projector, so a canonical game's log is a projection and nothing else.

Both run in one transaction (the caller's, when there is one): sequence
allocation, the submission claim, the events, the rows, the sequence flags and
``GameState`` commit together. A replay of a known ``client_id`` writes
nothing and succeeds.

The canonical path inserts the rows itself, so it hands them to
``GameService.write_projected_gamelog``: ``Gameresult`` is updated by the same
half-score diff the legacy writer uses, never by a second scoring rule.

A correction names its target by ``payload.undo_of`` (the target event's
``seq``); the target must already be stored, so an undo is always a later
submission, and the row group it deletes is the target's submission sequence.

Known limitation of the transition period: events start when this code
deploys. A game mid-gameday already has ``TeamLog`` rows that no event covers,
and ``GameState`` is the replay of the events alone -- it never counts those
pre-existing rows. Reconciling them (backfilling events from rows, or deciding
which side wins) is T6's job; ``rebuild_game_projection``/``check`` must not
pretend otherwise.
"""

import uuid
from dataclasses import dataclass, replace
from typing import Iterable, Optional

from django.db import transaction
from django.db.models import Max
from django.utils import timezone

from gameevents.models import GameEvent, GameState
from gameevents.service.legacy import from_legacy_entries
from gameevents.service.projector import (
    EXCLUDED_EVENTS,
    GameEventValue,
    GameStateValue,
    InvalidEnvelope,
    Projection,
    project_submission,
)
from gameevents.service.replay import Replay, replay_events, resolve_correction
from gamedays.models import Gameresult, Gameinfo, Team, TeamLog
from gamedays.service.game_service import GameService


class SequenceConflict(Exception):
    """The submitted ``seq`` values are not the store's next ones (HTTP 409)."""

    def __init__(self, expected_next: int):
        self.expected_next = expected_next
        super().__init__(f"expected seq {expected_next}")


@dataclass(frozen=True)
class AppendOutcome:
    state: GameStateValue
    applied: bool
    last_seq: int


def normalise_client_id(raw) -> Optional[str]:
    """The submission id, ``None`` when the old app did not send one."""

    if raw in (None, ""):
        return None
    if not isinstance(raw, str):
        raise InvalidEnvelope("client_id must be a string")
    client_id = raw.strip()
    if not client_id:
        return None
    if len(client_id) > 64:
        raise InvalidEnvelope("client_id must be at most 64 characters")
    return client_id


def values_from_rows(rows: Iterable[GameEvent]) -> list[GameEventValue]:
    """Stored rows -> projector values, with ``undo_of`` targets attached."""

    rows = list(rows)
    by_pk = {row.pk: row for row in rows}
    cache: dict[int, GameEventValue] = {}

    def build(row: GameEvent) -> GameEventValue:
        if row.pk in cache:
            return cache[row.pk]
        value = GameEventValue(
            type=row.type,
            code=row.code,
            side=row.side or None,
            player=row.player,
            period=row.period,
            payload=row.payload or {},
            seq=row.seq,
            client_id=row.client_id,
            legacy_sequence=row.legacy_sequence,
        )
        if row.undo_of_id is not None:
            target_row = by_pk.get(row.undo_of_id)
            if target_row is None:
                raise InvalidEnvelope(
                    f"event seq {row.seq} points at a target outside this game"
                )
            value = replace(value, undo_of=build(target_row))
        cache[row.pk] = value
        return value

    return [build(row) for row in rows]


def load_values(game) -> list[GameEventValue]:
    return values_from_rows(GameEvent.objects.filter(game=game).order_by("seq"))


def project_game(game) -> Replay:
    """Replay a game's whole log (the reference projection)."""

    return replay_events(load_values(game))


def side_for_team(game, team) -> str:
    sides = dict(
        Gameresult.objects.filter(gameinfo=game).values_list("isHome", "team_id")
    )
    if team.pk == sides.get(True):
        return "home"
    if team.pk == sides.get(False):
        return "away"
    raise InvalidEnvelope(f"team {team.pk} does not belong to game {game.pk}")


def _attach_undo_targets(assigned, stored_rows, stored_values):
    """Resolve ``payload.undo_of`` against the stored log before projecting."""

    by_seq_row = {row.seq: row for row in stored_rows}
    by_seq_value = {value.seq: value for value in stored_values}
    values = []
    target_ids = []
    for value in assigned:
        if value.type != "correction":
            values.append(value)
            target_ids.append(None)
            continue
        raw = (value.payload or {}).get("undo_of")
        if isinstance(raw, bool) or not isinstance(raw, int):
            raise InvalidEnvelope(
                "a correction needs payload.undo_of = the target event's seq"
            )
        row = by_seq_row.get(raw)
        if row is None:
            raise InvalidEnvelope(
                f"correction target seq {raw} is not a stored event of this game"
            )
        values.append(replace(value, undo_of=by_seq_value[raw]))
        target_ids.append(row.pk)
    return values, target_ids


def _write_rows(game, projection: Projection, author) -> None:
    sides = dict(
        Gameresult.objects.filter(gameinfo=game).values_list("isHome", "team_id")
    )
    side_names = {"home": True, "away": False}
    for row in projection.rows:
        team_id = None
        if row.side is not None:
            team_id = sides.get(side_names[row.side])
            if team_id is None:
                raise InvalidEnvelope(f"game {game.pk} has no {row.side} team")
        values = {
            "gameinfo": game,
            "team_id": team_id,
            "sequence": row.sequence,
            "player": row.player,
            "event": row.event,
            "input": row.input,
            "value": row.value,
            "cop": row.cop,
            "half": row.half,
            "isDeleted": row.isDeleted,
        }
        if author is not None:
            values["author"] = author
        TeamLog.objects.create(**values)


def _apply_sequence_flags(game, projection: Projection) -> None:
    now = timezone.now()
    if projection.deleted_sequences:
        TeamLog.objects.filter(
            gameinfo=game, sequence__in=projection.deleted_sequences
        ).update(isDeleted=True, updated_at=now)
    if projection.restored_sequences:
        TeamLog.objects.filter(
            gameinfo=game, sequence__in=projection.restored_sequences
        ).update(isDeleted=False, updated_at=now)


def _record_rows(game, projection: Projection, author) -> None:
    """Write the projected rows and move ``Gameresult`` like the legacy writer.

    Inserting rows is only half of a legacy write: ``Gameresult`` (the table the
    liveticker's live list, the league table and the finalisation read) must
    follow. Rather than re-deriving points here, the insert and the sequence
    flags run as a ``GameService`` write, so the existing half-score diff --
    including "a manually entered score survives" (#1988) -- is applied
    unchanged. A canonical submission therefore leaves ``Gameresult`` in
    exactly the state ``POST /api/gamelog`` leaves it.
    """

    service = GameService(game.pk)

    def write():
        _write_rows(game, projection, author)
        _apply_sequence_flags(game, projection)
        return service.get_gamelog()

    service.write_projected_gamelog(write)


def _save_state(game, state: GameStateValue) -> None:
    GameState.objects.update_or_create(
        game=game,
        defaults={
            "score_home": state.score_home,
            "score_away": state.score_away,
            "period": state.period,
            "in_possession": state.in_possession or None,
            "last_seq": state.last_seq,
        },
    )


@transaction.atomic
def append_submission(
    game,
    values: Iterable[GameEventValue],
    *,
    client_id: str,
    source: str,
    write_rows: bool,
    author=None,
) -> AppendOutcome:
    """Record one submission and project it; the caller's transaction is reused.

    The game row lock serialises sequence allocation with the legacy writer
    (which locks ``Gameresult`` first and then ``Gameinfo``); the canonical
    path takes the same order by being called inside the gamelog write's
    transaction when it shadows, and by locking only ``Gameinfo`` here.
    """

    Gameinfo.objects.select_for_update().get(pk=game.pk)
    values = list(values)
    if not values:
        raise InvalidEnvelope("a submission needs at least one event")
    if not client_id:
        raise InvalidEnvelope("a submission needs a client_id")

    if GameEvent.objects.filter(game=game, client_id=client_id).exists():
        replayed = project_game(game)
        return AppendOutcome(
            state=replayed.state, applied=False, last_seq=replayed.state.last_seq
        )

    last_seq = (
        GameEvent.objects.filter(game=game).aggregate(Max("seq"))["seq__max"] or 0
    )
    expected_next = last_seq + 1
    provided = [value.seq for value in values]
    if any(seq is not None for seq in provided):
        if any(seq is None for seq in provided):
            raise InvalidEnvelope(
                "either every event of a submission carries seq, or none does"
            )
        if provided != list(range(expected_next, expected_next + len(values))):
            raise SequenceConflict(expected_next)
        assigned = values
    else:
        assigned = [
            replace(value, seq=expected_next + offset)
            for offset, value in enumerate(values)
        ]

    stored_rows = list(GameEvent.objects.filter(game=game).order_by("seq"))
    stored_values = values_from_rows(stored_rows)
    replayed = replay_events(stored_values)
    with_targets, undo_of_ids = _attach_undo_targets(
        assigned, stored_rows, stored_values
    )
    resolved = [
        resolve_correction(
            value,
            rows_by_sequence=replayed.rows_by_sequence,
            seqs_by_client=replayed.seqs_by_client,
        )
        for value in with_targets
    ]
    # Validates every envelope before a single row is stored; a client error
    # raises here and the transaction rolls back with nothing written.
    projection = project_submission(replayed.state, resolved)

    now = timezone.now()
    for value, undo_of_id in zip(resolved, undo_of_ids):
        GameEvent.objects.create(
            game=game,
            seq=value.seq,
            client_id=client_id,
            legacy_sequence=value.legacy_sequence,
            type=value.type,
            code=value.code,
            side=value.side or "",
            player=value.player,
            period=value.period,
            payload=value.payload or {},
            undo_of_id=undo_of_id,
            source=source,
            client_at=now,
        )
    if write_rows:
        _record_rows(game, projection, author)
    else:
        _apply_sequence_flags(game, projection)
    _save_state(game, projection.state)
    return AppendOutcome(
        state=projection.state, applied=True, last_seq=projection.state.last_seq
    )


def append_legacy(
    game,
    *,
    team,
    entries: list,
    half: int,
    client_id: Optional[str] = None,
    source: str = GameEvent.Source.LEGACY,
    write_rows: bool = False,
    author=None,
) -> AppendOutcome:
    """Record one legacy POST's event list (the shadow path).

    Must run after the legacy writer inserted its rows (the endpoint does it in
    the same transaction): the row group the writer just created is read back
    and stored as the submission's ``legacy_sequence``, so a later correction --
    from either path -- deletes exactly that group.
    """

    client_id = normalise_client_id(client_id) or str(uuid.uuid4())
    if not isinstance(team, Team):
        team = GameService._resolve_team(team)
    legacy_sequence = None
    if any(entry.get("name") not in EXCLUDED_EVENTS for entry in entries):
        legacy_sequence = TeamLog.objects.filter(
            gameinfo=game, sequence__gt=0
        ).aggregate(Max("sequence"))["sequence__max"]
    values = from_legacy_entries(
        entries,
        side=side_for_team(game, team),
        half=half,
        client_id=client_id,
        legacy_sequence=legacy_sequence,
    )
    return append_submission(
        game,
        values,
        client_id=client_id,
        source=source,
        write_rows=write_rows,
        author=author,
    )
