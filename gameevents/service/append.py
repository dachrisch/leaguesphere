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
A target whose row lives in the shared sequence 0 (penalties, clocks, timeouts,
markers) is deleted *row* by *row* instead -- its sequence names no single row.
Every event that writes a row stores it (``GameEvent.team_log``), which is both
how the log payload publishes a row's ``seq`` and how that row is found again
when it is corrected.

Known limitation of the transition period: events start when this code
deploys. A game mid-gameday already has ``TeamLog`` rows that no event covers,
and ``GameState`` is the replay of the events alone -- it never counts those
pre-existing rows. Reconciling them (backfilling events from rows, or deciding
which side wins) is T6's job; ``rebuild_game_projection``/``check`` must not
pretend otherwise.

Author
------
Every event records its **actor** -- ``request.user`` on both endpoints -- in
``GameEvent.author``, and the projector copies that id onto every ``TeamLog``
row the event produces, so a play's author is the official who recorded it,
exactly as the legacy writer stores it. ``TeamLog.author`` has a
``default=1``; that is a user id which does not have to exist (it is not a
"system user"), so this module always writes the column explicitly and falls
back to the game's author (the gameday's author) only for events that
genuinely have no actor. If no existing user can be found at all the append
raises :class:`MissingAuthor` (a 400), never a database error. The same rule
is used by ``rebuild_game``; see ``AuthorResolver``.
"""

import uuid
from dataclasses import dataclass, replace
from typing import Iterable, Optional

from django.contrib.auth.models import User
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


class MissingAuthor(InvalidEnvelope):
    """No existing user can be recorded as a projected row's author.

    A subclass of ``InvalidEnvelope`` on purpose: the endpoints already answer
    that with ``400 {"detail": ...}`` and never with a database error, which is
    the whole point -- ``TeamLog.author`` must not be left to its ``default=1``.
    """


class AuthorResolver:
    """Decide which user a projected ``TeamLog`` row is written for.

    The candidates are: the event's actor, the row a rebuild replaces, the
    rebuild's ``--author`` and finally the game's author (its gameday's author).
    ``TeamLog``'s ``default=1`` is never part of it: a user id that does not
    exist is not an author, and the caller gets :class:`MissingAuthor` instead of
    an ``IntegrityError`` on MySQL (or a silently wrong author on a database
    that happens to have a user 1).
    """

    def __init__(self, game):
        self.game = game
        self._known: dict[int, bool] = {}

    def exists(self, author_id: int) -> bool:
        if author_id not in self._known:
            self._known[author_id] = User.objects.filter(pk=author_id).exists()
        return self._known[author_id]

    def game_author_id(self) -> Optional[int]:
        """The author of the game: its gameday's author, if that user exists.

        ``Gameinfo`` has no author of its own; the gameday it belongs to does.
        The column itself defaults to the magic id 1, so "set" is not the same
        as "real" and only an existing user counts.
        """

        author_id = self.game.gameday.author_id
        if author_id and self.exists(author_id):
            return author_id
        return None

    def resolve(self, *candidates: Optional[int]) -> int:
        for author_id in candidates:
            if author_id and self.exists(author_id):
                return author_id
        raise MissingAuthor(
            f"no author for the event (game {self.game.pk}): neither the event "
            "nor the game names an existing user"
        )


def author_id_of(author) -> Optional[int]:
    """The id to store on an event for an append caller's ``author``."""

    if author is None:
        return None
    if isinstance(author, int):
        return author
    return getattr(author, "pk", None)


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
            author_id=row.author_id,
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


def _write_rows(
    game, projection: Projection, authors: "AuthorResolver"
) -> dict[int, int]:
    """Insert the projected rows; return ``{source_seq: TeamLog pk}``.

    ``TeamLog.author`` defaults to the magic id 1, so it is always passed
    explicitly -- from the event's actor, or from the game's author when the
    event has none. :class:`AuthorResolver` turns "no existing user at all"
    into a 400 instead of an ``IntegrityError``.

    The returned map is what links each event to the row it wrote
    (``GameEvent.team_log``): the log payload needs it to publish a row's
    ``seq``, and a sequence-0 correction needs it to mark exactly one row.
    """

    sides = dict(
        Gameresult.objects.filter(gameinfo=game).values_list("isHome", "team_id")
    )
    side_names = {"home": True, "away": False}
    created: dict[int, int] = {}
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
            "author_id": authors.resolve(row.author_id, authors.game_author_id()),
        }
        team_log = TeamLog.objects.create(**values)
        if row.source_seq is not None:
            created[row.source_seq] = team_log.pk
    return created


def _row_flag_events(game, projection: Projection) -> dict:
    """The target events a row-level correction names, keyed by ``seq``."""

    seqs = set(projection.deleted_rows) | set(projection.restored_rows)
    if not seqs:
        return {}
    return {
        event.seq: event
        for event in GameEvent.objects.filter(game=game, seq__in=seqs)
    }


