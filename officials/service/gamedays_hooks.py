"""officials implementations of gamedays hooks (Phase 1, #2537)."""

from __future__ import annotations

from gamedays.service import detail_context, registry
from league_manager.utils.url_service import UrlService
from officials.service.signup_service import OfficialSignupService
from officials.urls import OFFICIALS_PROFILE_LICENSE, OFFICIALS_SIGN_UP_LIST


def detail_contributor(draft):
    show_official_names = False
    if draft.request.user.is_staff:
        show_official_names = True
    elif draft.request.user.username:
        try:
            # Use the raw table: the original view ran this membership check
            # before TableContextBuilder.build() converted the DataFrame.
            show_official_names = draft.request.user.username in draft.raw_qualify_table
        except TypeError:
            show_official_names = False

    draft.officials = OfficialSignupService.get_signed_up_officials(
        draft.gameday.pk, show_official_names
    )
    draft.url_pattern_official = OFFICIALS_PROFILE_LICENSE
    draft.url_pattern_official_signup = UrlService.build_absolute_url(
        OFFICIALS_SIGN_UP_LIST
    )
    if draft.allow_officials_to_register is False:
        draft.officials = []
        draft.url_pattern_official = ""
        draft.url_pattern_official_signup = ""


def register():
    detail_context.register_contributor("officials", 20, detail_contributor)
    registry.register("detail_signups", detail_contributor, "officials")
