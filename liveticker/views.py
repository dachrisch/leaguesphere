from django.conf import settings
from django.http import Http404, HttpResponsePermanentRedirect
from django.urls import reverse
from django.views.generic import TemplateView

from gameday_designer.service.swiss_tournament_service import (
    SwissTournamentError,
    SwissTournamentService,
)
from gamedays.models import Gameinfo, Gameday
from liveticker.constants import (
    LIVETICKER_V2_GAMEDAY,
    LIVETICKER_V2_GAME,
    LIVETICKER_V2_HOME,
)


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
    """The parallel TypeScript app; the legacy route stays untouched.

    The v2 app lives at path URLs so a shared link is self-contained:

    * ``/liveticker/v2/`` -- today's gamedays
    * ``/liveticker/v2/gameday/<id>/`` -- one gameday
    * ``/liveticker/v2/gameday/<id>/game/<id>/`` -- that game selected

    The old query URLs (``?gameday=...&game=...``) are still in the wild, so
    they answer with a permanent redirect to the path form instead of
    rendering a second variant of the page.
    """

    template_name = "liveticker/v2.html"

    # Only these parameters ever addressed the v2 app; anything else (such as
    # the site-wide ``isExtern``) must not trigger a redirect.
    LEGACY_QUERY_KEYS = ("league", "gameday", "game", "all")

    def get(self, request, *args, **kwargs):
        redirect = self._legacy_redirect(request)
        if redirect is not None:
            return redirect
        return super().get(request, *args, **kwargs)

    def _legacy_redirect(self, request):
        params = request.GET
        if not any(key in params for key in self.LEGACY_QUERY_KEYS):
            return None

        game_id = _first_int(params.get("game"))
        if game_id is not None:
            # The game is the source of truth for its gameday, even when the
            # old link carried a different one.
            gameday_id = (
                Gameinfo.objects.filter(pk=game_id)
                .values_list("gameday_id", flat=True)
                .first()
            )
            if gameday_id is None:
                raise Http404
            return HttpResponsePermanentRedirect(
                reverse(
                    LIVETICKER_V2_GAME,
                    kwargs={"gameday_id": gameday_id, "game_id": game_id},
                )
            )

        gameday_id = _first_int(params.get("gameday"))
        if gameday_id is not None:
            if not Gameday.objects.filter(pk=gameday_id).exists():
                raise Http404
            return HttpResponsePermanentRedirect(
                reverse(LIVETICKER_V2_GAMEDAY, kwargs={"gameday_id": gameday_id})
            )

        # League scoping is gone with the path scheme: a league without a
        # gameday is just "today's ticker".
        return HttpResponsePermanentRedirect(reverse(LIVETICKER_V2_HOME))

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        gameday_id = kwargs.get("gameday_id")
        game_id = kwargs.get("game_id")

        gameday = None
        if gameday_id is not None:
            gameday = Gameday.objects.filter(pk=gameday_id).only("name").first()
            if gameday is None:
                raise Http404

        if game_id is not None:
            # A game page must name a game of *this* gameday.
            belongs = Gameinfo.objects.filter(
                pk=game_id, gameday_id=gameday_id
            ).exists()
            if not belongs:
                raise Http404

        context["title"] = "Liveticker"
        # Empty strings render as empty data attributes for the root page.
        context["gameday_id"] = gameday_id or ""
        context["game_id"] = game_id or ""
        context["page_description"] = (
            f"Live-Ergebnisse und Spielverlauf – {gameday.name}"
            if gameday
            else "Live-Ergebnisse und Spielverlauf – alle Spiele des Tages"
        )
        # The canonical/OG URL is the path form the app itself writes; query
        # URLs never render, they redirect.
        context["canonical_url"] = self.request.build_absolute_uri(self.request.path)
        # The stream is a client switch: the template hands it to the app as a
        # data attribute, and the app keeps polling when it is false.
        context["stream_enabled"] = bool(
            getattr(settings, "LIVETICKER_STREAM_ENABLED", False)
        )
        return context


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
