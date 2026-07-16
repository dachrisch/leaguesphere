from django.contrib.auth.models import User
from django.test import TestCase

from gamedays.models import Gameday, Gameinfo, Gameresult, Season, League, Team
from gamedays.service.auto_assign_officials_service import AutoAssignOfficialsService
from gamedays.tests.setup_factories.db_setup import DBSetup


class TestAutoAssignOfficialsService(TestCase):
    """Service-level tests for AutoAssignOfficialsService."""

    def setUp(self):
        self.user = User.objects.create_superuser(
            username="admin", password="password", email="admin@test.com"
        )

    def _get_team_ids_for_game(self, gi: Gameinfo) -> list[int]:
        return [
            gr.team_id
            for gr in Gameresult.objects.filter(gameinfo=gi)
        ]

    def _assert_no_self_referee(self, gameday: Gameday):
        for gi in Gameinfo.objects.filter(gameday=gameday).prefetch_related("gameresult_set"):
            playing_ids = {gr.team_id for gr in gi.gameresult_set.all()}
            assert gi.officials_id not in playing_ids, (
                f"Game {gi.pk}: team {gi.officials_id} is playing and refereeing"
            )

    def _assert_no_time_conflict(self, gameday: Gameday):
        games_at_time: dict[str, list[Gameinfo]] = {}
        for gi in Gameinfo.objects.filter(gameday=gameday).prefetch_related("gameresult_set"):
            key = gi.scheduled.isoformat()
            games_at_time.setdefault(key, []).append(gi)
        for scheduled, gis in games_at_time.items():
            all_busy = set()
            for gi in gis:
                for gr in gi.gameresult_set.all():
                    if gr.team_id:
                        all_busy.add(gr.team_id)
            for gi in gis:
                if gi.officials_id in all_busy:
                    playing_for = [
                        gr.team_id for gr in gi.gameresult_set.all()
                    ]
                    if gi.officials_id in playing_for:
                        continue
                    self.fail(
                        f"Game {gi.pk} at {scheduled}: team {gi.officials_id} "
                        f"is refereeing but is playing in another game at same time"
                    )

    def _assert_balanced_referee_counts(self, gameday: Gameday):
        counts: dict[int, int] = {}
        for gi in Gameinfo.objects.filter(gameday=gameday):
            if gi.officials_id:
                counts[gi.officials_id] = counts.get(gi.officials_id, 0) + 1
        if not counts:
            return
        values = list(counts.values())
        assert max(values) - min(values) <= 1, (
            f"Referee counts imbalanced: {counts}"
        )

    def test_cross_group_2x3_balanced(self):
        gameday = DBSetup().g62_status_empty()
        service = AutoAssignOfficialsService(gameday.pk)
        assignments = service.assign()

        assert len(assignments) == Gameinfo.objects.filter(gameday=gameday).count()
        self._assert_no_self_referee(gameday)
        self._assert_no_time_conflict(gameday)
        self._assert_balanced_referee_counts(gameday)

    def test_cross_group_2x4_balanced(self):
        gameday = DBSetup().g72_qualify_finished()
        gameday.status = "DRAFT"
        gameday.save()

        Gameinfo.objects.filter(gameday=gameday).exclude(
            stage__in=("Vorrunde",)
        ).delete()

        service = AutoAssignOfficialsService(gameday.pk)
        assignments = service.assign()

        self._assert_no_self_referee(gameday)
        self._assert_no_time_conflict(gameday)
        self._assert_balanced_referee_counts(gameday)

    def test_time_conflict_avoidance(self):
        gameday = DBSetup().g62_status_empty()
        service = AutoAssignOfficialsService(gameday.pk)
        service.assign()
        self._assert_no_time_conflict(gameday)

    def test_same_group_fallback(self):
        season = Season.objects.create(name="2026")
        league = League.objects.create(name="Test")
        gameday = Gameday.objects.create(
            name="Single Group",
            season=season,
            league=league,
            date="2026-07-16",
            start="10:00",
            author=self.user,
            status="DRAFT",
            format="3_1",
        )
        teams = [
            Team.objects.create(name=f"Team {i}", description=f"T{i}")
            for i in range(3)
        ]
        games_data = [
            ("10:00", teams[0], teams[1]),
            ("11:10", teams[2], teams[0]),
            ("12:20", teams[1], teams[2]),
        ]
        for i, (time, home, away) in enumerate(games_data, 1):
            gi = Gameinfo.objects.create(
                gameday=gameday,
                scheduled=time,
                field=1,
                stage="Vorrunde",
                standing="Gruppe 1",
                status="Geplant",
                officials=home,
            )
            Gameresult.objects.create(gameinfo=gi, team=home, isHome=True)
            Gameresult.objects.create(gameinfo=gi, team=away, isHome=False)

        service = AutoAssignOfficialsService(gameday.pk)
        assignments = service.assign()

        assert len(assignments) == 3
        self._assert_no_self_referee(gameday)
        self._assert_no_time_conflict(gameday)
        self._assert_balanced_referee_counts(gameday)

    def test_non_draft_status_rejected(self):
        gameday = DBSetup().create_empty_gameday()
        gameday.status = "PUBLISHED"
        gameday.save()
        service = AutoAssignOfficialsService(gameday.pk)
        with self.assertRaises(ValueError):
            service.assign()

    def test_empty_gameday_returns_empty(self):
        gameday = DBSetup().create_empty_gameday()
        Gameinfo.objects.filter(gameday=gameday).delete()
        service = AutoAssignOfficialsService(gameday.pk)
        assert service.assign() == {}

    def test_existing_officials_overwritten(self):
        gameday = DBSetup().g62_status_empty()
        wrong_team = Team.objects.create(name="Wrong", description="Wrong")
        Gameinfo.objects.filter(gameday=gameday).update(officials=wrong_team)

        service = AutoAssignOfficialsService(gameday.pk)
        service.assign()

        for gi in Gameinfo.objects.filter(gameday=gameday):
            assert gi.officials_id != wrong_team.pk, (
                f"Game {gi.pk} still has wrong official"
            )

    def test_assignments_are_deterministic(self):
        gameday = DBSetup().g62_status_empty()
        service = AutoAssignOfficialsService(gameday.pk)
        a1 = service.assign()
        a2 = service.assign()

        assert a1 == a2, "Assignments differ between runs"
