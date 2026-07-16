from collections import defaultdict

from gamedays.models import Gameday, Gameinfo


class AutoAssignOfficialsService:
    def __init__(self, gameday_id: int):
        self.gameday_id = gameday_id

    def assign(self) -> dict[int, int]:
        gameday = Gameday.objects.get(pk=self.gameday_id)
        if gameday.status != "DRAFT":
            raise ValueError("Gameday must be in DRAFT status")

        gameinfos = list(
            Gameinfo.objects.filter(gameday_id=self.gameday_id).prefetch_related(
                "gameresult_set"
            )
        )
        if not gameinfos:
            return {}

        all_teams_in_standing: dict[str, set[int]] = defaultdict(set)
        for gi in gameinfos:
            for gr in gi.gameresult_set.all():
                if gr.team_id:
                    all_teams_in_standing[gi.standing].add(gr.team_id)

        time_groups: dict[str, list[Gameinfo]] = defaultdict(list)
        for gi in gameinfos:
            time_groups[gi.scheduled.isoformat()].append(gi)

        referee_count: dict[int, int] = defaultdict(int)
        assignments: dict[int, int] = {}
        assigned_set: set[int] = set()

        scheduled_times = sorted(time_groups.keys())

        for scheduled in scheduled_times:
            games_at_time = time_groups[scheduled]

            busy_teams: set[int] = set()
            for gi in games_at_time:
                for gr in gi.gameresult_set.all():
                    if gr.team_id:
                        busy_teams.add(gr.team_id)

            groups: dict[str, list[Gameinfo]] = defaultdict(list)
            for gi in games_at_time:
                groups[gi.standing].append(gi)

            for standing, gis in groups.items():
                donor_pool: set[int] = set()
                for other_standing, teams in all_teams_in_standing.items():
                    if other_standing != standing:
                        donor_pool |= teams

                if not donor_pool:
                    donor_pool = all_teams_in_standing[standing].copy()

                eligible = [
                    t
                    for t in donor_pool
                    if t not in busy_teams and t not in assigned_set
                ]
                if not eligible:
                    continue

                eligible.sort(key=lambda t: referee_count[t])

                for gi in gis:
                    if not eligible:
                        break
                    eligible.sort(key=lambda t: referee_count[t])
                    chosen = eligible.pop(0)
                    gi.officials_id = chosen
                    gi.save(update_fields=["officials"])
                    referee_count[chosen] += 1
                    assignments[gi.pk] = chosen
                    assigned_set.add(chosen)

        return assignments
