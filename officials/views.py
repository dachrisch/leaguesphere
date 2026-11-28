import json
import logging
from datetime import datetime, timedelta
from types import SimpleNamespace
from urllib.parse import urlencode

from django.conf import settings
from django.contrib import messages
from django.contrib.auth.mixins import UserPassesTestMixin, LoginRequiredMixin
from django.core.cache import cache
from django.core.paginator import Paginator, PageNotAnInteger, EmptyPage
from django.db.models import Subquery, OuterRef, Q
from django.http import Http404, HttpResponse
from django.shortcuts import render, redirect
from django.urls import reverse
from django.utils.html import format_html, format_html_join
from django.views import View
from django.views.decorators.cache import cache_page

from gamedays.constants import LEAGUE_GAMEDAY_DETAIL
from gamedays.models import Team, Gameinfo, GameOfficial, Gameresult
from league_manager.utils.serializer_utils import Obfuscator
from league_manager.utils.view_utils import PermissionHelper
from officials.api.serializers import (
    GameOfficialAllInfoSerializer,
    OfficialSerializer,
    OfficialGamelistSerializer,
    prefetch_official_license_history,
)
from officials.constants import (
    MOODLE_LOGGED_IN_USER,
    MOODLE_REMEMBER_COOKIE,
    OFFICIALS_STATISTICS_FOR_SEASON,
    REMEMBER_COOKIE_PATH,
)
from officials.forms import (
    AddExternalGameOfficialEntryForm,
    AddInternalGameOfficialEntryForm,
    MoodleLoginForm,
)
from officials.models import Official, OfficialLicenseHistory
from officials.service.association_resolution import UnknownAssociationError
from officials.service.boff_license_calculation import LicenseStrategy
from officials.service.moodle.moodle_api import MoodleApiException
from officials.service.moodle.moodle_service import MoodleService
from requests import RequestException
from officials.service.official_service import OfficialService
from officials.service.officials_repository_service import OfficialsRepositoryService
from officials.service.signup_service import (
    OfficialSignupService,
    DuplicateSignupError,
    MaxSignupError,
)
from officials.service.remember_me import RememberMeService, REMEMBER_ME_MAX_AGE
from officials.selfservice import (
    ADD_ASSIGNMENT_URL_NAME,
    CLAIM_URL_NAME,
    UNASSIGN_URL_NAME,
    acting_official_id,
    can_edit_official,
    can_take_over_typed_name,
    delete_remember_cookie,
    name_matches_official,
    restore_moodle_session,
    safe_next,
    selfservice_banner_context,
    set_remember_cookie,
)

logger = logging.getLogger(__name__)

NO_OFFICIAL_FOR_MOODLE_USER = (
    "Für diesen Moodle-Account ist kein Official hinterlegt. "
    "Bitte wende dich an die Turnierleitung."
)


_set_remember_cookie = set_remember_cookie
_delete_remember_cookie = delete_remember_cookie


class AllTeamsCardListView(View):
    template_name = "officials/all_teams_card_list.html"

    def get(self, request, **kwargs):
        context = OfficialService().get_all_teams_with_license_breakdown()
        return render(request, self.template_name, context)


class OfficialsStatisticsView(View):
    template_name = "officials/statistics.html"
    YEARS_CACHE_KEY = "officials_statistics_years"

    def get(self, request, **kwargs):
        season = kwargs.get("season", datetime.today().year)
        is_staff = request.user.is_staff
        officials_repository_service = OfficialsRepositoryService()
        statistics = officials_repository_service.get_officials_statistics_for_season(
            season
        )
        officials_without_external = statistics["without_external"]
        officials_with_external = statistics["with_external"]

        # An official can appear in both lists (they're the same
        # underlying rows, just re-ranked/re-cut), so set this once per
        # list rather than trying to de-duplicate - harmless either way.
        for official in officials_without_external + officials_with_external:
            official.display_name = Obfuscator.reveal_unless_obfuscated(
                is_staff, official.first_name, official.last_name
            )
        years = self._get_years()

        return render(
            request,
            self.template_name,
            {
                "season": season,
                "years": years,
                "url_pattern": OFFICIALS_STATISTICS_FOR_SEASON,
                "officials_list_without_external": officials_without_external,
                "officials_list_with_external": officials_with_external,
            },
        )

    @classmethod
    def _get_years(cls):
        """
        Distinct years with at least one recorded GameOfficial - only
        used to populate the year-picker, so it's cached at the query
        level (not a full-page cache_page, since the page's content
        itself varies by is_staff) to avoid an unfiltered full-table
        scan on every single request to this public page.
        """
        years = cache.get(cls.YEARS_CACHE_KEY)
        if years is None:
            years = sorted(
                GameOfficial.objects.all()
                .values_list("gameinfo__gameday__date__year", flat=True)
                .distinct(),
                reverse=True,
            )
            cache.set(cls.YEARS_CACHE_KEY, years, timeout=60 * 60 * 24)
        return years


