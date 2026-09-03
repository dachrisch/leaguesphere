from datetime import date, timedelta

from django.test import SimpleTestCase

from officials.service.license_validity import is_valid_on, validity_lower_bound


class TestLicenseValidity(SimpleTestCase):
    def test_valid_on_the_exact_created_at_date(self):
        self.assertTrue(is_valid_on(date(2027, 3, 1), date(2027, 3, 1)))

    def test_valid_364_days_after_created_at(self):
        self.assertTrue(
            is_valid_on(date(2027, 3, 1), date(2027, 3, 1) + timedelta(days=364))
        )

    def test_invalid_365_days_after_created_at(self):
        self.assertFalse(
            is_valid_on(date(2027, 3, 1), date(2027, 3, 1) + timedelta(days=365))
        )

    def test_invalid_before_created_at(self):
        self.assertFalse(is_valid_on(date(2027, 3, 1), date(2027, 2, 28)))

    def test_validity_lower_bound_is_exactly_365_days_before(self):
        self.assertEqual(validity_lower_bound(date(2027, 3, 1)), date(2026, 3, 1))
