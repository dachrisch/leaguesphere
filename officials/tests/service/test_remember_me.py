from datetime import timedelta

from django.test import TestCase
from django.utils import timezone

from officials.models import MoodleRememberToken, Official
from officials.service.remember_me import RememberMeService, REMEMBER_ME_MAX_AGE
from officials.tests.setup_factories.db_setup_officials import DbSetupOfficials


class TestMoodleRememberTokenModel(TestCase):
    def setUp(self):
        DbSetupOfficials().create_officials_and_team()
        self.official = Official.objects.first()

    def test_is_expired_reflects_expires_at(self):
        past = MoodleRememberToken.objects.create(
            selector="sel-past",
            validator_hash="x",
            official=self.official,
            expires_at=timezone.now() - timedelta(seconds=1),
        )
        future = MoodleRememberToken.objects.create(
            selector="sel-future",
            validator_hash="x",
            official=self.official,
            expires_at=timezone.now() + timedelta(days=1),
        )
        assert past.is_expired() is True
        assert future.is_expired() is False

    def test_deleting_official_cascade_deletes_tokens(self):
        MoodleRememberToken.objects.create(
            selector="sel-cascade",
            validator_hash="x",
            official=self.official,
            expires_at=timezone.now() + timedelta(days=1),
        )
        self.official.delete()
        assert MoodleRememberToken.objects.filter(selector="sel-cascade").count() == 0


class TestRememberMeService(TestCase):
    def setUp(self):
        DbSetupOfficials().create_officials_and_team()
        self.official = Official.objects.first()

    def test_issue_persists_only_the_hash_not_the_raw_validator(self):
        cookie = RememberMeService.issue(self.official.pk)
        selector, validator = cookie.split(":", 1)
        token = MoodleRememberToken.objects.get(selector=selector)
        assert token.official_id == self.official.pk
        assert token.validator_hash != validator
        assert validator not in token.validator_hash
        assert token.expires_at > timezone.now()

    def test_restore_returns_official_id_for_valid_cookie(self):
        cookie = RememberMeService.issue(self.official.pk)
        result = RememberMeService.restore(cookie)
        assert result.official_id == self.official.pk
        assert result.cookie_value is not None

    def test_restore_rotates_validator_and_slides_expiry(self):
        cookie = RememberMeService.issue(self.official.pk)
        selector = cookie.split(":", 1)[0]
        original = MoodleRememberToken.objects.get(selector=selector)
        original_hash = original.validator_hash

        result = RememberMeService.restore(cookie)

        rotated = MoodleRememberToken.objects.get(selector=selector)
        assert rotated.validator_hash != original_hash
        assert rotated.expires_at > original.expires_at
        assert result.cookie_value != cookie
        assert result.cookie_value.split(":", 1)[0] == selector
        # the returned cookie must itself restore successfully
        assert RememberMeService.restore(result.cookie_value).official_id == self.official.pk

    def test_restore_misses_on_none_or_malformed(self):
        assert RememberMeService.restore(None).official_id is None
        assert RememberMeService.restore("no-colon").official_id is None
        assert RememberMeService.restore(None).matched is False

    def test_restore_misses_on_unknown_selector(self):
        result = RememberMeService.restore("unknown:whatever")
        assert result.official_id is None
        assert result.matched is False

    def test_restore_misses_on_tampered_validator(self):
        cookie = RememberMeService.issue(self.official.pk)
        selector = cookie.split(":", 1)[0]
        result = RememberMeService.restore(f"{selector}:tampered")
        assert result.official_id is None
        assert result.matched is True  # row existed → caller clears cookie

    def test_restore_deletes_and_misses_on_expired(self):
        cookie = RememberMeService.issue(self.official.pk)
        selector = cookie.split(":", 1)[0]
        MoodleRememberToken.objects.filter(selector=selector).update(
            expires_at=timezone.now() - timedelta(seconds=1)
        )
        result = RememberMeService.restore(cookie)
        assert result.official_id is None
        assert result.matched is True
        assert MoodleRememberToken.objects.filter(selector=selector).count() == 0

    def test_revoke_deletes_the_row(self):
        cookie = RememberMeService.issue(self.official.pk)
        selector = cookie.split(":", 1)[0]
        RememberMeService.revoke(cookie)
        assert MoodleRememberToken.objects.filter(selector=selector).count() == 0

    def test_prune_expired_removes_only_expired(self):
        live = RememberMeService.issue(self.official.pk)
        stale = RememberMeService.issue(self.official.pk)
        stale_selector = stale.split(":", 1)[0]
        MoodleRememberToken.objects.filter(selector=stale_selector).update(
            expires_at=timezone.now() - timedelta(seconds=1)
        )
        deleted = RememberMeService.prune_expired()
        assert deleted == 1
        assert RememberMeService.restore(live).official_id == self.official.pk
