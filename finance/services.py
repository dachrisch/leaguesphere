from gamedays.models import Team, Gameday, Gameinfo, Gameresult, SeasonLeagueTeam
from .models import FinancialSettings, LeagueSeasonFinancialConfig, LeagueSeasonDiscount


class FinanceService:
    @staticmethod
    def get_global_defaults():
        settings, created = FinancialSettings.objects.get_or_create(pk=1)
        return settings

    @classmethod
    def get_participation_data(cls, league, season):
        """Calculates unique teams per gameday for a specific league and season."""
        gamedays = Gameday.objects.filter(league=league, season=season)
        participation = []
        
        for gameday in gamedays:
            playing_teams = set(Gameresult.objects.filter(gameinfo__gameday=gameday).values_list('team', flat=True))
            officiating_teams = set(Gameinfo.objects.filter(gameday=gameday).values_list('officials', flat=True))
            unique_teams = playing_teams | officiating_teams
            # Remove None/Null team IDs
            unique_teams = {t for t in unique_teams if t is not None}
            participation.append({
                'gameday': gameday,
                'team_count': len(unique_teams),
                'teams': unique_teams
            })
            
        return participation

    @classmethod
    def calculate_costs(cls, config: LeagueSeasonFinancialConfig):
        """Calculates total costs, discounts, and net revenue for a league/season."""
        defaults = cls.get_global_defaults()
        
        if config.base_rate_override is not None:
            base_rate = config.base_rate_override
        else:
            if config.cost_model == config.MODEL_SEASON:
                base_rate = defaults.default_rate_per_team_season
            else:
                base_rate = defaults.default_rate_per_team_gameday

        gross_total = 0
        discount_total = 0
        details = []

        if config.cost_model == config.MODEL_SEASON:
            registered_teams = SeasonLeagueTeam.objects.filter(league=config.league, season=config.season).select_related('team')
            for slt in registered_teams:
                team_gross = base_rate
                team_discount = cls._calculate_team_discounts(config, slt.team, team_gross)
                
                gross_total += team_gross
                discount_total += team_discount
                details.append({
                    'team': slt.team,
                    'gross': team_gross,
                    'discount': team_discount,
                    'net': team_gross - team_discount
                })
        else:
            participation_data = cls.get_participation_data(config.league, config.season)
            for p in participation_data:
                gameday_gross = p['team_count'] * base_rate
                gameday_discount = 0
                
                # Fetch teams to calculate per-team discounts
                teams = Team.objects.filter(id__in=p['teams'])
                for team in teams:
                    gameday_discount += cls._calculate_team_discounts(config, team, base_rate)
                
                gross_total += gameday_gross
                discount_total += gameday_discount
        
        # Apply global (non-team-specific) discounts once to the final total
        global_discounts = config.discounts.filter(team=None)
        for d in global_discounts:
            if d.discount_type == d.TYPE_FIXED:
                discount_total += d.value
            else:
                discount_total += (gross_total * d.value / 100)

        return {
            'gross': gross_total,
            'discount': discount_total,
            'net': gross_total - discount_total,
            'base_rate': base_rate,
            'details': details if config.cost_model == config.MODEL_SEASON else None
        }

    @staticmethod
    def _calculate_team_discounts(config, team, base_amount):
        """Calculates cumulative discounts for a specific team in a league/season."""
        team_discounts = config.discounts.filter(team=team)
        total = 0
        for d in team_discounts:
            if d.discount_type == d.TYPE_FIXED:
                total += d.value
            else:
                total += (base_amount * d.value / 100)
        return total
