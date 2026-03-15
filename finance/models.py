from django.db import models
from gamedays.models import League, Season, Team


class FinancialSettings(models.Model):
    """Singleton for global financial defaults."""
    default_rate_per_team_season = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    default_rate_per_team_gameday = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)

    class Meta:
        verbose_name = "Global Financial Settings"
        verbose_name_plural = "Global Financial Settings"

    def __str__(self):
        return "Global Financial Settings"

    def save(self, *args, **kwargs):
        # Ensure only one instance exists
        if not self.pk and FinancialSettings.objects.exists():
            return
        return super().save(*args, **kwargs)


class LeagueSeasonFinancialConfig(models.Model):
    """Cost configuration for a specific league and season."""
    MODEL_SEASON = 'SEASON'
    MODEL_GAMEDAY = 'GAMEDAY'
    COST_MODEL_CHOICES = [
        (MODEL_SEASON, 'Cost per team in season (Flat)'),
        (MODEL_GAMEDAY, 'Cost per team per gameday participation'),
    ]

    league = models.ForeignKey(League, on_delete=models.CASCADE)
    season = models.ForeignKey(Season, on_delete=models.CASCADE)
    cost_model = models.CharField(max_length=10, choices=COST_MODEL_CHOICES, default=MODEL_SEASON)
    base_rate_override = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True,
                                            help_text="Override the global default base rate.")
    
    # Expected values for planning
    expected_teams_count = models.PositiveIntegerField(default=0, help_text="Used for Season model")
    expected_gamedays_count = models.PositiveIntegerField(default=0, help_text="Used for Gameday model")
    expected_teams_per_gameday = models.PositiveIntegerField(default=0, help_text="Used for Gameday model")

    class Meta:
        unique_together = ('league', 'season')
        verbose_name = "League/Season Financial Config"
        verbose_name_plural = "League/Season Financial Configs"

    def __str__(self):
        return f"{self.league} - {self.season} ({self.get_cost_model_display()})"


class LeagueSeasonDiscount(models.Model):
    """Discount applied to a league/season, optionally restricted to a specific team."""
    TYPE_FIXED = 'FIXED'
    TYPE_PERCENTAGE = 'PERCENT'
    DISCOUNT_TYPE_CHOICES = [
        (TYPE_FIXED, 'Fixed Amount'),
        (TYPE_PERCENTAGE, 'Percentage'),
    ]

    config = models.ForeignKey(LeagueSeasonFinancialConfig, on_delete=models.CASCADE, related_name='discounts')
    team = models.ForeignKey(Team, on_delete=models.CASCADE, null=True, blank=True,
                             help_text="If null, the discount applies to all teams in this config.")
    discount_type = models.CharField(max_length=10, choices=DISCOUNT_TYPE_CHOICES, default=TYPE_FIXED)
    value = models.DecimalField(max_digits=10, decimal_places=2)
    description = models.CharField(max_length=255, blank=True)

    def __str__(self):
        team_str = self.team if self.team else "All Teams"
        return f"{self.config.league} - {team_str}: {self.value} ({self.get_discount_type_display()})"
