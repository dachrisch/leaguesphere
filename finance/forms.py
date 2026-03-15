from django import forms
from .models import LeagueSeasonFinancialConfig, LeagueSeasonDiscount, FinancialSettings
from gamedays.models import Team

class FinancialConfigForm(forms.ModelForm):
    class Meta:
        model = LeagueSeasonFinancialConfig
        fields = ['cost_model', 'base_rate_override']
        widgets = {
            'cost_model': forms.RadioSelect,
        }

class DiscountForm(forms.ModelForm):
    class Meta:
        model = LeagueSeasonDiscount
        fields = ['team', 'discount_type', 'value', 'description']

class GlobalSettingsForm(forms.ModelForm):
    class Meta:
        model = FinancialSettings
        fields = ['default_rate_per_team_season', 'default_rate_per_team_gameday']
