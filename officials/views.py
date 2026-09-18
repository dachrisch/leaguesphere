import json
from datetime import date, datetime, timedelta

from django.conf import settings
from django.contrib import messages
from django.contrib.auth.mixins import UserPassesTestMixin, LoginRequiredMixin
from django.core.cache import cache
from django.core.paginator import Paginator, PageNotAnInteger, EmptyPage
from django.db.models import Subquery, OuterRef, Q
from django.http import Http404, HttpResponse
from django.shortcuts import render, redirect
from django.urls import reverse
from django.utils.decorators import method_decorator
from django.utils.safestring import mark_safe
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
)
from officials.constants import OFFICIALS_STATISTICS_FOR_SEASON
from officials.forms import (
    AddInternalGameOfficialEntryForm,
    ExternalGameSuggestionFormSet,
    GameOfficialImportUploadForm,
    InternalFixSuggestionFormSet,
    MoodleLoginForm,
)
from officials.models import Official, OfficialLicenseHistory
from officials.service.boff_license_calculation import LicenseStrategy
from officials.service.game_official_entries import AmbiguousGameOfficialError
from officials.service.game_official_import import (
    ImportColumnError,
    build_import_result,
    parse_uploaded_file,
)
from officials.service.moodle.moodle_api import MoodleApiException
from officials.service.moodle.moodle_service import MoodleService
from officials.service.official_service import OfficialService
from officials.service.officials_repository_service import OfficialsRepositoryService
from officials.service.signup_service import (
    OfficialSignupService,
    DuplicateSignupError,
    MaxSignupError,
)
from officials.service.remember_me import RememberMeService, REMEMBER_ME_MAX_AGE

MOODLE_LOGGED_IN_USER = "moodle_logged_in_user"

NO_OFFICIAL_FOR_MOODLE_USER = (
    "Für diesen Moodle-Account ist kein Official hinterlegt. "
    "Bitte wende dich an die Turnierleitung."
)

MOODLE_REMEMBER_COOKIE = "officials_remember"
REMEMBER_COOKIE_PATH = "/officials/gameday/sign-up/"


def _set_remember_cookie(response, value):
    response.set_cookie(
        MOODLE_REMEMBER_COOKIE,
        value,
        max_age=int(REMEMBER_ME_MAX_AGE.total_seconds()),
        httponly=True,
        secure=not settings.DEBUG,
        samesite="Lax",
        path=REMEMBER_COOKIE_PATH,
    )


