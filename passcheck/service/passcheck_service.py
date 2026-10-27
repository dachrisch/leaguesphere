import datetime
import uuid

from django.conf import settings
from django.db import transaction
from django.db.models import Count, Q, Value, OuterRef, Exists, Subquery, IntegerField

from gamedays.api.serializers import GamedayInfoSerializer
from gamedays.models import Team, Gameinfo, Gameresult, Gameday
from gamedays.service.model_helper import GameresultHelper
from league_manager.utils.view_utils import UserRequestPermission
from passcheck.api.serializers import (
    PasscheckGamesListSerializer,
    RosterSerializer,
    RosterValidationSerializer,
    PlayerAllGamedaysSerializer,
)
from passcheck.models import (
    Playerlist,
    PlayerlistGameday,
    TeamRelationship,
    PasscheckVerification,
    EmptyPasscheckVerification,
    EligibilityRule,
)
from passcheck.service.eligibility_validation import EligibilityValidator


class PasscheckException(Exception):
    pass


class RosterValidationError(Exception):
    """A submitted roster violates the season rules; ``errors`` is field-keyed."""

    def __init__(self, errors: dict):
        self.errors = errors
        super().__init__("invalid roster")


class DeviceConflictError(Exception):
    """A different v2 device already owns this team's gameday check."""

    def __init__(self, device_id: str = ""):
        self.device_id = device_id
        super().__init__("device conflict")


