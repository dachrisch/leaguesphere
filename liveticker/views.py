from django.http import Http404
from django.views.generic import TemplateView

from gameday_designer.service.swiss_tournament_service import (
    SwissTournamentError,
    SwissTournamentService,
)
from gamedays.models import Gameday


class SwissStandingsPublicView(TemplateView):
    """
    Public round-standings page for a Swiss gameday (no sign-in).

    Serves the same standings query the organizer's round-control panel
    uses (win=2/draw=1 plus 2 pts per bye) as plain server-side HTML, so
    Swiss tournament standings can be shared like the liveticker itself.
    """

    template_name = "liveticker/swiss_standings.html"

    def get(self, request, *args, **kwargs):
        gameday = self._get_gameday_or_404(kwargs.get("gameday_id"))
        service = SwissTournamentService(gameday)
        try:
            standings = service.standings()
            config = service.get_config()
        except SwissTournamentError:
            # Reachable for gamedays without a Swiss setup (or whose canvas
            # was reset): prefer a friendly "no standings yet" page over a 500.
            return self.render_to_response(
                self.get_context_data(gameday=gameday, standings=None,
                                      rounds_completed=0, rounds_total=0)
            )
        return self.render_to_response(
            self.get_context_data(
                gameday=gameday,
                standings=standings,
                rounds_completed=len(config.get("completedRounds") or []),
                rounds_total=config["rounds"],
            )
        )

    @staticmethod
    def _get_gameday_or_404(gameday_id):
        try:
            return Gameday.objects.get(pk=gameday_id)
        except (Gameday.DoesNotExist, ValueError, TypeError):
            raise Http404
