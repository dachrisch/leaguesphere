"""The staff-only surface of the temporary-access flow.

Four actions, each of which writes an ``AccessEvent``: ask, decide, reveal,
revoke. Nothing here talks to MySQL - minting is the sidecar's job, and this app
has no privilege to create an account with.
"""

from __future__ import annotations

from django.contrib import messages
from django.contrib.auth.mixins import LoginRequiredMixin, UserPassesTestMixin
from django.http import HttpResponseForbidden
from django.shortcuts import get_object_or_404, redirect, render
from django.views.generic import DetailView, ListView
from django.views.generic.edit import CreateView

from dbaccess.forms import AccessRequestForm
from dbaccess.models import AccessRequest

APPROVE_PERMISSION = "dbaccess.approve_requests"


def can_approve(user) -> bool:
    return user.is_authenticated and (
        user.has_perm(APPROVE_PERMISSION) or user.is_superuser
    )


def _ip(request) -> str | None:
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR", "")
    return (forwarded.split(",")[0].strip() or request.META.get("REMOTE_ADDR")) or None


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

    def form_valid(self, form):
        request_obj = form.save(commit=False)
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
        context["can_approve"] = can_approve(self.request.user) and (
            self.object.approver_id is None
        )
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
            return HttpResponseForbidden("Approver permission required.")
        if access_request.requester_id == request.user.id:
            return HttpResponseForbidden("You cannot decide your own request.")
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
            {"access_request": access_request, "password": password},
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
