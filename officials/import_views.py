"""Officials CSV/XLSX import orchestration, extracted verbatim from
``officials.views``. Re-exported there so ``officials/urls.py`` and existing
importers keep resolving every name.
"""

import logging
from datetime import date
from functools import partial

from django.contrib import messages
from django.contrib.auth.mixins import LoginRequiredMixin, UserPassesTestMixin
from django.db import Error as DatabaseError
from django.http import JsonResponse
from django.shortcuts import redirect, render
from django.urls import reverse
from django.utils.html import format_html, format_html_join
from django.views import View

from gamedays.models import Gameinfo
from officials.forms import GameOfficialImportUploadForm
from officials.models import Official
from officials.service.association_resolution import (
    UnknownAssociationError,
    resolve_association,
)
from officials.service.game_official_entries import AmbiguousGameOfficialError
from officials.service.game_official_import import (
    ImportColumnError,
    build_import_result,
    parse_uploaded_file,
)
from officials.service.official_service import OfficialService

# Keep the historical logger name: existing log queries and tests use it, and
# a pure move must not change observable behaviour.
logger = logging.getLogger("officials.views")


OFFICIALS_IMPORT_SESSION_KEY = "officials_import"


def _external_suggestion_to_initial(suggestion) -> dict:
    return {
        "row_number": suggestion.row_number,
        "status": suggestion.status,
        "reason": suggestion.reason,
        "include_default": suggestion.include_default,
        "official_id": suggestion.official_id,
        "official_display": suggestion.official_display,
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
        "include_default": suggestion.include_default,
        "gameinfo_id": suggestion.gameinfo_id,
        "official_id": suggestion.official_id,
        "official_display": suggestion.official_display,
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
    if isinstance(error, UnknownAssociationError):
        return "Unbekannter Verband - Zeile nicht importiert"
    if isinstance(error, DatabaseError):
        # Real production data has rows a model field can't hold as-is
        # (e.g. a free-text comment longer than 100 chars) - surfaced as
        # a per-row failure like any other, not a 500 that aborts the
        # whole batch. The driver's own text names schema internals
        # ("Data too long for column ..."), so ``_commit`` logs it with
        # the row number instead; the response stays generic (CWE-209).
        return "Datenbankfehler - Zeile vermutlich zu lang für ein Feld"
    if error.args:
        return str(error.args[0])
    return str(error)


class GameOfficialImportUploadView(LoginRequiredMixin, UserPassesTestMixin, View):
    """Step 1 of the officials self-report import: staff drop a .csv/.xlsx
    export of the Google Sheet. POST is called via fetch() (see the
    template's JS) so the browser can show a spinner while the file is
    parsed and classified, then render the result as a client-side
    stepper/tabs/pagination UI - GameOfficialImportConfirmView only ever
    sees which row_numbers ended up selected, never the classification
    itself, which stays server-authoritative in the session."""

    form_class = GameOfficialImportUploadForm
    template_name = "officials/gameofficial_import_upload.html"

    def test_func(self):
        return self.request.user.is_staff

    def get(self, request):
        return render(request, self.template_name, {"form": self.form_class()})

    def post(self, request):
        form = self.form_class(request.POST, request.FILES)
        if not form.is_valid():
            return JsonResponse({"errors": form.errors}, status=400)
        try:
            dataframe = parse_uploaded_file(form.cleaned_data["file"])
            result = build_import_result(dataframe)
        except ImportColumnError as error:
            logger.warning("Game official import rejected: %s", error)
            return JsonResponse(
                {"errors": {"file": ["Die Datei konnte nicht verarbeitet werden."]}},
                status=400,
            )

        external_items = [
            _external_suggestion_to_initial(suggestion)
            for suggestion in result.external
        ]
        internal_items = [
            _internal_fix_suggestion_to_initial(suggestion)
            for suggestion in result.internal_fix
        ]
        unclassified = [
            {"row_number": row.row_number, "reason": row.reason}
            for row in result.unclassified
        ]
        request.session[OFFICIALS_IMPORT_SESSION_KEY] = {
            "external": external_items,
            "internal_fix": internal_items,
            "unclassified": unclassified,
        }
        return JsonResponse(
            {
                "external": _group_by_status(external_items),
                "internal_fix": _group_by_status(internal_items),
                "unclassified": unclassified,
            }
        )


# Maps a suggestion's server-computed status onto the client's 3 tabs.
# "duplicate" only ever occurs on the external branch (see
# ExternalGameSuggestion/InternalFixSuggestion in game_official_import.py) -
# an internal-fix row simply never lands in that group.
STATUS_TO_GROUP = {
    "ready": "new",
    "duplicate": "duplicate",
    "needs_attention": "conflict",
}

# Bulk-committing thousands of selected rows can produce a handful of
# per-row failures (e.g. a stale Official deleted since parse time) - cap
# how many reasons get spelled out in the summary message so that a
# pathological file can't turn the message itself into another
# unbounded-size response.
IMPORT_ERROR_MESSAGE_LIMIT = 20


def _group_by_status(items: list) -> dict:
    """Buckets a branch's stored suggestion dicts into the 3 client tabs
    by their server-computed status - the client only ever uses this for
    display/selection-default purposes, never to decide what's trusted;
    GameOfficialImportConfirmView re-validates every selected row from
    scratch regardless of which tab it came from."""
    groups = {"new": [], "duplicate": [], "conflict": []}
    for item in items:
        group = STATUS_TO_GROUP.get(item.get("status"), "conflict")
        groups[group].append({k: v for k, v in item.items() if k != "status"})
    return groups


def _association_resolver():
    """Resolve each distinct sheet value at most once per confirm request.

    A real import has thousands of rows but only a handful of distinct
    association strings. Letting ExternalGameOfficialEntry.save() resolve the
    raw value per row would add 1-3 SELECTs to every entry. Failures are
    cached as errors too and re-raised per row, so _commit still reports an
    unknown association as a per-row failure instead of a 500.
    """
    cache = {}

    def resolve(value):
        if value not in cache:
            try:
                cache[value] = resolve_association(value)
            except UnknownAssociationError as error:
                cache[value] = error
        result = cache[value]
        if isinstance(result, Exception):
            raise result
        return result

    return resolve


def _external_row_data(item: dict, resolve=None) -> dict:
    """Rebuilds the ExternalGameOfficialEntry kwargs from a stored
    suggestion dict (whose date/notification_date are ISO strings, see
    _external_suggestion_to_initial). ``resolve`` turns the sheet's free-text
    association into an Association instance once per distinct value; without
    it the entry falls back to its own per-value resolver (manual entry)."""
    association = item.get("association") or ""
    if resolve is not None:
        association = resolve(association)
    return {
        "official_id": item.get("official_id"),
        "number_games": item.get("number_games"),
        "date": _parse_iso_date(item.get("date")),
        "position": item.get("position"),
        "association": association,
        "halftime_duration": item.get("halftime_duration"),
        "has_clockcontrol": bool(item.get("has_clockcontrol")),
        "is_international": bool(item.get("is_international")),
        "reporter_name": item.get("reporter_name") or "",
        "notification_date": _parse_iso_date(item.get("notification_date")),
        "comment": item.get("comment") or "",
    }


def _internal_row_data(item: dict) -> dict:
    """GameOfficialCorrectionEntry kwargs from a stored internal-fix
    suggestion dict - see _external_row_data()'s docstring."""
    return {
        "gameinfo_id": item.get("gameinfo_id"),
        "official_id": item.get("official_id"),
        "position": item.get("position"),
    }


def _parse_iso_date(value):
    return date.fromisoformat(value) if value else None


def _selected_ids(request, field_name) -> set:
    """Reads a comma-joined string of row_numbers from a single POST
    field, not one field per row_number - a real import can have
    thousands of rows selected at once (see the template's JS), and one
    hidden <input> per row hit Django's DATA_UPLOAD_MAX_NUMBER_FIELDS
    ceiling well before that, exactly the same class of hard limit the
    original per-row formset rendering hit."""
    raw = request.POST.get(field_name, "")
    return {int(value) for value in raw.split(",") if value.strip().isdigit()}


class GameOfficialImportConfirmView(LoginRequiredMixin, UserPassesTestMixin, View):
    """Step 2: commits whichever row_numbers the client-side stepper/tabs
    UI ended up with selected (see gameofficial_import_upload.html's JS) -
    regardless of which tab (new/duplicate/conflict) a row started in,
    since that classification only ever drove the *default* checkbox
    state, not what's trusted. Every selected row is validated and saved
    from scratch via ExternalGameOfficialEntry/GameOfficialCorrectionEntry,
    never from the upload-time status/reason, so staleness between upload
    and confirm (an Official deleted, a second GameOfficial added, ...)
    surfaces as a per-row error instead of a stale write or a crash."""

    def test_func(self):
        return self.request.user.is_staff

    def get(self, request):
        from officials.urls import OFFICIALS_GAMEOFFICIAL_IMPORT_UPLOAD

        return redirect(reverse(OFFICIALS_GAMEOFFICIAL_IMPORT_UPLOAD))

    def post(self, request):
        session_data = request.session.get(OFFICIALS_IMPORT_SESSION_KEY, {})
        selected_external = _selected_ids(request, "external_rows")
        selected_internal = _selected_ids(request, "internal_rows")

        official_service = OfficialService()
        resolve = _association_resolver()
        external_created, external_errors = self._commit(
            [
                item
                for item in session_data.get("external", [])
                if item.get("row_number") in selected_external
            ],
            official_service.create_external_official_entry,
            partial(_external_row_data, resolve=resolve),
        )
        internal_created, internal_errors = self._commit(
            [
                item
                for item in session_data.get("internal_fix", [])
                if item.get("row_number") in selected_internal
            ],
            official_service.create_internal_fix_entry,
            _internal_row_data,
        )

        request.session.pop(OFFICIALS_IMPORT_SESSION_KEY, None)
        if request.headers.get("X-Requested-With") == "XMLHttpRequest":
            # The review UI keeps the reviewed rows client-side and marks
            # each one with its own outcome in place (see the template's
            # JS) - answering with per-row results instead of a redirect
            # means staff actually see what the confirm did, rather than
            # only a transient toast on an otherwise empty upload page.
            return JsonResponse(
                {
                    "external": {
                        "created": external_created,
                        "errors": external_errors,
                    },
                    "internal_fix": {
                        "created": internal_created,
                        "errors": internal_errors,
                    },
                    "summary": {
                        "external_created": len(external_created),
                        "internal_created": len(internal_created),
                        "error_count": len(external_errors) + len(internal_errors),
                    },
                }
            )

        self._report_results(
            request,
            external_created_count=len(external_created),
            internal_created_count=len(internal_created),
            errors=[
                f"Zeile {entry['row_number']}: {entry['message']}"
                for entry in external_errors + internal_errors
            ],
        )
        from officials.urls import OFFICIALS_GAMEOFFICIAL_IMPORT_UPLOAD

        return redirect(reverse(OFFICIALS_GAMEOFFICIAL_IMPORT_UPLOAD))

    @staticmethod
    def _commit(items, save_entry, build_row_data) -> tuple:
        """Saves every selected row's entry from scratch, isolating each
        failure (e.g. an Official deleted since upload time) in its own
        try/except and collecting it as a {row_number, message} result
        instead of aborting the rest of the batch. Row numbers let the
        AJAX response attach each outcome to the row it belongs to."""
        created = []
        errors = []
        for item in items:
            row_number = item.get("row_number")
            try:
                created.append(
                    {
                        "row_number": row_number,
                        "message": save_entry(build_row_data(item)),
                    }
                )
            except (
                TypeError,
                ValueError,
                Gameinfo.DoesNotExist,
                Official.DoesNotExist,
                AmbiguousGameOfficialError,
                UnknownAssociationError,
                DatabaseError,
            ) as error:
                if isinstance(error, DatabaseError):
                    logger.warning(
                        "Game official import row %s hit a database error",
                        row_number,
                        exc_info=error,
                    )
                errors.append(
                    {
                        "row_number": row_number,
                        "message": _entry_error_message(error),
                    }
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
        detail = format_html_join("; ", "{}", ((line,) for line in capped))
        if remaining > 0:
            detail = format_html("{} (und {} weitere)", detail, remaining)
        messages.warning(request, format_html("{}<br>{}", summary, detail))