class PasscheckService:
    def __init__(self, user_permission=UserRequestPermission()):
        self.user_permission = user_permission

    def get_officiating_games(
        self, officials_team: Team, gameday, all_games_wanted=False
    ):
        if officials_team is None and self.user_permission.is_staff:
            gameinfo = Gameinfo.objects.filter(gameday__in=gameday).order_by(
                "scheduled"
            )
        elif all_games_wanted:
            gameinfo = Gameinfo.objects.filter(gameday__in=gameday).order_by(
                "scheduled"
            )
            if not gameinfo.filter(officials=officials_team).exists():
                raise PasscheckException(
                    "Passcheck nicht erlaubt, da ihr als Team nicht am Spieltag spielt!"
                )
        else:
            gameinfo = Gameinfo.objects.filter(
                officials_id=officials_team, gameday__in=gameday
            ).order_by("scheduled")
            if not gameinfo.exists():
                raise PasscheckException(
                    "Ihr spielt heute nicht, deswegen gibt es keine Spiele für den Passcheck."
                )
            gameinfo = gameinfo.filter(scheduled__lte=gameinfo.first().scheduled)
        gameinfo = gameinfo.annotate(
            home_id=GameresultHelper.get_gameresult_team_subquery(
                is_home=True, team_column="id"
            ),
            home=GameresultHelper.get_gameresult_team_subquery(
                is_home=True, team_column="description"
            ),
            away_id=GameresultHelper.get_gameresult_team_subquery(
                is_home=False, team_column="id"
            ),
            away=GameresultHelper.get_gameresult_team_subquery(
                is_home=False, team_column="description"
            ),
        )
        gameinfo = gameinfo.annotate(
            is_checked_home=Exists(
                PasscheckVerification.objects.filter(
                    team=OuterRef("home_id"), gameday=OuterRef("gameday_id")
                )
            ),
            is_checked_away=Exists(
                PasscheckVerification.objects.filter(
                    team=OuterRef("away_id"), gameday=OuterRef("gameday_id")
                )
            ),
        )
        return PasscheckGamesListSerializer(
            gameinfo.values(*PasscheckGamesListSerializer.ALL_FIELD_VALUES), many=True
        ).data

    def get_passcheck_games(self, team_id, gameday_id=None):
        team = self._get_team(team_id)
        date = datetime.datetime.today()
        if settings.DEBUG:
            date = settings.DEBUG_DATE
        today_gamedays = Gameday.objects.filter(date=date)
        all_games_wanted = False
        if gameday_id is None:
            gameday = today_gamedays
        else:
            gameday = Gameday.objects.filter(id=gameday_id)
            all_games_wanted = True

        return {
            "officialsTeamName": team.description if team else team_id,
            "games": self.get_officiating_games(
                officials_team=team, gameday=gameday, all_games_wanted=all_games_wanted
            ),
            "gamedays": GamedayInfoSerializer(
                instance=today_gamedays.values("id", "name", "league__name"), many=True
            ).data,
        }

    def _get_team(self, team_id) -> Team:
        try:
            if type(team_id) is str:
                team = Team.objects.get(name=team_id)
            else:
                team = Team.objects.get(pk=team_id)
            return team
        except Team.DoesNotExist:
            return None

    def get_roster(self, team_id: int, year: int, gameday_id: int = None):
        team = self._get_team(team_id)
        if team is None:
            raise ValueError(f"Team {team_id} not found")
        years = (
            Playerlist.objects.filter(team=team)
            .exclude(gamedays__league__name=None)
            .values_list("gamedays__date__year", flat=True)
            .distinct()
        )
        all_leagues = (
            Playerlist.objects.filter(team=team, joined_on__year__lte=year)
            .filter(Q(left_on__isnull=True) | Q(left_on__year__gte=year))
            .filter(gamedays__date__year=year)
            .exclude(gamedays__league__name=None)
            .distinct()
            .values("gamedays__league", "gamedays__league__name")
        )
        league_annotations = {
            f'{league["gamedays__league"]}': Count(
                "gamedays__league",
                filter=(
                    Q(gamedays__league=league["gamedays__league"])
                    & Q(gamedays__date__year=year)
                ),
            )
            for league in all_leagues
        }
        roster = self._get_roster(team, gameday_id, league_annotations, year).values(
            *RosterSerializer.ALL_FIELD_VALUES, *list(league_annotations.keys())
        )
        team_data = TeamData(
            name=team.description,
            roster=RosterSerializer(
                instance=roster,
                is_staff=(self.user_permission.is_user_or_staff()),
                context={"all_leagues": list(all_leagues)},
                many=True,
            ).data,
            validator="",
        )
        return {
            "is_user_or_staff": self.user_permission.is_user_or_staff(),
            "all_leagues": list(all_leagues),
            "team": team_data,
            "team_id": team_id,
            "related_teams": list(
                team.relationship_additional_teams.all().values(
                    "team__description", "team__id"
                )
            ),
            "years": sorted(years, reverse=True),
        }

    def get_roster_with_validation(self, team_id: int, gameday_id: int):
        gameday: Gameday = Gameday.objects.get(pk=gameday_id)
        if not self.user_permission.is_staff:
            today = datetime.date.today()
            if settings.DEBUG:
                today = settings.DEBUG_DATE
            if today != gameday.date:
                raise PasscheckException(
                    f"Passcheck nicht erlaubt für Spieltag: {gameday_id}. Nur heutige Spieltage sind erlaubt."
                )
        roster = (
            self._get_roster(team_id, gameday_id, {})
            .filter(Q(joined_on__lte=gameday.date))
            .filter(Q(left_on__isnull=True) | Q(left_on__gt=gameday.date))
            .values(*RosterSerializer.ALL_FIELD_VALUES)
        )
        try:
            team = {
                "team": TeamData(
                    name=self._get_team(team_id).description,
                    roster=RosterSerializer(
                        instance=roster,
                        is_staff=self.user_permission.is_user_or_staff(),
                        many=True,
                    ).data,
                    validator=EligibilityValidator(
                        gameday.league, gameday
                    ).get_player_strength(),
                )
            }
        except EligibilityRule.DoesNotExist:
            raise LookupError(
                f'No EligibilityRule "{gameday.league}" for gameday "{gameday.name}" found'
            )
        try:
            passcheck_verification = PasscheckVerification.objects.get(
                team=team_id, gameday=gameday_id
            )
        except PasscheckVerification.DoesNotExist:
            passcheck_verification = EmptyPasscheckVerification()
        team["official_name"] = passcheck_verification.official_name
        team["note"] = passcheck_verification.note
        relationship = self._get_team_relationship(team_id)
        additional_teams_serialized = []
        for additional_team_link in relationship:
            try:
                additional_relation = additional_team_link.relationship_team
                if additional_relation.league == gameday.league:
                    continue
                gameday_league_annotation = {
                    f"{gameday.league_id}": Count(
                        "gamedays__league",
                        filter=(
                            Q(gamedays__league=gameday.league)
                            & Q(gamedays__date__year=gameday.date.year)
                            & ~Q(gamedays__id=gameday_id)
                        ),
                    )
                }
                roster_addiational_team = self._get_roster(
                    additional_relation.team.pk, gameday_id, gameday_league_annotation
                ).values(
                    *RosterSerializer.ALL_FIELD_VALUES,
                    *list(gameday_league_annotation.keys()),
                )
                if not roster_addiational_team.exists():
                    continue
                ev = EligibilityValidator(additional_relation.league, gameday)
                team_data = TeamData(
                    name=additional_relation.team.description,
                    roster=RosterValidationSerializer(
                        instance=roster_addiational_team,
                        is_staff=self.user_permission.is_user_or_staff(),
                        context={
                            "validator": ev,
                            "all_leagues": [{"gamedays__league": gameday.league_id}],
                        },
                        many=True,
                    ).data,
                    validator=ev.get_max_subs(),
                )
            except Team.relationship_team.RelatedObjectDoesNotExist:
                team_data = TeamData(
                    f"{additional_team_link.description} -> fehlt als Relationship Team",
                    [],
                    {},
                )
            except EligibilityRule.DoesNotExist:
                team_data = TeamData(
                    f"{additional_team_link.description} -> darf nicht in der Liga spielen",
                    [],
                    {},
                )
            additional_teams_serialized.append(team_data)
        team["additionalTeams"] = additional_teams_serialized
        return team

    def _get_team_relationship(self, team_id):
        try:
            relationship = TeamRelationship.objects.get(team=team_id)
            relationship = relationship.additional_teams.all()
        except TeamRelationship.DoesNotExist:
            relationship = []
        return relationship

    def _get_roster(self, team, gameday_id, league_annotations, year: int = None):
        if year is None:
            year = datetime.date.today().year
        is_selected_query = self._is_selected_query(gameday_id)
        gameday_jersey = self._get_gameday_jersey_query(gameday_id)

        return (
            Playerlist.objects.filter(team=team, joined_on__year__lte=year)
            .filter(Q(left_on__isnull=True) | Q(left_on__year__gte=year))
            .annotate(
                **league_annotations,
                is_selected=is_selected_query,
                gameday_jersey=gameday_jersey,
            )
        )

    def _is_selected_query(self, gameday_id):
        if gameday_id is None:
            is_selected_query = Value(False)
        else:
            is_selected_query = Exists(
                PlayerlistGameday.objects.filter(
                    playerlist=OuterRef("id"), gameday=gameday_id
                )
            )
        return is_selected_query

    def _get_gameday_jersey_query(self, gameday_id):
        return Subquery(
            PlayerlistGameday.objects.filter(
                playerlist=OuterRef("id"), gameday=gameday_id
            ).values("gameday_jersey")
        )

    def get_player_gamedays(self, player_id):
        player = Playerlist.objects.filter(id=player_id)
        all_gamedays = PlayerlistGameday.objects.filter(playerlist__in=player)
        all_leagues = all_gamedays.values_list(
            "gameday__league__name", flat=True
        ).distinct()
        all_years = all_gamedays.values_list(
            "gameday__date__year", flat=True
        ).distinct()
        all_gamedays = all_gamedays.order_by("gameday__league", "gameday__date")
        league_list = []
        for current_league in all_leagues:
            league_list.append(
                {
                    "league_name": current_league,
                    "gamedays": PlayerAllGamedaysSerializer(
                        instance=all_gamedays.filter(
                            gameday__league__name=current_league
                        ).values("gameday__date", "gameday__name", "id"),
                        many=True,
                    ).data,
                }
            )
        player_values = player.annotate(
            gameday_jersey=Value(None, output_field=IntegerField()),
            is_selected=Value(False),
        ).values(*RosterSerializer.ALL_FIELD_VALUES)
        team = player.first().team
        return {
            "years": all_years,
            "team": team.description,
            "team_id": team.id,
            "player": RosterSerializer(
                instance=player_values,
                is_staff=self.user_permission.is_user_or_staff(),
                many=True,
            ).data[0],
            "entries": league_list,
        }

    def get_passcheck_status(self, officials_team: str):
        team = self._get_team(officials_team)
        if team is None:
            return {"completed": False}
        date = datetime.datetime.today()
        if settings.DEBUG:
            date = settings.DEBUG_DATE
        today_gamedays = Gameday.objects.filter(date__gte=date)
        gameinfo = Gameinfo.objects.filter(
            officials_id=team, gameday__in=today_gamedays
        ).order_by("scheduled")
        if not gameinfo.exists():
            return {"completed": False}
        games_to_check = gameinfo.filter(scheduled__lte=gameinfo.first().scheduled)
        number_of_teams_to_check = games_to_check.count() * 2
        verified_teams = PasscheckVerification.objects.filter(
            user__username=officials_team, gameday__in=today_gamedays
        )
        return {
            "completed": (
                True if number_of_teams_to_check == verified_teams.count() else False
            )
        }