def _delete_remember_cookie(response):
    response.delete_cookie(MOODLE_REMEMBER_COOKIE, path=REMEMBER_COOKIE_PATH)


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
        # officiated_games_service's module docstring) query work only runs
        # when the section will actually be shown.
        context["show_officiated_games"] = (
            request.user.is_authenticated
            and not request.session.get(MOODLE_LOGGED_IN_USER)
        )
        if context["show_officiated_games"]:
            from matchreport.constants import REPORT_TABLE_RENDER_CONFIG
            from officials.service.officiated_games_service import (
                get_team_officiated_games,
            )

            context["officiated_games"] = get_team_officiated_games(
                team_id, year, REPORT_TABLE_RENDER_CONFIG
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


class GameOfficialListView(View):
    template_name = "officials/game_officials_list.html"

    @method_decorator(cache_page(60 * 60 * 24))
    def get(self, request, **kwargs):
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
        from officials.urls import OFFICIALS_GAME_OFFICIALS_APPEARANCE_FOR_TEAM_AND_YEAR

        context = {
            "season": year,
            "team": team,
            "team_id": team_id,
            "years": sorted(years, reverse=True),
            "url_pattern": OFFICIALS_GAME_OFFICIALS_APPEARANCE_FOR_TEAM_AND_YEAR,
            "pk": team_id,
            "object_list": GameOfficialAllInfoSerializer(
                instance=game_officials_object_list.values(
                    *GameOfficialAllInfoSerializer.ALL_VALUE_FIELDS
                ),
                display_names_for_team=team_name,
                is_staff=is_staff,
                many=True,
            ).data,
            "page_obj": game_officials_page,
        }
        return render(request, self.template_name, context)

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
        created_entries = "Folgende Einträge erzeugt: <br>"
        current_line = []
        form = AddInternalGameOfficialEntryForm(request.POST)
        data = form.data.copy()
        all_lines = data.get("entries").splitlines()
        try:
            while all_lines:
                current_line = all_lines.pop(0)
                result = [x.strip() for x in current_line.split(",")]
                created_entries += (
                    OfficialService.create_game_official_entry(result) + "<br>"
                )
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
            messages.success(self.request, mark_safe(created_entries))
        data["entries"] = "\n".join(all_lines)
        form.data = data
        return render(request, self.template_name, {"form": form})

    def test_func(self):
        return self.request.user.is_staff


OFFICIALS_IMPORT_SESSION_KEY = "officials_import"


def _external_suggestion_to_initial(suggestion) -> dict:
    return {
        "row_number": suggestion.row_number,
        "status": suggestion.status,
        "reason": suggestion.reason,
        "include": suggestion.include_default,
        "official_id": suggestion.official_id,
        "number_games": suggestion.number_games,
        "date": suggestion.date.isoformat() if suggestion.date else None,
        "position": suggestion.position,
        "association": suggestion.association,
        "halftime_duration": suggestion.halftime_duration,
        "has_clockcontrol": suggestion.has_clockcontrol,
        "is_international": suggestion.is_international,
        "reporter_name": suggestion.reporter_name,
        "notification_date": (
            suggestion.notification_date.isoformat()
            if suggestion.notification_date
            else None
        ),
        "comment": suggestion.comment,
    }


def _internal_fix_suggestion_to_initial(suggestion) -> dict:
    return {
        "row_number": suggestion.row_number,
        "status": suggestion.status,
        "reason": suggestion.reason,
        "action": suggestion.action,
        "current_official_display": suggestion.current_official_display,
        "include": suggestion.include_default,
        "gameinfo_id": suggestion.gameinfo_id,
        "official_id": suggestion.official_id,
        "position": suggestion.position,
    }


def _entry_error_message(error: Exception) -> str:
    """Maps the exceptions ExternalGameOfficialEntry/
    GameOfficialCorrectionEntry.save() can raise to a per-row message,
    mirroring AddInternalGameOfficialUpdateView's existing (gameinfo_id
    nicht gefunden! / official_id nicht gefunden!) conventions so both
    entry points read consistently to staff."""
    if isinstance(error, Gameinfo.DoesNotExist):
        return "gameinfo_id nicht gefunden!"
    if isinstance(error, Official.DoesNotExist):
        return "official_id nicht gefunden!"
    if error.args:
        return str(error.args[0])
    return str(error)


class GameOfficialImportUploadView(LoginRequiredMixin, UserPassesTestMixin, View):
    """Step 1 of the officials self-report import: staff drop a .csv/.xlsx
    export of the Google Sheet (or nothing, for the manual-entry-only
    path), it's parsed into suggestions, and the result is stashed in the
    session for GameOfficialImportPreviewView (POST-redirect-GET)."""

    form_class = GameOfficialImportUploadForm
    template_name = "officials/gameofficial_import_upload.html"

    def test_func(self):
        return self.request.user.is_staff

    def get(self, request):
        return render(request, self.template_name, {"form": self.form_class()})

    def post(self, request):
        form = self.form_class(request.POST, request.FILES)
        if form.is_valid():
            try:
                dataframe = parse_uploaded_file(form.cleaned_data["file"])
                result = build_import_result(dataframe)
            except ImportColumnError as error:
                form.add_error("file", str(error))
                return render(request, self.template_name, {"form": form})

            request.session[OFFICIALS_IMPORT_SESSION_KEY] = {
                "external": [
                    _external_suggestion_to_initial(suggestion)
                    for suggestion in result.external
                ],
                "internal_fix": [
                    _internal_fix_suggestion_to_initial(suggestion)
                    for suggestion in result.internal_fix
                ],
                "unclassified": [
                    {"row_number": row.row_number, "reason": row.reason}
                    for row in result.unclassified
                ],
            }
            from officials.urls import OFFICIALS_GAMEOFFICIAL_IMPORT_PREVIEW

            return redirect(reverse(OFFICIALS_GAMEOFFICIAL_IMPORT_PREVIEW))
        return render(request, self.template_name, {"form": form})


READY_STATUS = "ready"

# A real import file has a handful of rows needing staff attention and
# thousands that don't - so the read-only "ready" preview only ever shows
# a small sample, not the full list (see GameOfficialImportPreviewView).
READY_SAMPLE_LIMIT = 25

# Bulk-committing thousands of "ready" rows can produce a handful of
# per-row failures (e.g. a stale Official deleted since parse time) - cap
# how many reasons get spelled out in the summary message so that, unlike
# the ready rows themselves, a pathological file can't turn the message
# itself into another unbounded-size response.
IMPORT_ERROR_MESSAGE_LIMIT = 20


def _split_ready_and_review(suggestions: list) -> tuple:
    """Splits a branch's stored suggestion dicts (as written to the
    session by GameOfficialImportUploadView.post()) into the "ready"
    bucket - no conflict, nothing for staff to decide, bulk-committed on
    confirm without ever becoming a form field - and the "review" bucket
    (needs_attention/duplicate), which keeps going through the editable
    formset exactly as before. Splitting on the stored status is safe
    here (unlike at save time) because this only decides what gets
    *rendered*/bulk-attempted, not whether a row is trusted to be
    valid - every row, ready or not, is still fully re-validated by its
    own entry class before anything is written."""
    ready = [item for item in suggestions if item.get("status") == READY_STATUS]
    review = [item for item in suggestions if item.get("status") != READY_STATUS]
    return ready, review


def _ready_external_row_data(item: dict) -> dict:
    """Rebuilds the ExternalGameOfficialEntry kwargs from a stored "ready"
    suggestion dict - the same shape _save_external_rows() builds from a
    review form's cleaned_data, just sourced from the raw session dict
    (whose date/notification_date are ISO strings, see
    _external_suggestion_to_initial) since a bulk-committed ready row was
    never bound to a Django form."""
    return {
        "official_id": item.get("official_id"),
        "number_games": item.get("number_games"),
        "date": _parse_iso_date(item.get("date")),
        "position": item.get("position"),
        "association": item.get("association") or "",
        "halftime_duration": item.get("halftime_duration"),
        "has_clockcontrol": bool(item.get("has_clockcontrol")),
        "is_international": bool(item.get("is_international")),
        "reporter_name": item.get("reporter_name") or "",
        "notification_date": _parse_iso_date(item.get("notification_date")),
        "comment": item.get("comment") or "",
    }


def _ready_internal_row_data(item: dict) -> dict:
    """GameOfficialCorrectionEntry kwargs from a stored "ready" internal
    fix suggestion dict - see _ready_external_row_data()'s docstring."""
    return {
        "gameinfo_id": item.get("gameinfo_id"),
        "official_id": item.get("official_id"),
        "position": item.get("position"),
    }


def _parse_iso_date(value):
    return date.fromisoformat(value) if value else None


class GameOfficialImportPreviewView(LoginRequiredMixin, UserPassesTestMixin, View):
    """Step 2: review/edit the suggestions from step 1 (or, with nothing
    uploaded, just the one blank manual-entry row each formset's extra=1
    always provides) and confirm. Every checked, valid row is re-validated
    and saved from scratch via ExternalGameOfficialEntry /
    GameOfficialCorrectionEntry - never from the preview-time
    status/reason - so staleness between preview and confirm (an Official
    deleted, a second GameOfficial added, ...) surfaces as a per-row error
    instead of a stale write or a crash.

    Only rows that actually need a human decision ("needs_attention" or
    "duplicate") become editable formset rows. "ready" rows - the
    overwhelming majority for a real import file - are never rendered as
    form fields (a few thousand of them made the page ~23MB with 150k+ DOM
    nodes); they're shown as a capped, read-only sample and bulk-committed
    on confirm instead. See _split_ready_and_review()."""

    template_name = "officials/gameofficial_import_preview.html"

    def test_func(self):
        return self.request.user.is_staff

    def get(self, request):
        session_data = request.session.get(OFFICIALS_IMPORT_SESSION_KEY, {})
        ready_external, review_external = _split_ready_and_review(
            session_data.get("external", [])
        )
        ready_internal, review_internal = _split_ready_and_review(
            session_data.get("internal_fix", [])
        )
        context = self._context(
            external_formset=ExternalGameSuggestionFormSet(
                initial=review_external, prefix="external"
            ),
            internal_fix_formset=InternalFixSuggestionFormSet(
                initial=review_internal, prefix="internalfix"
            ),
            unclassified=session_data.get("unclassified", []),
            ready_external_count=len(ready_external),
            ready_internal_count=len(ready_internal),
            ready_external_sample=ready_external[:READY_SAMPLE_LIMIT],
            ready_internal_sample=ready_internal[:READY_SAMPLE_LIMIT],
        )
        return render(request, self.template_name, context)

    def post(self, request):
        session_data = request.session.get(OFFICIALS_IMPORT_SESSION_KEY, {})
        ready_external, review_external = _split_ready_and_review(
            session_data.get("external", [])
        )
        ready_internal, review_internal = _split_ready_and_review(
            session_data.get("internal_fix", [])
        )
        unclassified = session_data.get("unclassified", [])

        external_formset = ExternalGameSuggestionFormSet(
            request.POST, prefix="external"
        )
        internal_fix_formset = InternalFixSuggestionFormSet(
            request.POST, prefix="internalfix"
        )

        official_service = OfficialService()
        review_external_created = []
        review_internal_created = []
        any_row_error = not external_formset.is_valid()
        if not any_row_error:
            any_row_error = self._save_external_rows(
                external_formset, official_service, review_external_created
            )

        internal_fix_error = not internal_fix_formset.is_valid()
        if not internal_fix_error:
            internal_fix_error = self._save_internal_fix_rows(
                internal_fix_formset, official_service, review_internal_created
            )
        any_row_error = any_row_error or internal_fix_error

        if any_row_error:
            context = self._context(
                external_formset=external_formset,
                internal_fix_formset=internal_fix_formset,
                unclassified=unclassified,
                ready_external_count=len(ready_external),
                ready_internal_count=len(ready_internal),
                ready_external_sample=ready_external[:READY_SAMPLE_LIMIT],
                ready_internal_sample=ready_internal[:READY_SAMPLE_LIMIT],
            )
            return render(request, self.template_name, context)

        ready_external_created, ready_external_errors = self._bulk_save_ready(
            ready_external,
            official_service.create_external_official_entry,
            _ready_external_row_data,
        )
        ready_internal_created, ready_internal_errors = self._bulk_save_ready(
            ready_internal,
            official_service.create_internal_fix_entry,
            _ready_internal_row_data,
        )

        request.session.pop(OFFICIALS_IMPORT_SESSION_KEY, None)
        self._report_results(
            request,
            external_created_count=len(review_external_created)
            + len(ready_external_created),
            internal_created_count=len(review_internal_created)
            + len(ready_internal_created),
            errors=ready_external_errors + ready_internal_errors,
        )
        from officials.urls import OFFICIALS_GAMEOFFICIAL_IMPORT_UPLOAD

        return redirect(reverse(OFFICIALS_GAMEOFFICIAL_IMPORT_UPLOAD))

    @staticmethod
    def _save_external_rows(formset, official_service, created_entries) -> bool:
        any_error = False
        for form in formset:
            cleaned = form.cleaned_data
            if not cleaned or not cleaned.get("include"):
                continue
            try:
                created_entries.append(
                    official_service.create_external_official_entry(
                        {
                            "official_id": cleaned.get("official_id"),
                            "number_games": cleaned.get("number_games"),
                            "date": cleaned.get("date"),
                            "position": cleaned.get("position"),
                            "association": cleaned.get("association") or "",
                            "halftime_duration": cleaned.get("halftime_duration"),
                            "has_clockcontrol": bool(cleaned.get("has_clockcontrol")),
                            "is_international": bool(cleaned.get("is_international")),
                            "reporter_name": cleaned.get("reporter_name") or "",
                            "notification_date": cleaned.get("notification_date"),
                            "comment": cleaned.get("comment") or "",
                        }
                    )
                )
            except (TypeError, ValueError, Official.DoesNotExist) as error:
                any_error = True
                form.add_error(None, _entry_error_message(error))
        return any_error

    @staticmethod
    def _save_internal_fix_rows(formset, official_service, created_entries) -> bool:
        any_error = False
        for form in formset:
            cleaned = form.cleaned_data
            if not cleaned or not cleaned.get("include"):
                continue
            try:
                created_entries.append(
                    official_service.create_internal_fix_entry(
                        {
                            "gameinfo_id": cleaned.get("gameinfo_id"),
                            "official_id": cleaned.get("official_id"),
                            "position": cleaned.get("position"),
                        }
                    )
                )
            except (
                TypeError,
                ValueError,
                Gameinfo.DoesNotExist,
                Official.DoesNotExist,
                AmbiguousGameOfficialError,
            ) as error:
                any_error = True
                form.add_error(None, _entry_error_message(error))
        return any_error

    @staticmethod
    def _bulk_save_ready(items, save_entry, build_row_data) -> tuple:
        """Commits every "ready" row's entry from scratch, exactly like
        _save_external_rows()/_save_internal_fix_rows() do for a checked
        review row - except there's no form to attach a per-row error to,
        so each failure (e.g. an Official deleted since parse time) is
        isolated in its own try/except and collected as a plain message
        instead, letting the rest of the batch keep going."""
        created = []
        errors = []
        for item in items:
            try:
                created.append(save_entry(build_row_data(item)))
            except (
                TypeError,
                ValueError,
                Gameinfo.DoesNotExist,
                Official.DoesNotExist,
                AmbiguousGameOfficialError,
            ) as error:
                errors.append(
                    f"Zeile {item.get('row_number')}: {_entry_error_message(error)}"
                )
        return created, errors

    @staticmethod
    def _report_results(
        request, external_created_count, internal_created_count, errors
    ) -> None:
        """Reports the outcome as counts, not one message line per created
        row - a bulk import can create thousands of rows, and joining a
        line per row (the AddInternalGameOfficialUpdateView-style pattern
        used for small manual batches) would just recreate an
        unbounded-size response in the success message itself."""
        summary = (
            f"{external_created_count} externe Einsätze erstellt, "
            f"{internal_created_count} Korrekturen angewendet, "
            f"{len(errors)} Fehler."
        )
        if not errors:
            messages.success(request, summary)
            return
        capped = errors[:IMPORT_ERROR_MESSAGE_LIMIT]
        remaining = len(errors) - len(capped)
        detail = "; ".join(capped)
        if remaining > 0:
            detail += f" (und {remaining} weitere)"
        messages.warning(request, mark_safe(f"{summary}<br>{detail}"))

    @staticmethod
    def _context(
        external_formset,
        internal_fix_formset,
        unclassified,
        ready_external_count=0,
        ready_internal_count=0,
        ready_external_sample=None,
        ready_internal_sample=None,
    ) -> dict:
        return {
            "external_formset": external_formset,
            "internal_fix_formset": internal_fix_formset,
            "unclassified": unclassified,
            "ready_external_count": ready_external_count,
            "ready_internal_count": ready_internal_count,
            "ready_external_sample": ready_external_sample or [],
            "ready_internal_sample": ready_internal_sample or [],
        }


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
        ).data
        from officials.urls import OFFICIALS_PROFILE_GAMELIST

        return render(
            request,
            self.template_name,
            context={
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
            },
        )


