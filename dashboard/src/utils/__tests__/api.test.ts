import { DashboardApi } from '../api';

describe('DashboardApi', () => {
  describe('existing methods', () => {
    it('should have getSummary method', () => {
      const api = new DashboardApi();
      expect(typeof api.getSummary).toBe('function');
    });

    it('should have getLiveGames method', () => {
      const api = new DashboardApi();
      expect(typeof api.getLiveGames).toBe('function');
    });
  });

  describe('DashboardApi - Admin endpoints', () => {
    it('should have getAdminStats method', () => {
      const api = new DashboardApi();
      expect(typeof api.getAdminStats).toBe('function');
    });

    it('should have getGamesPerLeague method', () => {
      const api = new DashboardApi();
      expect(typeof api.getGamesPerLeague).toBe('function');
    });

    it('should have getTeamsPerLeague method', () => {
      const api = new DashboardApi();
      expect(typeof api.getTeamsPerLeague).toBe('function');
    });

    it('should have getTeamsPerAssociation method', () => {
      const api = new DashboardApi();
      expect(typeof api.getTeamsPerAssociation).toBe('function');
    });

    it('should have getRefereesPerTeam method', () => {
      const api = new DashboardApi();
      expect(typeof api.getRefereesPerTeam).toBe('function');
    });

    it('should have getLeagueHierarchy method', () => {
      const api = new DashboardApi();
      expect(typeof api.getLeagueHierarchy).toBe('function');
    });
  });
});
