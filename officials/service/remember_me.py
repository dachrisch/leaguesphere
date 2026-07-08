import hashlib
import hmac
import secrets
from dataclasses import dataclass
from datetime import timedelta

from django.utils import timezone

from officials.models import MoodleRememberToken

REMEMBER_ME_MAX_AGE = timedelta(days=30)


def _hash(validator: str) -> str:
    return hashlib.sha256(validator.encode()).hexdigest()


@dataclass(frozen=True)
class RestoreResult:
    official_id: int | None
    cookie_value: str | None
    matched: bool


_MISS = RestoreResult(official_id=None, cookie_value=None, matched=False)


class RememberMeService:
    @staticmethod
    def issue(official_id: int) -> str:
        selector = secrets.token_hex(16)
        validator = secrets.token_urlsafe(32)
        MoodleRememberToken.objects.create(
            selector=selector,
            validator_hash=_hash(validator),
            official_id=official_id,
            expires_at=timezone.now() + REMEMBER_ME_MAX_AGE,
        )
        return f"{selector}:{validator}"

    @staticmethod
    def restore(cookie_value: str | None) -> RestoreResult:
        if not cookie_value or ":" not in cookie_value:
            return _MISS
        selector, _, validator = cookie_value.partition(":")
        token = MoodleRememberToken.objects.filter(selector=selector).first()
        if token is None:
            return _MISS
        matched_miss = RestoreResult(official_id=None, cookie_value=None, matched=True)
        if not hmac.compare_digest(token.validator_hash, _hash(validator)):
            return matched_miss
        if token.is_expired():
            token.delete()
            return matched_miss
        # Local validity: FK CASCADE guarantees the Official still exists.
        new_validator = secrets.token_urlsafe(32)
        token.validator_hash = _hash(new_validator)
        token.expires_at = timezone.now() + REMEMBER_ME_MAX_AGE
        token.save(update_fields=["validator_hash", "expires_at"])
        return RestoreResult(
            official_id=token.official_id,
            cookie_value=f"{selector}:{new_validator}",
            matched=True,
        )

    @staticmethod
    def revoke(cookie_value: str | None) -> None:
        if not cookie_value or ":" not in cookie_value:
            return
        selector = cookie_value.split(":", 1)[0]
        MoodleRememberToken.objects.filter(selector=selector).delete()

    @staticmethod
    def prune_expired() -> int:
        deleted, _ = MoodleRememberToken.objects.filter(
            expires_at__lte=timezone.now()
        ).delete()
        return deleted
