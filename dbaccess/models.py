"""Temporary prod-database access: the request, its approval, and its account.

Three writers touch these tables, and only one of them is this app:

* the **web app** (here) records intent, approval and the audit trail;
* the **``db-access`` sidecar** (``deployed/dba/tick.sh``) reads ``approved``
  rows, mints the MySQL account and writes the outcome back;
* the **host reaper** drops accounts whose ``created_at`` is older than a
  constant it owns - it does not read ``expires_at``, so a bug or a compromise
  here can shorten a session but never extend one.

The design and the reasoning behind that split live in
``docs/plans/2026-10-25-prod-db-temp-credentials.md`` (infrastructure repo).
"""

from __future__ import annotations

import datetime as dt

from cryptography.fernet import Fernet
from django.conf import settings
from django.contrib.auth.models import User
from django.core.exceptions import ImproperlyConfigured
from django.db import models
from django.utils import timezone

# Hard cap, mirrored from the plan. The database constraint below pins it so a
# form bug cannot mint a longer session; the reaper enforces the same number
# on the host with no knowledge of this file.
TTL_CAP_HOURS = 8


class AccessRequestQuerySet(models.QuerySet):
    def pending(self):
        return self.filter(state=AccessRequest.State.REQUESTED)

    def live(self):
        return self.filter(state=AccessRequest.State.ACTIVE)


class AccessRequest(models.Model):
    """One request for one person, from intent to a dropped account."""

    class State(models.TextChoices):
        DRAFT = "draft", "Draft"
        REQUESTED = "requested", "Requested"
        APPROVED = "approved", "Approved"
        ACTIVE = "active", "Active"
        REVOKE_REQUESTED = "revoke_requested", "Revoke requested"
        EXPIRED = "expired", "Expired"
        DROPPED = "dropped", "Dropped"
        REJECTED = "rejected", "Rejected"
        FAILED = "failed", "Failed"

    # States in which a credential may still exist.
    LIVE_STATES = (State.APPROVED, State.ACTIVE, State.REVOKE_REQUESTED)

    requester = models.ForeignKey(
        User, on_delete=models.PROTECT, related_name="dbaccess_requests"
    )
    approver = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="dbaccess_approvals",
    )
    person = models.CharField(
        max_length=21,
        help_text="Handle the MySQL account is derived from: dbeaver_prod_<person>",
    )
    purpose = models.TextField()
    ticket_url = models.URLField(blank=True)
    tables_csv = models.TextField(help_text="Comma-separated table names")
    ttl_hours = models.PositiveSmallIntegerField(default=4)

    state = models.CharField(
        max_length=20, choices=State.choices, default=State.DRAFT, db_index=True
    )
    failure_reason = models.TextField(blank=True)

    db_user = models.CharField(max_length=32, blank=True, null=True)
    grant_host = models.CharField(max_length=32, blank=True, null=True)
    # Plaintext only until the first reveal; then it lives encrypted in
    # secret_ct, so an hourly database backup captures ciphertext, not a
    # credential the sidecar has already made obsolete.
    secret = models.TextField(blank=True, null=True)
    secret_ct = models.TextField(blank=True, null=True)

    # The reaper's clock. Never derived from anything the UI can edit.
    created_at = models.DateTimeField(auto_now_add=True)
    activated_at = models.DateTimeField(null=True, blank=True)
    dropped_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = AccessRequestQuerySet.as_manager()

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["state", "created_at"])]
        permissions = [
            ("approve_requests", "Can approve temporary database access requests"),
        ]
        constraints = [
            # A two-person rule a view can bypass is not a rule.
            models.CheckConstraint(
                condition=models.Q(approver__isnull=True)
                | ~models.Q(approver=models.F("requester")),
                name="dbaccess_approver_is_not_requester",
            ),
            models.CheckConstraint(
                condition=models.Q(ttl_hours__gte=1)
                & models.Q(ttl_hours__lte=TTL_CAP_HOURS),
                name="dbaccess_ttl_within_cap",
            ),
        ]

    def __str__(self):
        return f"{self.person} ({self.state})"

    # --- derived ----------------------------------------------------------
    def tables(self) -> list[str]:
        return [t.strip() for t in (self.tables_csv or "").split(",") if t.strip()]

    @property
    def expires_at(self):
        """When the account stops working, for display only.

        The reaper recomputes this from ``created_at`` plus its own constant, so
        the value here can be wrong in the safe direction and nothing breaks.
        """
        hours = min(int(self.ttl_hours or 0), TTL_CAP_HOURS)
        return self.created_at + dt.timedelta(hours=hours)

    @property
    def is_live(self) -> bool:
        return self.state in self.LIVE_STATES and timezone.now() < self.expires_at

    def can_be_revealed_by(self, user) -> bool:
        return user in (self.requester, self.approver) or user.is_superuser

    # --- credential ------------------------------------------------------
    @staticmethod
    def _fernet() -> Fernet:
        key = getattr(settings, "DBACCESS_SECRET_KEY", None)
        if not key:
            raise ImproperlyConfigured(
                "DBACCESS_SECRET_KEY is not set - the one-time credential reveal "
                "cannot work without it."
            )
        return Fernet(key.encode())

    def reveal(self) -> str | None:
        """Return the password, moving it out of the plaintext column first.

        Repeat reveals decrypt ``secret_ct`` and are logged by the caller: the
        property we preserve is "the database never holds it in the clear after
        the first read", not "you can only ever see it once" (a DBeaver restart
        would otherwise force a whole new request).
        """
        if self.secret:
            fernet = self._fernet()
            self.secret_ct = fernet.encrypt(self.secret.encode()).decode()
            self.secret = None
            self.save(update_fields=["secret", "secret_ct", "updated_at"])
        if not self.secret_ct:
            return None
        return self._fernet().decrypt(self.secret_ct.encode()).decode()

    # --- audit -----------------------------------------------------------
    def log(self, actor: str, action: str, detail: str = "", from_ip: str | None = None):
        return AccessEvent.objects.create(
            request=self,
            actor=actor,
            action=action,
            detail=detail,
            from_ip=from_ip,
        )


class GrantableTable(models.Model):
    """Curated allow-list: what a request may even ask for.

    The sidecar re-validates every name against ``information_schema`` as well,
    so this list is the policy and that check is the enforcement.
    """

    name = models.CharField(max_length=64, unique=True)
    label = models.CharField(max_length=120, blank=True)
    grantable = models.BooleanField(default=True)
    note = models.CharField(max_length=200, blank=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.label or self.name


class AccessEvent(models.Model):
    """Append-only. With no binlog before 2026-10-26 this was the only record."""

    request = models.ForeignKey(
        AccessRequest, on_delete=models.CASCADE, related_name="events"
    )
    at = models.DateTimeField(auto_now_add=True)
    actor = models.CharField(max_length=64, help_text='username, or "system"')
    action = models.CharField(max_length=32)
    detail = models.TextField(blank=True)
    from_ip = models.GenericIPAddressField(null=True, blank=True)

    class Meta:
        ordering = ["-at"]

    def __str__(self):
        return f"{self.at:%Y-%m-%d %H:%M} {self.actor} {self.action}"
