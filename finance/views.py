from django.shortcuts import render, get_object_or_404, redirect
from django.views.generic import ListView, DetailView, CreateView, UpdateView, DeleteView
from django.contrib.auth.mixins import LoginRequiredMixin, UserPassesTestMixin
from django.urls import reverse_lazy
from django.db.models import Count
from .models import LeagueSeasonFinancialConfig, LeagueSeasonDiscount, FinancialSettings
from .services import FinanceService
from .forms import FinancialConfigForm, DiscountForm, GlobalSettingsForm
from gamedays.models import Gameday, Gameresult

class StaffRequiredMixin(UserPassesTestMixin):
    def test_func(self):
        return self.request.user.is_staff

class FinanceDashboardView(LoginRequiredMixin, StaffRequiredMixin, ListView):
    model = LeagueSeasonFinancialConfig
    template_name = 'finance/dashboard.html'
    context_object_name = 'configs'

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        configs_with_stats = []
        total_gross = 0
        total_discount = 0
        total_net = 0

        for config in self.get_queryset():
            stats = FinanceService.calculate_costs(config)
            configs_with_stats.append({
                'config': config,
                'stats': stats
            })
            total_gross += stats['gross']
            total_discount += stats['discount']
            total_net += stats['net']

        context['configs_with_stats'] = configs_with_stats
        context['total_gross'] = total_gross
        context['total_discount'] = total_discount
        context['total_net'] = total_net
        context['create_form'] = FinancialConfigForm()

        # Compute pending configurations
        configured = set(
            LeagueSeasonFinancialConfig.objects.values_list('league_id', 'season_id')
        )
        combos = Gameday.objects.values(
            'league', 'league__name', 'season', 'season__name'
        ).annotate(gameday_count=Count('id'))

        pending = []
        for c in combos:
            if (c['league'], c['season']) not in configured:
                team_ids = set(
                    Gameresult.objects
                    .filter(
                        gameinfo__gameday__league=c['league'],
                        gameinfo__gameday__season=c['season']
                    )
                    .exclude(team__location='dummy')
                    .values_list('team', flat=True)
                ) - {None}
                pending.append({
                    'league_id': c['league'],
                    'league_name': c['league__name'],
                    'season_id': c['season'],
                    'season_name': c['season__name'],
                    'gameday_count': c['gameday_count'],
                    'team_count': len(team_ids),
                })

        context['pending_configs'] = pending
        return context

class ConfigCreateView(LoginRequiredMixin, StaffRequiredMixin, CreateView):
    model = LeagueSeasonFinancialConfig
    form_class = FinancialConfigForm
    template_name = 'finance/config_form.html'
    success_url = reverse_lazy('finance-dashboard')

    def get_form_kwargs(self):
        kwargs = super().get_form_kwargs()
        kwargs['initial'] = {
            'league': self.request.GET.get('league'),
            'season': self.request.GET.get('season'),
        }
        return kwargs

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        settings = FinanceService.get_global_defaults()
        context['default_rate_season'] = settings.default_rate_per_team_season
        context['default_rate_gameday'] = settings.default_rate_per_team_gameday
        return context

class ConfigDeleteView(LoginRequiredMixin, StaffRequiredMixin, DeleteView):
    model = LeagueSeasonFinancialConfig
    template_name = 'finance/config_confirm_delete.html'
    success_url = reverse_lazy('finance-dashboard')

class FinanceConfigDetailView(LoginRequiredMixin, StaffRequiredMixin, DetailView):
    model = LeagueSeasonFinancialConfig
    template_name = 'finance/config_detail.html'
    context_object_name = 'config'

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        config = self.object
        context['stats'] = FinanceService.calculate_costs(config)
        context['discount_form'] = DiscountForm()
        context['config_form'] = FinancialConfigForm(instance=config)
        return context
    
    def post(self, request, *args, **kwargs):
        config = self.get_object()
        if 'config_submit' in request.POST:
            form = FinancialConfigForm(request.POST, instance=config)
            if form.is_valid():
                form.save()
                return redirect('finance-config-detail', pk=config.pk)
        elif 'discount_submit' in request.POST:
            form = DiscountForm(request.POST)
            if form.is_valid():
                discount = form.save(commit=False)
                discount.config = config
                discount.save()
                return redirect('finance-config-detail', pk=config.pk)
        return self.get(request, *args, **kwargs)

class DiscountDeleteView(LoginRequiredMixin, StaffRequiredMixin, DeleteView):
    model = LeagueSeasonDiscount
    template_name = 'finance/discount_confirm_delete.html'
    
    def get_success_url(self):
        return reverse_lazy('finance-config-detail', kwargs={'pk': self.object.config.pk})

class GlobalSettingsUpdateView(LoginRequiredMixin, StaffRequiredMixin, UpdateView):
    model = FinancialSettings
    form_class = GlobalSettingsForm
    template_name = 'finance/settings.html'
    success_url = reverse_lazy('finance-dashboard')

    def get_object(self, queryset=None):
        return FinanceService.get_global_defaults()