class OfficialsTeamListView(View):
    model = Official
    template_name = "officials/officials_list.html"

    def get(self, request, **kwargs):
        team_id = kwargs.get("pk")
        year = kwargs.get("season", datetime.today().year)
        official_service = OfficialService()
        try:
            context = official_service.get_all_officials_with_team_infos(
                team_id,
                year,
                PermissionHelper.has_staff_or_user_permission(request, team_id),
            )
        except Team.DoesNotExist:
            raise Http404("Team does not exist.")

        # Officiated-games section: visible to any logged-in user other than
        # someone in the middle of the separate Moodle-officials-login
        # session flow (MOODLE_LOGGED_IN_USER) - no team-account matching,
        # no staff exclusion. The (comparatively expensive - see
        # matchreport/service/officiated_games_service.py's module docstring) query work only runs
        # when the section will actually be shown.
        context["show_officiated_games"] = (
            request.user.is_authenticated
            and not request.session.get(MOODLE_LOGGED_IN_USER)
        )
        if context["show_officiated_games"]:
            from officials.service.officiated_games import team_officiated_games

            # Only staff get the renderer's claim/unassign "Aktion" column,
            # and its ?next= points back at this exact team-list URL (which
            # may or may not carry a season) so confirm/cancel return here.
            context["officiated_games"] = team_officiated_games(
                team_id,
                year,
                include_official_actions=request.user.is_staff,
                next_path=request.path,
            )

        return render(
            request,
            self.template_name,
            context,
        )

    def is_user_allowed_to_see_official_names(self, team_id):
        team: Team = Team.objects.get(pk=team_id)
        if self.request.user.is_staff:
            return True
        return self.request.user.username == team.name


GAME_OFFICIALS_LIST_CACHE_SECONDS = 60 * 60 * 24


