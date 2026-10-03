from http import HTTPStatus

from django.db.models import Q
from rest_framework import permissions
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from officials.api.serializers import OfficialTeamListScorecardSerializer
from officials.models import Official


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
        serializer = OfficialTeamListScorecardSerializer(instance=officials, many=True)
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
        if not officials.exists():
            raise NotFound(
                f'Es wurden keine Offiziellen gefunden für: {" ".join(name)}'
            )
        serializer = OfficialTeamListScorecardSerializer(instance=officials, many=True)
        return Response(serializer.data, status=HTTPStatus.OK)