class PasscheckServicePlayers:
    def can_write_roster(self, user, team_id, gameday_id) -> bool:
        """Staff, or the official of a game on today's gameday involving the team."""
        if user.is_staff:
            return True
        gameday = Gameday.objects.filter(pk=gameday_id).first()
        if gameday is None:
            return False
        today = settings.DEBUG_DATE if settings.DEBUG else datetime.date.today()
        if gameday.date != today:
            return False
        return Gameresult.objects.filter(
            gameinfo__gameday_id=gameday_id,
            gameinfo__officials__name=user.username,
            team_id=team_id,
        ).exists()

    def can_read_photo(self, user, playerlist, gameday) -> bool:
        """Staff, or the official of a game on today's gameday the player belongs to."""
        if user.is_staff:
            return True
        today = settings.DEBUG_DATE if settings.DEBUG else datetime.date.today()
        if gameday.date != today:
            return False
        scheduled_team_ids = Gameresult.objects.filter(
            gameinfo__gameday_id=gameday.pk,
            gameinfo__officials__name=user.username,
        ).values_list("team_id", flat=True)
        if playerlist.team_id in scheduled_team_ids:
            return True
        return TeamRelationship.objects.filter(
            team_id__in=scheduled_team_ids,
            additional_teams__id=playerlist.team_id,
        ).exists()

    def validate_roster(self, team_id, gameday, roster) -> dict:
        """Return field-keyed errors for a submitted gameday roster.

        An empty dict means the roster may be written. Season rules without an
        ``EligibilityRule`` are not enforced (the read endpoint 404s in that
        case; legacy gamedays/tests have no rule).
        """
        if not isinstance(roster, list):
            return {"roster": "Kader muss eine Liste sein."}

        team_ids = self.all_relevant_team_ids(team_id)
        allowed = (
            Playerlist.objects.filter(team_id__in=team_ids)
            .filter(Q(joined_on__lte=gameday.date))
            .filter(Q(left_on__isnull=True) | Q(left_on__gt=gameday.date))
        )
        allowed_ids = set(allowed.values_list("pk", flat=True))

        errors = {}
        seen_ids = set()
        seen_jerseys = {}
        valid_players = 0
        for entry in roster:
            player_id = entry.get("id") if isinstance(entry, dict) else None
            if not isinstance(player_id, int) or isinstance(player_id, bool):
                errors[str(player_id)] = "Nicht im Kader dieses Spieltags."
                continue
            if player_id not in allowed_ids:
                errors[str(player_id)] = "Nicht im Kader dieses Spieltags."
                continue
            if player_id in seen_ids:
                errors[str(player_id)] = "Spieler ist doppelt in der Aufstellung."
                continue
            seen_ids.add(player_id)

            jersey = entry.get("jersey_number")
            if (
                not isinstance(jersey, int)
                or isinstance(jersey, bool)
                or not 0 <= jersey <= 99
            ):
                errors[str(player_id)] = "Trikotnummer muss zwischen 0 und 99 liegen."
                continue
            if jersey in seen_jerseys:
                errors[str(player_id)] = f"Trikotnummer #{jersey} ist bereits vergeben."
                continue
            seen_jerseys[jersey] = player_id
            valid_players += 1

        rule = EligibilityRule.objects.filter(league_id=gameday.league_id).first()
        if rule is not None:
            minimum = rule.minimum_player_strength
            maximum = rule.maximum_player_strength
            if minimum and valid_players < minimum:
                errors["team"] = (
                    f"Mindestspielstärke {minimum} nicht erreicht "
                    f"({valid_players} geprüft)."
                )
            if maximum is not None and maximum >= 0 and valid_players > maximum:
                errors["team"] = f"Maximalspielstärke {maximum} überschritten."
        return errors

    @staticmethod
    def all_relevant_team_ids(team_id) -> list:
        """The team plus the teams it draws players from (Durchlässigkeit)."""
        return list(
            TeamRelationship.objects.filter(team_id=team_id).values_list(
                "additional_teams__id", flat=True
            )
        ) + [team_id]

    @staticmethod
    def _parse_client_id(value):
        if value in (None, ""):
            return None
        try:
            return uuid.UUID(str(value))
        except (TypeError, ValueError, AttributeError):
            raise RosterValidationError({"client_id": "client_id muss eine UUID sein."})

    @transaction.atomic
    def create_roster_and_passcheck_verification(self, team_id, gameday_id, user, data):
        gameday = Gameday.objects.select_for_update().get(pk=gameday_id)
        errors = self.validate_roster(team_id, gameday, data.get("roster") or [])
        if errors:
            raise RosterValidationError(errors)

        client_id = self._parse_client_id(data.get("client_id"))
        device_id = (data.get("device_id") or "").strip()[:64]
        existing = PasscheckVerification.objects.filter(
            team_id=team_id, gameday_id=gameday_id
        ).first()
        if (
            existing is not None
            and client_id is not None
            and existing.client_id == client_id
        ):
            return existing
        if (
            existing is not None
            and device_id
            and existing.device_id
            and existing.device_id != device_id
        ):
            raise DeviceConflictError(existing.device_id)

        PlayerlistGameday.objects.filter(
            playerlist__team__in=self.all_relevant_team_ids(team_id),
            gameday=gameday_id,
        ).delete()
        self._create_roster(gameday_id, data["roster"])
        return self._create_passcheck_verification(
            gameday_id,
            team_id,
            user,
            data.get("official_name"),
            data.get("note"),
            client_id=client_id,
            device_id=device_id,
        )

    # noinspection PyMethodMayBeStatic
    def _create_roster(self, gameday_id, roster: []):
        for player in roster:
            player_id = player["id"]
            PlayerlistGameday.objects.update_or_create(
                playerlist_id=player_id,
                gameday_id=gameday_id,
                defaults={
                    "playerlist_id": player_id,
                    "gameday_id": gameday_id,
                    "gameday_jersey": player["jersey_number"],
                },
            )

    # noinspection PyMethodMayBeStatic
    def _create_passcheck_verification(
        self,
        gameday_id,
        team_id,
        user,
        official_name,
        note,
        client_id=None,
        device_id="",
    ):
        verification, _ = PasscheckVerification.objects.update_or_create(
            team_id=team_id,
            gameday_id=gameday_id,
            defaults={
                "official_name": official_name,
                "user": user,
                "gameday_id": gameday_id,
                "team_id": team_id,
                "note": note,
                "client_id": client_id,
                "device_id": device_id,
            },
        )
        return verification


class TeamData(dict):
    def __init__(self, name, roster, validator):
        roster = sorted(
            roster,
            key=lambda x: (x.get("jersey_number") is None, x.get("jersey_number", 100)),
        )
        super().__init__(name=name, roster=roster, validator=validator)