class GameOfficialListView(View):
    template_name = "officials/game_officials_list.html"

    def get(self, request, **kwargs):
        # Only the logged-out page may come from the shared cache. Everything
        # with a session (staff, Moodle official, team account) or a
        # remember-me cookie is rendered per visitor, so one visitor's
        # banner/buttons can never be stored and served to another.
        if (
            request.user.is_authenticated
            or request.session.get(MOODLE_LOGGED_IN_USER)
            or request.COOKIES.get(MOODLE_REMEMBER_COOKIE)
        ):
            return self._render(request, **kwargs)
        return cache_page(GAME_OFFICIALS_LIST_CACHE_SECONDS)(self._render)(
            request, **kwargs
        )

    def _render(self, request, **kwargs):
        restored = restore_moodle_session(request)
        if restored.official_id is not None:
            # Sliding ~2h session on the self-service pages.
            request.session.set_expiry(7200)
            request.session.modified = True
        year_str = kwargs.get("season", datetime.today().year)
        year = int(year_str) if year_str else None
        team_id = kwargs.get("pk")
        try:
            team_id = int(team_id) if team_id else None
        except ValueError:
            team_id = None
        game_officials = GameOfficial.objects.filter(
            gameinfo__gameday__date__year=year
        ).exclude(position="Scorecard Judge")
        if team_id:
            team = Team.objects.get(pk=team_id).description
            game_officials = game_officials.filter(
                Q(gameinfo__officials__pk=team_id, official=None)
                | Q(official__team__pk=team_id)
            )
            years = (
                GameOfficial.objects.filter(
                    Q(gameinfo__officials__pk=team_id, official=None)
                    | Q(official__team__pk=team_id)
                )
                .values_list("gameinfo__gameday__date__year", flat=True)
                .distinct()
            )
        else:
            years = (
                GameOfficial.objects.all()
                .values_list("gameinfo__gameday__date__year", flat=True)
                .distinct()
            )
            team = None
        acting = acting_official_id(request)
        acting_official = (
            Official.objects.filter(pk=acting).first() if acting is not None else None
        )
        # The canonical /einsaetze/meine/ route passes mine=True as a URL
        # kwarg; ?mine=1 stays supported for existing links/bookmarks. Both
        # only apply to someone with an acting Moodle official.
        mine = (
            kwargs.get("mine", False) or request.GET.get("mine") == "1"
        ) and acting_official is not None
        if mine:
            # Own mapped rows plus unassigned rows whose typed name looks like
            # this official. The name match is a Python-side best effort (see
            # name_matches_official), so the SQL side only narrows by pk.
            matching_open_ids = [
                row.pk
                for row in game_officials.filter(official__isnull=True).only(
                    "pk", "name"
                )
                if name_matches_official(row.name, acting_official)
            ]
            game_officials = game_officials.filter(
                Q(official_id=acting_official.pk) | Q(pk__in=matching_open_ids)
            )
        # The canonical /einsaetze/offen/ route passes open=True as a URL
        # kwarg; ?open=1 stays supported for existing links/bookmarks. Like
        # the mine filter, it intersects with the other filter above, so the
        # composable query-param form (?mine=1&open=1) keeps working.
        open_filter = bool(kwargs.get("open")) or request.GET.get("open") == "1"
        if open_filter:
            game_officials = game_officials.filter(official__isnull=True)
        game_officials = game_officials.order_by("gameinfo__gameday__date")
        is_staff = request.user.is_staff
        team_name = request.user.username

        paginator = Paginator(game_officials, 1000)
        page = request.GET.get("page")
        try:
            game_officials_page = paginator.page(page)
        except PageNotAnInteger:
            game_officials_page = paginator.page(1)
        except EmptyPage:
            game_officials_page = paginator.page(paginator.num_pages)
        game_officials_object_list = game_officials_page.object_list.annotate(
            home=self._get_subquery(is_home=True),
            away=self._get_subquery(is_home=False),
        )
        from officials.urls import (
            OFFICIALS_GAME_OFFICIALS_APPEARANCE_FOR_TEAM_AND_YEAR,
            OFFICIALS_GAME_OFFICIALS_APPEARANCE_FOR_YEAR,
        )

        url_pattern = (
            OFFICIALS_GAME_OFFICIALS_APPEARANCE_FOR_TEAM_AND_YEAR
            if team_id
            else OFFICIALS_GAME_OFFICIALS_APPEARANCE_FOR_YEAR
        )
        base_kwargs = {"season": year}
        if team_id:
            base_kwargs["pk"] = team_id
        base_url = reverse(url_pattern, kwargs=base_kwargs)

        def filter_url(*, want_mine=False, want_open=False) -> str:
            params = {}
            if want_mine:
                params["mine"] = "1"
            if want_open:
                params["open"] = "1"
            return f"{base_url}?{urlencode(params)}" if params else base_url

        context = {
            "season": year,
            "team": team,
            "team_id": team_id,
            "years": sorted(years, reverse=True),
            "url_pattern": url_pattern,
            # Toggles stay on the current season/team URL and compose with
            # the other filter, instead of jumping to the season-less
            # canonical routes (which dropped both).
            "mine_on_url": filter_url(want_mine=True, want_open=open_filter),
            "mine_off_url": filter_url(want_open=open_filter),
            "open_on_url": filter_url(want_mine=mine, want_open=True),
            "open_off_url": filter_url(want_mine=mine),
            "year_query": filter_url(want_mine=mine, want_open=open_filter).partition(
                "?"
            )[2],
            "pk": team_id,
            "object_list": self._rows_with_flags(
                game_officials_object_list,
                team_name=team_name,
                is_staff=is_staff,
                acting_official=acting_official,
            ),
            "mine_filter": mine,
            "open_filter": open_filter,
            "claim_url_name": CLAIM_URL_NAME,
            "add_assignment_url": reverse(ADD_ASSIGNMENT_URL_NAME),
            "unassign_url_name": UNASSIGN_URL_NAME,
            "page_obj": game_officials_page,
        }
        context.update(selfservice_banner_context(request))
        response = render(request, self.template_name, context)
        if restored.cookie_value:
            _set_remember_cookie(response, restored.cookie_value)
        return response

    @staticmethod
    def _rows_with_flags(
        game_officials_object_list, *, team_name, is_staff, acting_official
    ):
        raw_rows = list(
            game_officials_object_list.values(
                *GameOfficialAllInfoSerializer.ALL_VALUE_FIELDS
            )
        )
        rows = GameOfficialAllInfoSerializer(
            instance=raw_rows,
            display_names_for_team=team_name,
            is_staff=is_staff,
            many=True,
        ).data
        for raw, row in zip(raw_rows, rows):
            row_official_id = int(row["official_id"]) if row["official_id"] else None
            row["is_own_row"] = (
                acting_official is not None and row_official_id == acting_official.pk
            )
            # The typed name, not the obfuscated display name: matching the
            # obfuscated one ("M****M****") could never equal a real name.
            row["is_own_open_row"] = (
                acting_official is not None
                and row_official_id is None
                and name_matches_official(raw["name"], acting_official)
            )
            # Claim/takeover links must match the write gate: a Moodle
            # official needs the full typed name on the row, mapped or not,
            # and a mapped row whose current owner already fits that name is
            # not offered for takeover. Using the tolerant name_matches_
            # official here would offer a button the write then refuses.
            current_owner = (
                SimpleNamespace(
                    first_name=raw.get("official__first_name"),
                    last_name=raw.get("official__last_name"),
                )
                if row_official_id is not None
                else None
            )
            row["can_reclaim"] = is_staff or (
                acting_official is not None
                and can_take_over_typed_name(
                    raw["name"], acting_official, current_owner
                )
            )
            if row["is_own_row"]:
                # The visitor's own row shows the name; every other row keeps
                # the obfuscated form.
                row["name"] = (
                    f"{row['official_first_name']} {row['official_last_name']}"
                )
        return rows

    # noinspection PyMethodMayBeStatic
    def _get_subquery(self, is_home: bool):
        return Subquery(
            Gameresult.objects.filter(
                gameinfo=OuterRef("gameinfo"), isHome=is_home
            ).values("team__description")[:1]
        )