class OfficialAssociationListView(View):
    template_name = "officials/association_list.html"

    def get(self, request, *args, **kwargs):
        association_abbreviation = kwargs.get("abbr")
        year = datetime.today().year
        valid_licenses = OfficialLicenseHistory.objects.filter(
            created_at__gt=f"{year - 1}-04-01"
        ).exclude(license__id=4)
        officials_with_valid_licenses = valid_licenses.values("official").distinct()
        official_list = Official.objects.filter(
            Q(
                id__in=officials_with_valid_licenses,
                team__association__abbr=association_abbreviation,
            )
            | Q(
                id__in=officials_with_valid_licenses,
                team=Official.OHNE_TEAM_ID,
                association__abbr=association_abbreviation,
            )
        ).order_by("team__description", "last_name")
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
        return render(request, self.template_name, {"form": MoodleLoginForm()})

    def post(self, request, *args, **kwargs):
        form = MoodleLoginForm(request.POST)
        try:
            if form.is_valid():
                username = form.cleaned_data["username"]
                password = form.cleaned_data["password"]
                moodle_service = MoodleService()
                official_id = moodle_service.login(username, password)
                request.session[MOODLE_LOGGED_IN_USER] = official_id

                from officials.urls import OFFICIALS_SIGN_UP_LIST

                response = redirect(reverse(OFFICIALS_SIGN_UP_LIST))
                if form.cleaned_data.get("remember_me"):
                    _set_remember_cookie(response, RememberMeService.issue(official_id))
                return response
        except MoodleApiException as error:
            form.add_error("", f"{error}")
        except Official.DoesNotExist:
            form.add_error("", NO_OFFICIAL_FOR_MOODLE_USER)
        return render(request, self.template_name, {"form": form})


class OfficialSignUpListView(View):
    template_name = "officials/signup/sign_up_list.html"

    def get(self, request, *args, **kwargs):
        from officials.urls import OFFICIALS_MOODLE_LOGIN

        official_id = request.session.get(MOODLE_LOGGED_IN_USER)
        restored_cookie = None
        if official_id is None:
            result = RememberMeService.restore(
                request.COOKIES.get(MOODLE_REMEMBER_COOKIE)
            )
            if result.official_id is not None:
                official_id = result.official_id
                request.session[MOODLE_LOGGED_IN_USER] = official_id
                restored_cookie = result.cookie_value
            else:
                response = redirect(reverse(OFFICIALS_MOODLE_LOGIN))
                if result.matched:
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
        RememberMeService.revoke(request.COOKIES.get(MOODLE_REMEMBER_COOKIE))
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
