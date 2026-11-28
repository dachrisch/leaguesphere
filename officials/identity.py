"""Who is signed in as an official.

Officials log in through Moodle, not Django: the only link between a visitor
and an ``Official`` row is one session key. This module is the single owner
of that key, so other apps (``home``) and the future RBAC identity link
(``Official.user``, #2594) have one place to read and change it instead of
importing a constant from a view module (architecture scan 2026-11-28, B12).
"""

from officials.constants import MOODLE_LOGGED_IN_USER


def acting_official_id(request) -> int | None:
    """The Official the Moodle session is logged in as, if any."""
    return request.session.get(MOODLE_LOGGED_IN_USER)


def sign_in_official(request, official_id: int, rotate_session: bool = True) -> None:
    """Record ``official_id`` as signed in.

    ``rotate_session`` cycles the session key first: signing in crosses a
    privilege boundary, so a fixated anonymous session must not carry over.
    """
    if rotate_session:
        request.session.cycle_key()
    request.session[MOODLE_LOGGED_IN_USER] = official_id


def sign_out_official(request) -> None:
    request.session.pop(MOODLE_LOGGED_IN_USER, None)
