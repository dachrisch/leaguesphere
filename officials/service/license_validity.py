"""Shared license-validity window logic.

Used both by the correlated SQL subquery in
matchreport/service/model_wrapper.py and by the in-Python resolution in
officials/service/officials_compliance_service.py, so the two can't
silently drift apart. Matches the calendar-year rule already defined by
OfficialLicenseHistory.valid_until() - a license obtained on `created_at`
stays valid through the same month/day one year later - rather than an
approximate `timedelta(days=365)` window, which is one day off across any
Feb 29 the window happens to cross.
"""

from datetime import date


def validity_lower_bound(on_date: date) -> date:
    """The latest possible created_at date that is already *too old* to be
    valid on `on_date`: a license created exactly one year before (same
    month/day) has `valid_until() == on_date`, itself no longer valid, so
    the true earliest still-valid created_at is any date strictly after
    this one."""
    try:
        return on_date.replace(year=on_date.year - 1)
    except ValueError:
        # on_date is Feb 29 and the previous year isn't a leap year.
        return on_date.replace(year=on_date.year - 1, month=2, day=28)


def is_valid_on(created_at: date, on_date: date) -> bool:
    """Whether a license obtained on `created_at` is still valid on
    `on_date`, per the same calendar-year rule as
    OfficialLicenseHistory.valid_until()."""
    return created_at <= on_date and created_at > validity_lower_bound(on_date)
