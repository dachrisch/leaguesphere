"""The one definition of a temporary MySQL account name.

The app stores the name on the ledger row when the row is created; the sidecar
reads it back and mints exactly that account; the data migration backfills old
rows with the same function. Keeping the definition here (rather than in the
model or the shell) is what makes those three writers agree.

Shape::

    dbeaver_prod_<handle>_r<base36(request_id)>

Why the id is encoded in base36 and not written in decimal: MariaDB caps a user
name at 32 characters. With a 13-character prefix, a 2-character marker and a
64-bit primary key, decimal can need 19 characters and overflow; base36 needs
at most 13, which always leaves at least four characters of the human-readable
handle. The full id is included, so uniqueness is mathematical, not
probabilistic - no hash or collision window is involved. Truncation applies to
the handle only, which is a label, not a key.
"""

from __future__ import annotations

import re
import string

ACCOUNT_PREFIX = "dbeaver_prod_"
ACCOUNT_MAX_LENGTH = 32  # MariaDB user name limit
REQUEST_MARKER = "_r"

HANDLE_ALPHABET = frozenset(string.ascii_lowercase + string.digits)
HANDLE_LENGTH = ACCOUNT_MAX_LENGTH - len(ACCOUNT_PREFIX)  # 19, the legacy maximum

_B36_DIGITS = "0123456789abcdefghijklmnopqrstuvwxyz"

# Kept in sync with the guard in `deployed/dba/tick.sh`; the sidecar validates
# the stored name before it interpolates it into hand-written SQL.
NEW_ACCOUNT_RE = re.compile(r"^dbeaver_prod_[a-z0-9]*_r[0-9a-z]+$")
LEGACY_ACCOUNT_RE = re.compile(r"^dbeaver_prod_[a-z0-9]{1,19}$")


def base36(number: int) -> str:
    """Inject encoding of a non-negative integer, lowercase digits only."""
    if number < 0:
        raise ValueError("request ids are non-negative")

    if number == 0:
        return "0"

    digits: list[str] = []
    while number:
        number, remainder = divmod(number, 36)
        digits.append(_B36_DIGITS[remainder])
    return "".join(reversed(digits))


def access_handle(username: str) -> str:
    """The requester's login, sanitised to the alphabet the database accepts.

    A leading digit is legal inside ``dbeaver_prod_…`` (e.g. ``5erAdmin``), so
    it is kept. Only ASCII letters and digits survive: ``str.isalnum()`` is
    Unicode-aware and left an umlaut in a name the shell then refused.
    """
    return "".join(ch for ch in (username or "").lower() if ch in HANDLE_ALPHABET)[
        :HANDLE_LENGTH
    ]


def db_user_for(person: str, request_id: int) -> str:
    """The account that belongs to exactly this request row.

    The id suffix is authoritative. If the handle has to shrink so the whole
    name fits in 32 characters, only readability is lost - two rows can never
    arrive at the same name because their ids differ.
    """
    suffix = REQUEST_MARKER + base36(int(request_id))
    budget = ACCOUNT_MAX_LENGTH - len(ACCOUNT_PREFIX) - len(suffix)
    user = ACCOUNT_PREFIX + access_handle(person)[:budget] + suffix

    # A guard for the invariant the sidecar relies on, not a runtime check of
    # user input: base36 bounds the suffix to 13 digits for a signed 64-bit id.
    assert len(user) <= ACCOUNT_MAX_LENGTH, user
    return user


def is_legacy_db_user(user: str | None) -> bool:
    """Whether ``user`` is an old per-person name awaiting backfill."""
    return bool(user) and bool(LEGACY_ACCOUNT_RE.fullmatch(user))
