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

    ``seq`` is the capture client's sequence (``max + 1``); ``(game, seq)`` and
    ``(game, client_id)`` are unique so a retried submission cannot be applied
    twice. ``client_at`` is the device clock and is kept for audit only --
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
                fields=["game", "client_id"], name="uniq_gameevent_client_id_per_game"
            ),
        ]
        indexes = [models.Index(fields=["game", "received_at"])]

    def __str__(self):
        return f"{self.game_id}#{self.seq} {self.type}/{self.code}"


class GameState(models.Model):
    """The current projection of one game's events.

    ``last_seq`` is the feed cursor; the score is what the projected
    ``TeamLog`` rows currently sum to, so the two never disagree.
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
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.game_id} {self.score_home}:{self.score_away} (seq {self.last_seq})"
