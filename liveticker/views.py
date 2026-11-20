from django.conf import settings
from django.http import Http404
from django.views.generic import TemplateView

from gameday_designer.service.swiss_tournament_service import (
    SwissTournamentError,
    SwissTournamentService,
)
from gamedays.models import Gameday, League


def _first_int(value):
    """First number of a comma separated query value, or ``None``.

    The API accepts ``gameday=1,2``; the page description only needs one name,
    so it takes the first one it can parse and otherwise stays generic.
    """
    for part in (value or "").split(","):
        try:
            return int(part)
        except ValueError:
            continue
    return None


class LivetickerView(TemplateView):
    template_name = "liveticker/index.html"


class LivetickerV2View(TemplateView):
    """The parallel TypeScript app; the legacy route stays untouched."""

    template_name = "liveticker/v2.html"

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["title"] = "Liveticker"
        context["page_description"] = self._description(self.request)
        # The stream is a client switch: the template hands it to the app as a
        # data attribute, and the app keeps polling when it is false.
        context["stream_enabled"] = bool(
            getattr(settings, "LIVETICKER_STREAM_ENABLED", False)
        )
        return context

    @staticmethod
    def _description(request):
        """SEO/OG description naming the gameday or league when one is asked for.

        One indexed lookup: the ticker is public and cached, so this must not
        add a second query to every view of the page.
        """
        gameday_id = _first_int(request.GET.get("gameday"))
        if gameday_id is not None:
            name = (
                Gameday.objects.filter(pk=gameday_id)
                .values_list("name", flat=True)
                .first()
            )
            if name:
                return f"Live-Ergebnisse und Spielverlauf – {name}"

        slugs = [slug for slug in (request.GET.get("league") or "").split(",") if slug]
        if slugs:
            names = list(
                League.objects.filter(slug__in=slugs).values_list("name", flat=True)
            )
            if names:
                return "Live-Ergebnisse und Spielverlauf – " + ", ".join(names)

        return "Live-Ergebnisse und Spielverlauf – alle Spiele des Tages"


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
                self.get_context_data(
                    gameday=gameday, standings=None, rounds_completed=0, rounds_total=0
                )
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