class AddInternalGameOfficialUpdateView(LoginRequiredMixin, UserPassesTestMixin, View):
    form_class = AddInternalGameOfficialEntryForm
    template_name = "officials/internal_gameofficial_form.html"

    def get(self, request):
        return render(
            request, self.template_name, {"form": AddInternalGameOfficialEntryForm()}
        )

    def post(self, request):
        entry_lines = []
        current_line = []
        form = AddInternalGameOfficialEntryForm(request.POST)
        data = form.data.copy()
        all_lines = data.get("entries").splitlines()
        try:
            while all_lines:
                current_line = all_lines.pop(0)
                result = [x.strip() for x in current_line.split(",")]
                entry_lines.append(OfficialService.create_game_official_entry(result))
        except (TypeError, ValueError) as error:
            error_message = error.args[0]
            all_lines = [current_line] + all_lines
            if "positional arguments" in error_message:
                form.add_error(
                    "entries",
                    "Zu viele Einträge in der ersten Zeile! Maximal 3 erlaubt.",
                )
            else:
                form.add_error("entries", error_message)
        # noinspection PyUnresolvedReferences
        except Gameinfo.DoesNotExist:
            all_lines = [current_line] + all_lines
            form.add_error("entries", "gameinfo_id nicht gefunden!")
        except Official.DoesNotExist:
            all_lines = [current_line] + all_lines
            form.add_error("entries", "official_id nicht gefunden!")

        if form.is_valid():
            messages.success(
                self.request,
                format_html(
                    "Folgende Einträge erzeugt:<br>{}",
                    format_html_join("<br>", "{}", ((line,) for line in entry_lines)),
                ),
            )
        data["entries"] = "\n".join(all_lines)
        form.data = data
        return render(request, self.template_name, {"form": form})

    def test_func(self):
        return self.request.user.is_staff


EXTERNAL_MANUAL_ENTRY_FIELDS = (
    "official_id",
    "number_games",
    "date",
    "position",
    "association",
    "halftime_duration",
)


