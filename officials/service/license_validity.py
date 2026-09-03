"""Shared license-validity window logic.

Used both by the correlated SQL subquery in
matchreport/service/model_wrapper.py and by the in-Python resolution in
officials/service/officials_compliance_service.py, so the two can't
silently drift apart. A license obtained on `created_at` is valid through
approximately one year later (`timedelta(days=365)`), matching the
long-standing convention already used elsewhere in this app (e.g.
officials/views.py's `year_before_course_date`,
officials/service/officials_repository_service.py's expiration cutoff).
"""

from datetime import date, timedelta


def validity_lower_bound(on_date: date) -> date:
    """The latest possible created_at date that is already *too old* to be
    valid on `on_date`: exactly 365 days before it."""
    return on_date - timedelta(days=365)


def is_valid_on(created_at: date, on_date: date) -> bool:
    """Whether a license obtained on `created_at` is still valid on
    `on_date` - valid from created_at through approximately one year
    later."""
    return created_at <= on_date and created_at > validity_lower_bound(on_date)
