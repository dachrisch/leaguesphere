"""Append-only event store for captured game events (slice 1).

The log is the input; ``TeamLog`` and ``GameState`` are projections of it. An
event is never updated or deleted -- a correction is another event pointing at
its target via ``undo_of`` -- so nothing here exposes a write path beyond
``objects.create()``. The admin is read-only for the same reason.

``gamedays`` stays untouched: this app only references ``Gameinfo``. Which app
owns a game is derived from the presence of events until
``Gameinfo.event_source`` lands in a later slice.
"""

from django.db import models


class GameEvent(models.Model):
    """One captured event, ordered per game by ``seq``.

    ``client_id`` identifies the **submission** (the scorecard outbox id): all
    events of one POST share it, so it deliberately is not unique per game on
    its own. ``(game, client_id, seq)`` is unique, which lets a submission's N
    rows coexist while a replay of any event collides. To detect whether a
    submission was already applied, the append service looks up
    ``GameEvent.objects.filter(game=..., client_id=...)`` -- one unit, several
    rows. ``client_at`` is the device clock and is kept for audit only --
    ordering is always ``seq``.
    """

    class Type(models.TextChoices):
        SCORE = "score", "Score"
        PENALTY = "penalty", "Penalty"
        POSSESSION = "possession", "Possession"
        SERIES = "series", "Series"
        PERIOD = "period", "Period"
        TIMEOUT = "timeout", "Timeout"
        TIME = "time", "Time"
        CORRECTION = "correction", "Correction"

    class Side(models.TextChoices):
        HOME = "home", "Home"
        AWAY = "away", "Away"
        BLANK = "", "Blank"

    class Source(models.TextChoices):
        V2 = "v2", "Scorecard v2"
        LEGACY = "legacy", "Legacy scorecard"
        STAFF = "staff", "Staff"

    game = models.ForeignKey(
        "gamedays.Gameinfo",
        on_delete=models.CASCADE,
        related_name="events",
    )
    seq = models.PositiveIntegerField()
    client_id = models.CharField(max_length=64)
    # The **actor**: the authenticated user whose request recorded this event
    # (``request.user`` on both write paths). It is not a display author and is
    # never shown; it exists so the projected ``TeamLog`` rows can carry the
    # same author the legacy writer would have stored, and so an audit can say
    # who caused an event. ``null`` means system-generated -- a rebuild, a
    # management command or an event stored before the column existed -- and
    # the projection then uses the game's author (see
    # ``gameevents/service/append.py``); nothing ever falls back to a magic id.
    author = models.ForeignKey(
        "auth.User",
        null=True,
        blank=True,
        # The log outlives its users: an append-only record must not be deleted
        # (or blocked) because the user who caused it was removed.
        on_delete=models.SET_NULL,
        related_name="game_events",
    )
    # The ``TeamLog.sequence`` the legacy writer used for this submission, if
    # this event was recorded by the shadow. The projector normally derives a
    # submission's sequence from its smallest event ``seq``; the legacy writer
    # instead allocates ``max(sequence)+1``, so on a game that mixes both
    # write paths the two numbers diverge and a correction would delete the
    # wrong row group. Persisting it keeps the projection exact. ``None`` means
    # "this submission has its own projector sequence"; excluded-only
    # submissions (penalties, clocks, timeouts, markers) have ``None`` too --
    # their rows live in sequence 0, which the projector handles itself.
    legacy_sequence = models.PositiveIntegerField(null=True, blank=True)
    type = models.CharField(max_length=32, choices=Type.choices)
    code = models.CharField(max_length=64)
    side = models.CharField(
        max_length=8, choices=Side.choices, blank=True, default=Side.BLANK
    )
    player = models.PositiveSmallIntegerField(null=True, blank=True)
    period = models.PositiveSmallIntegerField(default=1)
    payload = models.JSONField(default=dict)
    # PROTECT keeps the target of a correction alive: the log is the record,
    # so the row a correction compensates must never disappear.
    undo_of = models.ForeignKey(
        "self",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="compensations",
    )
    source = models.CharField(max_length=16, choices=Source.choices)
    client_at = models.DateTimeField()
    received_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["game", "seq"]
        constraints = [
            models.UniqueConstraint(
                fields=["game", "seq"], name="uniq_gameevent_seq_per_game"
            ),
            models.UniqueConstraint(
                fields=["game", "client_id", "seq"],
                name="uniq_gameevent_client_id_seq_per_game",
            ),
        ]
        indexes = [models.Index(fields=["game", "received_at"])]

    def __str__(self):
        return f"{self.game_id}#{self.seq} {self.type}/{self.code}"


class GameState(models.Model):
    """The current projection of one game's events.

    ``last_seq`` is the feed cursor; the score is what the projected
    ``TeamLog`` rows currently sum to, so the two never disagree -- unless
    ``needs_reconciliation`` says otherwise.

    ``needs_reconciliation`` is the honest escape hatch for a legacy undo the
    log cannot express: ``DELETE /api/gamelog/<id>`` can delete a row that no
    stored event produced (written before the store existed, or by a path
    outside slice 1). The rows stay deleted (``gamedays.service`` owns them),
    but no event is invented; instead the projection admits it is out of date.
    A flagged state is **not authoritative**: the feed/liveticker migration
    (T4/T5) must not serve it as the game's state, and only a rebuild
    (``rebuild_game_projection``, T6) clears the flag. ``reconciliation_note``
    says what could not be represented.
    """

    game = models.OneToOneField(
        "gamedays.Gameinfo",
        on_delete=models.CASCADE,
        related_name="game_state",
    )
    score_home = models.IntegerField(default=0)
    score_away = models.IntegerField(default=0)
    period = models.PositiveSmallIntegerField(default=1)
    in_possession = models.CharField(max_length=8, null=True, blank=True)
    last_seq = models.PositiveIntegerField(default=0)
    needs_reconciliation = models.BooleanField(default=False)
    reconciliation_note = models.CharField(max_length=255, blank=True, default="")
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        flag = " [needs reconciliation]" if self.needs_reconciliation else ""
        return (
            f"{self.game_id} {self.score_home}:{self.score_away} "
            f"(seq {self.last_seq}){flag}"
        )