class AddExternalGameOfficialUpdateView(LoginRequiredMixin, UserPassesTestMixin, View):
    """Manual, no-upload fallback for the "außerhalb DFFL" branch -
    mirrors AddInternalGameOfficialUpdateView's line-per-entry, per-line
    error handling exactly. Builds a dict (not a positional tuple) since
    OfficialService.create_external_official_entry takes one, unlike
    create_game_official_entry's positional list."""

    form_class = AddExternalGameOfficialEntryForm
    template_name = "officials/external_gameofficial_form.html"

    def test_func(self):
        return self.request.user.is_staff

    def get(self, request):
        return render(request, self.template_name, {"form": self.form_class()})

    def post(self, request):
        entry_lines = []
        current_line = []
        form = self.form_class(request.POST)
        data = form.data.copy()
        all_lines = data.get("entries").splitlines()
        official_service = OfficialService()
        try:
            while all_lines:
                current_line = all_lines.pop(0)
                values = [x.strip() for x in current_line.split(",")]
                if len(values) != len(EXTERNAL_MANUAL_ENTRY_FIELDS):
                    raise TypeError(
                        f"Zeile muss genau {len(EXTERNAL_MANUAL_ENTRY_FIELDS)} "
                        "Werte haben!"
                    )
                entry_lines.append(
                    official_service.create_external_official_entry(
                        dict(zip(EXTERNAL_MANUAL_ENTRY_FIELDS, values))
                    )
                )
        except (TypeError, ValueError, UnknownAssociationError) as error:
            all_lines = [current_line] + all_lines
            form.add_error("entries", _entry_error_message(error))
        except Official.DoesNotExist:
            all_lines = [current_line] + all_lines
            form.add_error("entries", "official_id nicht gefunden!")

        if form.is_valid():
            messages.success(
                self.request,
                format_html(
                    "Folgende Einträge erzeugt:<br>{}",
                    format_html_join("<br>", "{}", ((line,) for line in entry_lines)),
                ),
            )
        data["entries"] = "\n".join(all_lines)
        form.data = data
        return render(request, self.template_name, {"form": form})


# Phase 3 Layer 3: import orchestration lives in its own module; re-export
# every moved name so ``officials/urls.py`` and callers stay unchanged.
from .import_views import (  # noqa: F401
    OFFICIALS_IMPORT_SESSION_KEY,
    STATUS_TO_GROUP,
    IMPORT_ERROR_MESSAGE_LIMIT,
    _external_suggestion_to_initial,
    _internal_fix_suggestion_to_initial,
    _entry_error_message,
    GameOfficialImportUploadView,
    _group_by_status,
    _association_resolver,
    _external_row_data,
    _internal_row_data,
    _parse_iso_date,
    _selected_ids,
    GameOfficialImportConfirmView,
)


class LicenseCheckForOfficials(LoginRequiredMixin, UserPassesTestMixin, View):
    template_name = "officials/license_check.html"

    def get(self, request, *args, **kwargs):
        course_id = kwargs.get("course_id")
        official_service = OfficialService()
        from officials.urls import OFFICIALS_PROFILE_GAMELIST

        officials_list, course = official_service.get_game_count_for_license(course_id)
        license_id = course.get_license_id()
        context = {
            "license_requirements": LicenseStrategy.COURSE_MAPPING(license_id),
            "license_id": license_id,
            "course_date": course.get_date(),
            "year_before_course_date": course.get_date() - timedelta(days=365),
            "profile_url": OFFICIALS_PROFILE_GAMELIST,
            "officials_list": officials_list,
        }
        return render(request, self.template_name, context)

    def test_func(self):
        return self.request.user.is_staff or self.request.user.username == "offd"


class MoodleReportView(LoginRequiredMixin, UserPassesTestMixin, View):
    template_name = "officials/moodle_report.html"

    def get(self, request, *args, **kwargs):
        course_ids = request.GET.get("ids")
        ignore_year_raw = request.GET.get("ignoreYear", "false").lower()
        ignore_year = ignore_year_raw == "true"
        moodle_service = MoodleService()
        result = moodle_service.update_licenses(course_ids, ignore_year)
        context = {"time": result[1], "result": json.dumps(result[0], indent=4)}
        return render(request, self.template_name, context)

    def test_func(self):
        return self.request.user.is_staff or self.request.user.username == "offd"


class OfficialProfileLicenseView(View):
    template_name = "officials/profile_license.html"

    def get(self, request, *args, **kwargs):
        license_id = kwargs.get("pk")
        official = Official.objects.get(id=license_id)
        return render(
            request,
            self.template_name,
            {
                "official_info": OfficialSerializer(
                    instance=official, is_staff=self.request.user.is_staff
                ).data
            },
        )


