import os

from django.conf import settings
from django.contrib.auth.mixins import UserPassesTestMixin
from django.core.cache import cache
from django.http import HttpResponse, HttpResponseNotFound
from django.shortcuts import render, redirect
from django.utils.http import url_has_allowed_host_and_scheme
from django.views import View

from gamedays.service.team_repository_service import TeamRepositoryService


def homeview(request):
    return render(request, 'homeview.html')


def robots_txt_view(request):
    """
    Serve robots.txt file.

    This view reads and serves the robots.txt file from STATIC_ROOT.
    Works in all environments (dev, test, production) without requiring DEBUG=True.
    """
    robots_path = os.path.join(settings.STATIC_ROOT, 'robots.txt')
    try:
        with open(robots_path, 'r') as f:
            content = f.read()
        return HttpResponse(content, content_type='text/plain')
    except FileNotFoundError:
        return HttpResponseNotFound('robots.txt not found')


class ClearCacheView(UserPassesTestMixin, View):

    def get(self, request):
        cache.clear()
        referer = request.META.get('HTTP_REFERER', '/')
        if url_has_allowed_host_and_scheme(referer, allowed_hosts={request.get_host()}):
            return redirect(referer)
        return redirect('/')

    def test_func(self):
        return self.request.user.is_staff


class AllTeamListView(View):
    template_name = 'team/all_teams_list.html'

    def get(self, request, **kwargs):
        all_teams = TeamRepositoryService.get_all_teams()
        context = {
            'object_list': all_teams,
            'app': kwargs.get('app'),
        }
        return render(request, self.template_name, context)
