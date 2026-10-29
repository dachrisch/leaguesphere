from http import HTTPStatus

from django.db.models import Case, Q, Value, When
from rest_framework import permissions
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from gamedays.models import Gameinfo
from officials.api.serializers import (
    CrewPositionScorecardSerializer,
    OfficialTeamListScorecardSerializer,
)
from officials.models import Official
from officials.service.crew_positions import crew_positions_for_game
from officials.service.game_official_licenses import resolve_current_licenses

SEARCH_MIN_TERM_LENGTH = 2
SEARCH_DEFAULT_LIMIT = 10
SEARCH_MAX_LIMIT = 25


def _with_licenses(officials) -> list:
    """Evaluates the officials queryset and adds each one's current license
    (see resolve_current_licenses) with a single extra query."""
    rows = list(officials)
    licenses = resolve_current_licenses(row["id"] for row in rows)
    return [{**row, **licenses[row["id"]]} for row in rows]


class OfficialsTeamListAPIView(APIView):
    permission_classes = (permissions.IsAuthenticated,)

    # noinspection PyMethodMayBeStatic
    def get(self, request, **kwargs):
        team_id = kwargs.get("pk")
        officials = (
            Official.objects.filter(team_id=team_id)
            .order_by("first_name", "last_name")
            .values(*OfficialTeamListScorecardSerializer.ALL_FIELD_VALUES)
        )
        serializer = OfficialTeamListScorecardSerializer(
            instance=_with_licenses(officials), many=True
        )
        return Response(serializer.data, status=HTTPStatus.OK)


class OfficialsSearchName(APIView):
    permission_classes = (permissions.IsAuthenticated,)

    # noinspection PyMethodMayBeStatic
    def get(self, request: Request, **kwargs):
        name_param = request.query_params.get("name")
        team_id = kwargs.get("pk")
        if name_param is None:
            raise ValidationError(
                detail="You need to specify a 'name' param to search for official"
            )
        name = name_param.split()
        if len(name) < 2:
            raise ValidationError(
                detail="Bitte Vor- und Nachname getrennt durch Leerzeichen eingeben und Suche erneut starten"
            )
        if len(name[0]) < 3:
            raise ValidationError("Vorname muss mindestens 3 Zeichen haben")
        # first/last name may each consist of several words, so try every split
        name_split_filter = Q()
        for split_at in range(1, len(name)):
            name_split_filter |= Q(
                first_name__istartswith=" ".join(name[:split_at]),
                last_name__istartswith=" ".join(name[split_at:]),
            )
        officials = (
            Official.objects.filter(name_split_filter)
            .exclude(team=team_id)
            .order_by("first_name", "last_name")
            .values(*OfficialTeamListScorecardSerializer.ALL_FIELD_VALUES)
        )
        officials = _with_licenses(officials)
        if not officials:
            raise NotFound(
                f'Es wurden keine Offiziellen gefunden für: {" ".join(name)}'
            )
        serializer = OfficialTeamListScorecardSerializer(instance=officials, many=True)
        return Response(serializer.data, status=HTTPStatus.OK)


class OfficialsSearchList(APIView):
    """Progressive person search for a typing picker (scorecard v2).

    The sibling :class:`OfficialsSearchName` is the opposite contract: it
    demands both names, refuses a first name shorter than three characters,
    excludes one team and answers `404`. None of that works for suggestions
    while an operator types, so this endpoint is separate.

    Every token of the query has to match the first *or* the last name, so
    "hans berg" finds "Hans van der Berg" as well as "Hans Bergmann". Search is
    database-wide on purpose (a guest official is still a person); the
    `team` parameter only moves one team's people to the top.
    """

    permission_classes = (permissions.IsAuthenticated,)

    # noinspection PyMethodMayBeStatic
    def get(self, request: Request):
        query = " ".join((request.query_params.get("name") or "").split())
        if query == "":
            raise ValidationError(detail="Bitte einen Namen eingeben")
        if len(query) < SEARCH_MIN_TERM_LENGTH:
            raise ValidationError(
                detail=f"Bitte mindestens {SEARCH_MIN_TERM_LENGTH} Zeichen eingeben"
            )
        limit = self._limit(request.query_params.get("limit"))
        team_id = self._team(request.query_params.get("team"))

        name_filter = Q()
        for token in query.split():
            name_filter &= Q(first_name__icontains=token) | Q(
                last_name__icontains=token
            )
        officials = Official.objects.filter(name_filter)
        if team_id is None:
            officials = officials.order_by("last_name", "first_name")
        else:
            # A person of another team is still a valid suggestion — the
            # ordered case keeps the caller's own crew on top of the list.
            officials = officials.annotate(
                same_team=Case(
                    When(team_id=team_id, then=Value(0)), default=Value(1)
                )
            ).order_by("same_team", "last_name", "first_name")
        rows = officials.values(*OfficialTeamListScorecardSerializer.ALL_FIELD_VALUES)[
            :limit
        ]
        serializer = OfficialTeamListScorecardSerializer(
            instance=_with_licenses(rows), many=True
        )
        return Response(serializer.data, status=HTTPStatus.OK)

    @staticmethod
    def _limit(raw: str | None) -> int:
        if raw is None or raw.strip() == "":
            return SEARCH_DEFAULT_LIMIT
        try:
            limit = int(raw)
        except ValueError:
            raise ValidationError(detail="'limit' muss eine Zahl sein")
        if limit < 1:
            raise ValidationError(detail="'limit' muss mindestens 1 sein")
        return min(limit, SEARCH_MAX_LIMIT)

    @staticmethod
    def _team(raw: str | None) -> int | None:
        if raw is None or raw.strip() == "":
            return None
        try:
            return int(raw)
        except ValueError:
            raise ValidationError(detail="'team' muss eine Zahl sein")


class CrewPositionsForGameAPIView(APIView):
    """The crew slots the scorecard should offer for one game.

    The preparation screen only knows the game id, so the league is resolved
    server-side (game → gameday → league). Serving it here rather than on the
    game endpoint keeps the scorecard's own surface in the officials app, and a
    league without configuration answers the built-in defaults — same shape
    either way, never an empty list.
    """

    permission_classes = (permissions.IsAuthenticated,)

    # noinspection PyMethodMayBeStatic
    def get(self, request: Request, **kwargs):
        game_id = kwargs.get("pk")
        try:
            positions = crew_positions_for_game(game_id)
        except Gameinfo.DoesNotExist:
            raise NotFound(f"Spiel {game_id} wurde nicht gefunden") from None
        serializer = CrewPositionScorecardSerializer(instance=positions, many=True)
        return Response(serializer.data, status=HTTPStatus.OK)