class OfficialProfileGamelistView(View):
    template_name = "officials/profile_gamelist.html"

    def get(self, request, *args, **kwargs):
        restored = restore_moodle_session(request)
        if restored.official_id is not None:
            request.session.set_expiry(7200)
            request.session.modified = True
        year = datetime.today().year
        season = kwargs.get("season", year)
        license_id = kwargs.get("pk")
        official = Official.objects.get(id=license_id)
        official_info = OfficialGamelistSerializer(
            instance=official,
            season=season,
            is_staff=PermissionHelper.has_staff_or_user_permission(
                request, official.team.pk
            ),
            # The Moodle session (or a restored remember-me cookie) pins the
            # visitor to one Official. On their own profile they may see all
            # values unobfuscated; everybody else keeps the obfuscated view.
            is_self=acting_official_id(request) == official.pk,
        ).data
        from officials.urls import OFFICIALS_PROFILE_GAMELIST

        context = {
            "url_pattern": OFFICIALS_PROFILE_GAMELIST,
            "pk": license_id,
            "team_id": official.team_id,
            "current_year": year,
            "years": official.gameofficial_set.all()
            .values_list("gameinfo__gameday__date__year", flat=True)
            .order_by("-gameinfo__gameday__date__year")
            .distinct(),
            "season": season,
            "official_info": official_info,
            "needed_games_for_license": 4
            - (
                official_info["external_games"]["number_games"]
                + official_info["dffl_games"]["number_games"]
            ),
        }
        context.update(selfservice_banner_context(request, official))
        context["can_edit_profile"] = can_edit_official(request, official.pk)
        response = render(request, self.template_name, context)
        if restored.cookie_value:
            _set_remember_cookie(response, restored.cookie_value)
        return response


class OfficialAssociationListView(View):
    template_name = "officials/association_list.html"

    def get(self, request, *args, **kwargs):
        association_abbreviation = kwargs.get("abbr")
        year = datetime.today().year
        valid_licenses = OfficialLicenseHistory.objects.filter(
            created_at__gt=f"{year - 1}-04-01"
        ).exclude(license__id=4)
        officials_with_valid_licenses = valid_licenses.values("official").distinct()
        official_list = (
            Official.objects.filter(
                Q(
                    id__in=officials_with_valid_licenses,
                    team__association__abbr=association_abbreviation,
                )
                | Q(
                    id__in=officials_with_valid_licenses,
                    team=Official.OHNE_TEAM_ID,
                    association__abbr=association_abbreviation,
                )
            )
            .select_related("team__association", "association")
            .prefetch_related(prefetch_official_license_history())
            .order_by("team__description", "last_name")
        )
        return render(
            request,
            self.template_name,
            {
                "association": association_abbreviation,
                "result": OfficialSerializer(
                    instance=official_list,
                    is_staff=self.is_user_allowed_to_see_official_names(
                        association_abbreviation
                    ),
                    fetch_email=True,
                    many=True,
                ).data,
            },
        )

    def is_user_allowed_to_see_official_names(self, association):
        if self.request.user.is_staff:
            return True
        return self.request.user.username == association


class MoodleLoginView(View):
    template_name = "officials/signup/moodle_login.html"
    form_class = MoodleLoginForm

    def get(self, request, *args, **kwargs):
        return render(
            request,
            self.template_name,
            {"form": MoodleLoginForm(initial={"next": request.GET.get("next", "")})},
        )

    def post(self, request, *args, **kwargs):
        form = MoodleLoginForm(request.POST)
        try:
            if form.is_valid():
                username = form.cleaned_data["username"]
                password = form.cleaned_data["password"]
                moodle_service = MoodleService()
                official_id = moodle_service.login(username, password)
                # Privilege boundary: drop the pre-auth session key so a
                # fixated anonymous session cannot become this logged-in one.
                request.session.cycle_key()
                request.session[MOODLE_LOGGED_IN_USER] = official_id

                response = redirect(safe_next(request))
                if form.cleaned_data.get("remember_me"):
                    _set_remember_cookie(response, RememberMeService.issue(official_id))
                return response
        except MoodleApiException as error:
            form.add_error("", f"{error}")
        except Official.DoesNotExist:
            form.add_error("", NO_OFFICIAL_FOR_MOODLE_USER)
        except RequestException as error:
            # A stale/missing MOODLE_URL (or an unreachable offd.de) used to
            # raise e.g. MissingSchema out of requests and 500 the login page.
            logger.warning("Moodle login could not be reached: %s", error)
            form.add_error(
                "",
                "Die Anmeldung über offd.de ist derzeit nicht möglich. "
                "Bitte versuche es später erneut.",
            )
        return render(request, self.template_name, {"form": form})


