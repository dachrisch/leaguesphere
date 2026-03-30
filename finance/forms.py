from django import forms
from .models import LeagueSeasonFinancialConfig, LeagueSeasonDiscount, FinancialSettings
from gamedays.models import Team

class FinancialConfigForm(forms.ModelForm):
    class Meta:
        model = LeagueSeasonFinancialConfig
        fields = [
            'league', 'season', 'cost_model', 'base_rate_override',
            'expected_teams_count', 'expected_gamedays_count', 'expected_teams_per_gameday'
        ]
        widgets = {
            'cost_model': forms.RadioSelect,
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if self.instance.pk:
            # Disable league/season on edit to prevent changing the identity of the config
            self.fields['league'].disabled = True
            self.fields['season'].disabled = True

class DiscountForm(forms.ModelForm):
    class Meta:
        model = LeagueSeasonDiscount
        fields = ['team', 'discount_type', 'value', 'description']

class GlobalSettingsForm(forms.ModelForm):
    class Meta:
        model = FinancialSettings
        fields = ['default_rate_per_team_season', 'default_rate_per_team_gameday']
