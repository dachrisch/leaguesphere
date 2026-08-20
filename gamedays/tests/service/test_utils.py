from datetime import UTC, datetime

from gamedays.service.utils import utc_time_as_iso


class TestUtcTimeAsIso:
    def test_recombines_time_with_reference_date(self):
        time_value = datetime(2026, 8, 15, 9, 5, 0, tzinfo=UTC).time()
        ref_now = datetime(2026, 8, 15, 9, 10, 0, tzinfo=UTC)
        assert utc_time_as_iso(time_value, ref_now=ref_now) == (
            "2026-08-15T09:05:00+00:00"
        )

    def test_accepts_datetime_instead_of_time(self):
        time_value = datetime(2026, 8, 15, 9, 5, 0, tzinfo=UTC)
        ref_now = datetime(2026, 8, 15, 9, 10, 0, tzinfo=UTC)
        assert utc_time_as_iso(time_value, ref_now=ref_now) == (
            "2026-08-15T09:05:00+00:00"
        )

    def test_near_utc_midnight_uses_previous_day(self):
        # Serialized at 00:05 UTC on Oct 25 (after UTC midnight, before the
        # 01:00 UTC Europe/Berlin DST-end instant): the 23:50 UTC event must be
        # dated Oct 24 so the frontend resolves the correct CEST offset.
        time_value = datetime(2026, 10, 24, 23, 50, 0, tzinfo=UTC).time()
        ref_now = datetime(2026, 10, 25, 0, 5, 0, tzinfo=UTC)
        assert utc_time_as_iso(time_value, ref_now=ref_now) == (
            "2026-10-24T23:50:00+00:00"
        )

    def test_near_utc_midnight_uses_next_day(self):
        # Serialized at 23:55 UTC on Oct 24: the 00:05 UTC event is dated Oct 25.
        time_value = datetime(2026, 10, 25, 0, 5, 0, tzinfo=UTC).time()
        ref_now = datetime(2026, 10, 24, 23, 55, 0, tzinfo=UTC)
        assert utc_time_as_iso(time_value, ref_now=ref_now) == (
            "2026-10-25T00:05:00+00:00"
        )
