"""The staff-only surface of the temporary-access flow.

Four actions, each of which writes an ``AccessEvent``: ask, decide, reveal,
revoke. Nothing here talks to MySQL - minting is the sidecar's job, and this app
has no privilege to create an account with.
"""

from __future__ import annotations

from django.conf import settings
from django.contrib import messages
from django.contrib.auth.mixins import LoginRequiredMixin, UserPassesTestMixin
from django.http import HttpResponseForbidden
from django.db import connection
from django.shortcuts import get_object_or_404, redirect, render
from django.views.generic import DetailView, ListView
from django.views.generic.edit import CreateView

from dbaccess.forms import AccessRequestForm
from dbaccess.models import AccessRequest, access_handle

APPROVE_PERMISSION = "dbaccess.approve_requests"


def can_approve(user) -> bool:
    return user.is_authenticated and (
        user.has_perm(APPROVE_PERMISSION) or user.is_superuser
    )


def _ip(request) -> str | None:
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR", "")
    return (forwarded.split(",")[0].strip() or request.META.get("REMOTE_ADDR")) or None


def _forbidden(request, title: str, detail: str, access_request=None):
    """A refusal that still looks like the app.

    The status stays 403 - this is a real refusal, not a redirect - but a bare
    ``HttpResponseForbidden`` dropped the person on a page with no header, no
    way back and no explanation.
    """
    return render(
        request,
        "dbaccess/forbidden.html",
        {"title": title, "detail": detail, "access_request": access_request},
        status=403,
    )


class StaffRequiredMixin(LoginRequiredMixin, UserPassesTestMixin):
    login_url = "login"

    def test_func(self):
        return self.request.user.is_staff


class RequestListView(StaffRequiredMixin, ListView):
    template_name = "dbaccess/request_list.html"
    context_object_name = "requests"

    def get_queryset(self):
        # Approvers see the queue; everybody sees their own history.
        if can_approve(self.request.user):
            return AccessRequest.objects.all()[:100]
        return AccessRequest.objects.filter(requester=self.request.user)[:100]

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["pending"] = AccessRequest.objects.pending()
        context["can_approve"] = can_approve(self.request.user)
        return context


class RequestCreateView(StaffRequiredMixin, CreateView):
    model = AccessRequest
    form_class = AccessRequestForm
    template_name = "dbaccess/request_form.html"

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["handle"] = access_handle(self.request.user.username)
        return context

    def form_valid(self, form):
        handle = access_handle(self.request.user.username)
        if not handle:
            form.add_error(
                None,
                "Your login name has no letters or digits in it, so no database account "
                "can be named after you. Ask an admin to rename the account first.",
            )
            return self.form_invalid(form)

        request_obj = form.save(commit=False)
        request_obj.person = handle
        request_obj.requester = self.request.user
        request_obj.state = AccessRequest.State.REQUESTED
        request_obj.save()
        request_obj.log(
            self.request.user.username,
            "requested",
            detail=f"tables: {request_obj.tables_csv}; ttl: {request_obj.ttl_hours}h",
            from_ip=_ip(self.request),
        )
        messages.success(self.request, "Request submitted for approval.")
        return redirect("dbaccess-detail", pk=request_obj.pk)


class RequestDetailView(StaffRequiredMixin, DetailView):
    model = AccessRequest
    template_name = "dbaccess/request_detail.html"
    context_object_name = "access_request"

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        is_mine = self.object.requester_id == self.request.user.id
        may_approve = can_approve(self.request.user)
        # The two-person rule is enforced in DecideView; the button simply must
        # not be offered to the person who asked.
        context["can_approve"] = may_approve and not is_mine and (
            self.object.approver_id is None
        )
        context["is_mine"] = is_mine
        context["may_reveal"] = self.object.can_be_revealed_by(self.request.user)
        context["events"] = self.object.events.all()[:25]
        return context


class DecideView(StaffRequiredMixin, DetailView):
    """Approve or reject. POST only, and never your own request."""

    model = AccessRequest
    http_method_names = ["post"]

    def post(self, request, *args, **kwargs):
        access_request = get_object_or_404(AccessRequest, pk=kwargs["pk"])
        decision = request.POST.get("decision")

        if not can_approve(request.user):
            return _forbidden(
                request,
                "Approver permission required",
                "Approving and rejecting are limited to people holding the "
                "dbaccess.approve_requests permission.",
            )
        if access_request.requester_id == request.user.id:
            return _forbidden(
                request,
                "You cannot decide your own request",
                "Temporary production access needs a second person to agree. "
                "Someone else has to approve or reject this one.",
                access_request=access_request,
            )
        if access_request.state != AccessRequest.State.REQUESTED:
            messages.error(request, "Only a requested session can be decided.")
            return redirect("dbaccess-detail", pk=access_request.pk)

        if decision == "approve":
            access_request.state = AccessRequest.State.APPROVED
            access_request.approver = request.user
        else:
            access_request.state = AccessRequest.State.REJECTED
            access_request.approver = request.user
        access_request.save(update_fields=["state", "approver", "updated_at"])
        access_request.log(
            request.user.username,
            decision or "unknown",
            detail=request.POST.get("reason", "")[:500],
            from_ip=_ip(request),
        )
        return redirect("dbaccess-detail", pk=access_request.pk)


class RevealView(StaffRequiredMixin, DetailView):
    model = AccessRequest
    http_method_names = ["post"]

    def post(self, request, *args, **kwargs):
        access_request = get_object_or_404(AccessRequest, pk=kwargs["pk"])
        if not access_request.can_be_revealed_by(request.user):
            return HttpResponseForbidden()
        if access_request.state not in AccessRequest.LIVE_STATES:
            messages.error(request, "This session has no live credential.")
            return redirect("dbaccess-detail", pk=access_request.pk)

        password = access_request.reveal()
        access_request.log(
            request.user.username, "revealed", from_ip=_ip(request)
        )
        return render(
            request,
            "dbaccess/request_reveal.html",
            {
                "access_request": access_request,
                "password": password,
                "db_name": connection.settings_dict["NAME"],
                "tunnel": {
                    "host": settings.DBACCESS_TUNNEL_HOST,
                    "user": settings.DBACCESS_TUNNEL_USER,
                    "port": settings.DBACCESS_TUNNEL_PORT,
                    "key_item": settings.DBACCESS_TUNNEL_KEY_ITEM,
                },
            },
        )


class RevokeView(StaffRequiredMixin, DetailView):
    model = AccessRequest
    http_method_names = ["post"]

    def post(self, request, *args, **kwargs):
        access_request = get_object_or_404(AccessRequest, pk=kwargs["pk"])
        if not (
            access_request.can_be_revealed_by(request.user) or can_approve(request.user)
        ):
            return HttpResponseForbidden()
        if access_request.state in (
            AccessRequest.State.ACTIVE,
            AccessRequest.State.APPROVED,
        ):
            access_request.state = AccessRequest.State.REVOKE_REQUESTED
            access_request.save(update_fields=["state", "updated_at"])
            access_request.log(
                request.user.username, "revoke_requested", from_ip=_ip(request)
            )
        return redirect("dbaccess-detail", pk=access_request.pk)


def index(request):
    """Small landing redirect so /dbaccess/ is never a 404."""
    if not request.user.is_authenticated:
        return redirect("login")
    return redirect("dbaccess-list")
