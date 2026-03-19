from django.contrib import admin
from django.utils.html import format_html
from .models import FinancialSettings, LeagueSeasonFinancialConfig, LeagueSeasonDiscount
from .services import FinanceService


@admin.register(FinancialSettings)
class FinancialSettingsAdmin(admin.ModelAdmin):
    list_display = (
        "__str__",
        "default_rate_per_team_season",
        "default_rate_per_team_gameday",
    )

    def has_add_permission(self, request):
        # Don't allow adding more than one instance
        return not FinancialSettings.objects.exists()

    def has_delete_permission(self, request, obj=None):
        return False


class LeagueSeasonDiscountInline(admin.TabularInline):
    model = LeagueSeasonDiscount
    extra = 1
    fields = ("discount_type", "value", "description")


@admin.register(LeagueSeasonFinancialConfig)
class LeagueSeasonFinancialConfigAdmin(admin.ModelAdmin):
    list_display = (
        "league",
        "season",
        "cost_model",
        "get_gross",
        "get_discount",
        "get_net",
    )
    list_filter = ("league", "season", "cost_model")
    inlines = [LeagueSeasonDiscountInline]

    def get_queryset(self, request):
        return super().get_queryset(request).select_related("league", "season")

    @admin.display(description="Gross Cost (€)")
    def get_gross(self, obj):
        costs = FinanceService.calculate_costs(obj)
        return format_html("<b>{:.2f} €</b>", costs["gross"])

    @admin.display(description="Discounts (€)")
    def get_discount(self, obj):
        costs = FinanceService.calculate_costs(obj)
        return format_html(
            "<span style='color: red;'>-{:.2f} €</span>", costs["discount"]
        )

    @admin.display(description="Net Revenue (€)")
    def get_net(self, obj):
        costs = FinanceService.calculate_costs(obj)
        color = "green" if costs["net"] > 0 else "black"
        return format_html("<b style='color: {};'>{:.2f} €</b>", color, costs["net"])
