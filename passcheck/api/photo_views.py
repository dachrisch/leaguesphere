import mimetypes

from django.http import FileResponse
from django.shortcuts import get_object_or_404
from rest_framework import permissions
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.views import APIView

from gamedays.models import Gameday
from passcheck.models import Playerlist
from passcheck.service.passcheck_service import PasscheckServicePlayers


class PassPhotoAPIView(APIView):
    """Serve a consent-gated pass photo to the gameday's officials only.

    The photo lives outside MEDIA_ROOT (settings.PASS_PHOTO_ROOT) and this is
    the only way to read it; no cache headers let it outlive a revocation.
    """

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, playerlist_id, gameday):
        playerlist = get_object_or_404(
            Playerlist.objects.select_related("player__person"), pk=playerlist_id
        )
        gameday = get_object_or_404(Gameday, pk=gameday)
        if not PasscheckServicePlayers().can_read_photo(
            request.user, playerlist, gameday
        ):
            raise PermissionDenied("Foto nur für Offizielle des Spieltags.")

        person = playerlist.player.person
        if not person.photo or not person.photo_consent_at:
            raise NotFound("Kein Passfoto hinterlegt.")

        content_type = (
            mimetypes.guess_type(person.photo.name)[0] or "application/octet-stream"
        )
        response = FileResponse(person.photo.open("rb"), content_type=content_type)
        response["Cache-Control"] = "no-store"
        response["X-Content-Type-Options"] = "nosniff"
        return response