def _link_rows(game, created: dict[int, int]) -> None:
    """Store the row each event wrote (``GameEvent.team_log``)."""

    if not created:
        return
    events = {
        event.seq: event
        for event in GameEvent.objects.filter(game=game, seq__in=created)
    }
    for seq, team_log_id in created.items():
        event = events.get(seq)
        if event is not None:
            event.team_log_id = team_log_id
    if events:
        GameEvent.objects.bulk_update(events.values(), ["team_log"])


def _apply_sequence_flags(game, projection: Projection, events_by_seq) -> None:
    """Mark the affected rows: whole sequence groups, or single rows.

    A group is a submission's row group (sequence > 0). A *row* flag names the
    target event's own row, which is the only way to address the shared
    sequence 0 -- penalties, clocks, timeouts and markers all live there.
    """

    now = timezone.now()
    if projection.deleted_sequences:
        TeamLog.objects.filter(
            gameinfo=game, sequence__in=projection.deleted_sequences
        ).update(isDeleted=True, updated_at=now)
    if projection.restored_sequences:
        TeamLog.objects.filter(
            gameinfo=game, sequence__in=projection.restored_sequences
        ).update(isDeleted=False, updated_at=now)

    def row_ids(seqs):
        ids = []
        for seq in seqs:
            event = events_by_seq.get(seq)
            if event is None or event.team_log_id is None:
                raise InvalidEnvelope(
                    f"correction target seq {seq} has no row to change "
                    "(recorded before rows were linked; rebuild the projection)"
                )
            ids.append(event.team_log_id)
        return ids

    if projection.deleted_rows:
        TeamLog.objects.filter(
            gameinfo=game, pk__in=row_ids(projection.deleted_rows)
        ).update(isDeleted=True, updated_at=now)
    if projection.restored_rows:
        TeamLog.objects.filter(
            gameinfo=game, pk__in=row_ids(projection.restored_rows)
        ).update(isDeleted=False, updated_at=now)


def _record_rows(game, projection: Projection, authors: "AuthorResolver") -> None:
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
        created = _write_rows(game, projection, authors)
        # The rows exist now: link them before anything can address them.
        _link_rows(game, created)
        _apply_sequence_flags(game, projection, _row_flag_events(game, projection))
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

    ``author`` is the event's **actor** -- ``request.user`` on both endpoints --
    and is stored on every event of the submission (``GameEvent.author``) and,
    through the projection, on every ``TeamLog`` row the submission writes. It
    is therefore the one place where "who caused this play" enters the store; a
    caller that passes ``None`` (a system/background write) records events
    without an actor, and the row author then falls back to the game's author
    (see ``AuthorResolver``) or raises :class:`MissingAuthor`.

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
    authors = AuthorResolver(game)
    actor_id = author_id_of(author)
    if actor_id is not None and not authors.exists(actor_id):
        # A caller that hands us a user the database does not have would
        # otherwise fail on the foreign key (a 500) or, worse, be recorded
        # against a different user. Refuse it as a client error instead.
        raise MissingAuthor(
            f"no author for the event (game {game.pk}): user {actor_id} does "
            "not exist"
        )

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
    # The actor travels with the events into the rows they project.
    assigned = [replace(value, author_id=actor_id) for value in assigned]

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
            author_id=value.author_id,
        )
    if write_rows:
        _record_rows(game, projection, authors)
    else:
        _apply_sequence_flags(game, projection, _row_flag_events(game, projection))
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
    rows=None,
) -> AppendOutcome:
    """Record one legacy POST's event list (the shadow path).

    Must run after the legacy writer inserted its rows (the endpoint does it in
    the same transaction): the row group the writer just created is read back
    and stored as the submission's ``legacy_sequence``, so a later correction --
    from either path -- deletes exactly that group.

    ``rows`` are the ``TeamLog`` rows that write created, in entry order (the
    endpoint passes them; the game row is locked for the whole request, so they
    are exactly this submission's rows). They let each event carry its row
    (``team_log``), which is what makes a *sequence-0* row addressable -- a
    penalty, a clock, a timeout or a marker shares sequence 0 with every other
    one, so a sequence cannot name it. Without them the events are recorded
    unlinked, and only group corrections can name them.
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
    outcome = append_submission(
        game,
        values,
        client_id=client_id,
        source=source,
        write_rows=write_rows,
        author=author,
    )
    if rows:
        _link_shadow_rows(game, client_id, rows)
    return outcome


def _link_shadow_rows(game, client_id: str, rows) -> None:
    """Give a shadow submission's events the rows the legacy writer created.

    The writer inserts one row per entry, in order; the events are stored 1:1
    in the same order. A replay of an applied submission writes no rows, so a
    length mismatch means "nothing new to link" and the stored links stay.
    """

    rows = list(rows)
    events = list(
        GameEvent.objects.filter(game=game, client_id=client_id).order_by("seq")
    )
    if len(events) != len(rows):
        return
    for event, row in zip(events, rows):
        event.team_log_id = row.pk
    GameEvent.objects.bulk_update(events, ["team_log"])
