import logging
import random
import time

from django.db import IntegrityError, OperationalError, transaction

from gamedays.models import Team, TeamLog, GameLogSubmission
from gamedays.service.gamelog import GameLog, GameLogCreator
from gamedays.service.wrapper.gameinfo_wrapper import GameinfoWrapper
from gamedays.service.wrapper.gameresult_wrapper import GameresultWrapper

logger = logging.getLogger(__name__)

# MySQL error codes for retryable lock contention under concurrent writes:
# 1213 deadlocks, 1205 lock-wait timeout. MySQL itself advises
# "try restarting transaction" -- concurrent scorecard writes to the same
# game must do exactly that instead of surfacing a 500 (#2006).
_RETRYABLE_MYSQL_CODES = frozenset({1213, 1205})
# SQLite (dev/demo/tests) has no row locks: a second writer gets a database
# lock error instead of waiting. That is the same "try again" situation.
_RETRYABLE_SQLITE_MESSAGES = ("database is locked", "database table is locked")
_WRITE_MAX_ATTEMPTS = 3


def _is_retryable_lock_error(error: Exception) -> bool:
    """True for MySQL deadlock / lock-wait-timeout OperationalErrors.

    SQLite's database-lock errors count too: without row locks the competing
    transaction has to be retried like a deadlock victim.
    """
    args = getattr(error, "args", ())
    if args and args[0] in _RETRYABLE_MYSQL_CODES:
        return True
    message = str(error).lower()
    if "deadlock found" in message or "lock wait timeout exceeded" in message:
        return True
    return any(retryable in message for retryable in _RETRYABLE_SQLITE_MESSAGES)


