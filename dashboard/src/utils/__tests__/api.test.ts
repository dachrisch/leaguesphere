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

    it('should have getSpieleProLiga method', () => {
      const api = new DashboardApi();
      expect(typeof api.getSpieleProLiga).toBe('function');
    });

    it('should have getTeamsProLiga method', () => {
      const api = new DashboardApi();
      expect(typeof api.getTeamsProLiga).toBe('function');
    });

    it('should have getTeamsProLandesverband method', () => {
      const api = new DashboardApi();
      expect(typeof api.getTeamsProLandesverband).toBe('function');
    });

    it('should have getSchiedsrichterProTeam method', () => {
      const api = new DashboardApi();
      expect(typeof api.getSchiedsrichterProTeam).toBe('function');
    });
  });
});