class OfficialSignUpListView(View):
    template_name = "officials/signup/sign_up_list.html"

    def get(self, request, *args, **kwargs):
        from officials.urls import OFFICIALS_MOODLE_LOGIN

        official_id = request.session.get(MOODLE_LOGGED_IN_USER)
        restored_cookie = None
        if official_id is None:
            restored = restore_moodle_session(request)
            if restored.official_id is not None:
                official_id = restored.official_id
                restored_cookie = restored.cookie_value
            else:
                response = redirect(reverse(OFFICIALS_MOODLE_LOGIN))
                if restored.matched:
                    _delete_remember_cookie(response)
                return response
        if settings.DEBUG:
            request.session.set_expiry(600000)
        else:
            request.session.set_expiry(600)
        league = request.GET.get("league")
        from officials.urls import (
            OFFICIALS_SIGN_UP_FOR_GAMEDAY,
            OFFICIALS_PROFILE_LICENSE,
            OFFICIALS_SIGN_UP_LIST,
            OFFICIALS_SIGN_UP_CANCEL_FOR_GAMEDAY,
        )

        context = {
            **OfficialSignupService.get_signup_data(official_id, league),
            "official_id": official_id,
            "url_pattern_gameday": LEAGUE_GAMEDAY_DETAIL,
            "url_pattern_signup": OFFICIALS_SIGN_UP_FOR_GAMEDAY,
            "url_pattern_signup_list": OFFICIALS_SIGN_UP_LIST,
            "url_pattern_official": OFFICIALS_PROFILE_LICENSE,
            "url_pattern_signup_cancel": OFFICIALS_SIGN_UP_CANCEL_FOR_GAMEDAY,
        }
        response = render(request, self.template_name, context)
        if restored_cookie:
            _set_remember_cookie(response, restored_cookie)
        return response


class OfficialSignOutView(View):
    def get(self, request, *args, **kwargs):
        # Revoke every selector in the raw header: legacy cookies at the old
        # path survive alongside the current one and would silently restore
        # the session after logout.
        RememberMeService.revoke_all_from_cookie_header(request.META.get("HTTP_COOKIE"))
        request.session.pop(MOODLE_LOGGED_IN_USER, None)
        messages.success(request, "Du wurdest abgemeldet.")

        from officials.urls import OFFICIALS_MOODLE_LOGIN

        response = redirect(reverse(OFFICIALS_MOODLE_LOGIN))
        _delete_remember_cookie(response)
        return response


class CheckMoodleSessionMixin:
    def get_official_id(self, request):
        official_id = request.session.get(MOODLE_LOGGED_IN_USER)
        if official_id is None:
            messages.error(
                request,
                "Die Session der Moodle-Anmeldung ist ausgelaufen. Bitte erneut anmelden.",
            )
            from officials.urls import OFFICIALS_MOODLE_LOGIN

            return redirect(reverse(OFFICIALS_MOODLE_LOGIN))
        return official_id


class OfficialSignUpView(CheckMoodleSessionMixin, View):
    def get(self, request, **kwargs):
        gameday_id = kwargs.get("gameday")
        official_id = self.get_official_id(request)
        if isinstance(official_id, HttpResponse):
            # redirect to login page
            return official_id
        try:
            OfficialSignupService.create_signup(
                gameday_id=gameday_id, official_id=official_id
            )
        except DuplicateSignupError as exception:
            messages.error(
                request, f"Du bist bereits für den Spieltag gemeldet: {exception}"
            )
        except MaxSignupError as exception:
            messages.error(request, f"{exception}")
        from officials.urls import OFFICIALS_SIGN_UP_LIST

        return redirect(reverse(OFFICIALS_SIGN_UP_LIST))


class OfficialSignUpCancelView(CheckMoodleSessionMixin, View):
    def get(self, request, **kwargs):
        gameday_id = kwargs.get("gameday")
        official_id = self.get_official_id(request)
        if isinstance(official_id, HttpResponse):
            # redirect to login page
            return official_id
        OfficialSignupService.cancel_signup(
            gameday_id=gameday_id, official_id=official_id
        )
        from officials.urls import OFFICIALS_SIGN_UP_LIST

        return redirect(reverse(OFFICIALS_SIGN_UP_LIST))
