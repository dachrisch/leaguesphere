from datetime import date

from django.test import SimpleTestCase

from officials.service.license_validity import is_valid_on, validity_lower_bound


class TestLicenseValidity(SimpleTestCase):
    def test_valid_on_the_exact_created_at_date(self):
        self.assertTrue(is_valid_on(date(2027, 3, 1), date(2027, 3, 1)))

    def test_valid_the_day_before_the_calendar_year_anniversary(self):
        self.assertTrue(is_valid_on(date(2027, 3, 1), date(2028, 2, 29)))

    def test_invalid_on_the_exact_one_year_anniversary(self):
        # Matches OfficialLicenseHistory.valid_until(): valid_until is the
        # first day the license is NO LONGER valid.
        self.assertFalse(is_valid_on(date(2027, 3, 1), date(2028, 3, 1)))

    def test_invalid_before_created_at(self):
        self.assertFalse(is_valid_on(date(2027, 3, 1), date(2027, 2, 28)))

    def test_leap_day_crossing_does_not_exclude_a_still_valid_license(self):
        # Regression: a naive `on_date - timedelta(days=365)` cutoff is one
        # day too strict whenever the window crosses Feb 29 - a license
        # obtained 2024-01-01 (2024 is a leap year) must still be valid on
        # 2024-12-31, its true calendar-year anniversary being 2025-01-01.
        self.assertTrue(is_valid_on(date(2024, 1, 1), date(2024, 12, 31)))

    def test_validity_lower_bound_handles_feb_29_on_date(self):
        # on_date itself falling on a leap day must not raise - falls back
        # to Feb 28 of the previous (non-leap) year.
        self.assertEqual(validity_lower_bound(date(2028, 2, 29)), date(2027, 2, 28))