class GameService(object):
    def __init__(self, game_id):
        self.game_id = game_id
        self.gameinfo: GameinfoWrapper = GameinfoWrapper.from_id(game_id)
        self.gameresult: GameresultWrapper = GameresultWrapper(self.gameinfo.gameinfo)

    def update_halftime(self, user):
        self.gameinfo.set_halftime_to_now()
        self._create_log_entry("2. Halbzeit gestartet", user)

    def update_gamestart(self, user):
        self.gameinfo.set_gamestarted_to_now()
        self._create_log_entry("Spiel gestartet", user)

    def update_game_finished(self, user):
        self.gameinfo.set_game_finished_to_now()
        self._create_log_entry("Spiel beendet", user)

    def get_gamelog(self):
        return GameLog(self.gameinfo.gameinfo)

    def create_gamelog(self, team_name, event, user, half):
        gamelog, _ = self.create_gamelog_once(team_name, event, user, half)
        return gamelog

    def create_gamelog_once(self, team_name, event, user, half, client_id=None):
        """Write ``event`` at most once per ``client_id`` (offline retries).

        Returns ``(gamelog, applied)``. ``applied`` is ``False`` for a repeated
        submission: the current log is answered and nothing is written.

        The ``GameLogSubmission`` row is claimed in the very transaction that
        writes the rows. A write that raises therefore leaves no claim behind,
        so the retry can still apply it; a crash between the two is impossible.

        The claim itself is a plain ``create()`` inside a savepoint, not
        ``get_or_create()``: under concurrent identical retries both requests
        can pass the existence check, and the loser then gets an
        ``IntegrityError`` from the unique constraint instead of a row. The
        savepoint keeps the outer transaction usable after that error, so the
        loser simply answers with the now-current log -- exactly one write,
        two 200/201s. ``get_or_create()`` would let that IntegrityError escape
        as a 500.
        """
        team = self._resolve_team(team_name)  # ToDo extract to TeamWrapper
        write = GameLogCreator(self.gameinfo.gameinfo, team, event, user, half).create
        if client_id is None:
            # The old app sends no client id: every post creates rows.
            return self._write_gamelog(write), True

        state = {"applied": True}

        def claim():
            try:
                # Savepoint: a duplicate key must not poison the enclosing
                # transaction, which still has to read the current log.
                with transaction.atomic():
                    GameLogSubmission.objects.create(
                        gameinfo=self.gameinfo.gameinfo, client_id=client_id
                    )
            except IntegrityError:
                # Somebody else already claimed this submission (and, because
                # the claim shares its transaction, also committed its rows).
                state["applied"] = False
                return self.get_gamelog()
            return None

        gamelog = self._write_gamelog(write, claim)
        return gamelog, state["applied"]

    @staticmethod
    def _resolve_team(team_identifier) -> Team:
        # The scorecard posts the team id (pk) so the write path is unambiguous.
        # Fall back to name/description so a stale/cached client mid-deploy that still
        # posts a team name (or the description that used to leak via "?start=") keeps
        # working instead of 404ing.
        if str(team_identifier).isdigit():
            team = Team.objects.filter(pk=team_identifier).first()
            if team is not None:
                return team
        team = Team.objects.filter(name=team_identifier).first()
        if team is None:
            team = Team.objects.filter(description=team_identifier).first()
        if team is None:
            raise Team.DoesNotExist(
                f"Team matching query does not exist: {team_identifier!r}"
            )
        return team

    def update_score(self, gamelog: GameLog):
        """Overwrite the stored half scores with the gamelog totals.

        Full recompute: scores entered without gamelog entries are lost. The
        scorecard write path does not use this, see ``_write_gamelog``.
        """
        self.gameresult.save_home_first_half(
            gamelog.get_home_firsthalf_score(), gamelog.get_away_firsthalf_score()
        )
        self.gameresult.save_away_first_half(
            gamelog.get_away_firsthalf_score(), gamelog.get_home_firsthalf_score()
        )
        self.gameresult.save_home_second_half(
            gamelog.get_home_secondhalf_score(), gamelog.get_away_secondhalf_score()
        )
        self.gameresult.save_away_second_half(
            gamelog.get_away_secondhalf_score(), gamelog.get_home_secondhalf_score()
        )

    def delete_gamelog(self, sequence):
        return self._write_gamelog(lambda: self._mark_entries_as_deleted(sequence))

    def delete_gamelog_entry(self, team_log_id):
        return self._write_gamelog(lambda: self._mark_entry_as_deleted(team_log_id))

    def _mark_entries_as_deleted(self, sequence) -> GameLog:
        gamelog = self.get_gamelog()
        gamelog.mark_entries_as_deleted(sequence)
        return gamelog

    def _mark_entry_as_deleted(self, team_log_id) -> GameLog:
        gamelog = self.get_gamelog()
        gamelog.mark_entry_as_deleted(team_log_id)
        return gamelog

    def _write_gamelog(self, write, claim=None) -> GameLog:
        """Run a gamelog ``write`` and shift the stored scores by its effect.

        Only the change the write makes to the gamelog half scores is applied,
        so a score entered without gamelog entries (designer results editor)
        survives scorecard writes (#1988). Snapshot, write and score update run
        in one transaction holding the game's result rows locked, so concurrent
        writes to the same game apply their changes one after the other.

        ``claim`` is called inside that transaction before the write. It
        returns ``None`` to let the write run, or an already current ``GameLog``
        when the submission was applied before — in that case nothing is
        written and that log is returned. Running it inside the transaction is
        what keeps a claim and its rows together on a failed write.

        Concurrent writers contend on the Gameresult + Gameinfo row locks and
        the TeamLog inserts, so InnoDB deadlocks (1213) / lock-wait timeouts
        (1205) are expected under load. SQLite (dev/demo/tests, no row locks)
        reports a database lock instead. Retry the whole transaction a few
        times with backoff instead of failing the request (#2006).
        """
        last_error = None
        for attempt in range(_WRITE_MAX_ATTEMPTS):
            try:
                with transaction.atomic():
                    self.gameresult.lock()
                    if claim is not None:
                        existing = claim()
                        if existing is not None:
                            return existing
                    before = self._half_scores(self.get_gamelog())
                    gamelog = write()
                    after = self._half_scores(gamelog)
                    self.gameresult.apply_score_change(
                        {key: after[key] - before[key] for key in after}
                    )
                return gamelog
            except OperationalError as error:
                last_error = error
                if (
                    not _is_retryable_lock_error(error)
                    or attempt + 1 >= _WRITE_MAX_ATTEMPTS
                ):
                    raise
                logger.warning(
                    "Retrying gamelog write for game %s after lock contention "
                    "(attempt %d/%d): %s",
                    self.game_id,
                    attempt + 1,
                    _WRITE_MAX_ATTEMPTS,
                    error,
                )
                time.sleep(0.05 * (2**attempt) + random.uniform(0, 0.05))
        raise last_error  # pragma: no cover - loop always returns or raises

    @staticmethod
    def _half_scores(gamelog: GameLog) -> dict:
        return {
            (True, "fh"): gamelog.get_home_firsthalf_score(),
            (True, "sh"): gamelog.get_home_secondhalf_score(),
            (False, "fh"): gamelog.get_away_firsthalf_score(),
            (False, "sh"): gamelog.get_away_secondhalf_score(),
        }

    def _create_log_entry(self, event_text, user):
        TeamLog.objects.get_or_create(
            gameinfo_id=self.game_id, event=event_text, half=0, sequence=0, author=user
        )

    def update_team_in_possesion(self, team_name):
        self.gameinfo.update_team_in_possession(team_name)
