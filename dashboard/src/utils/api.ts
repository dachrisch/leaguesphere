import axios, { AxiosInstance, AxiosError } from 'axios';
import type { DashboardSummary, LiveGame, LeagueStats, SeasonStats, AssociationStats } from '../types/dashboard';

class DashboardApi {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: '/api/dashboard',
      headers: { 'Content-Type': 'application/json' }
    });

    this.client.interceptors.request.use((config) => {
      const token = localStorage.getItem('authToken');
      if (token) {
        config.headers.Authorization = `Token ${token}`;
      }
      return config;
    });

    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        if (error.response?.status === 401) {
          window.location.href = '/accounts/login/';
        }
        return Promise.reject(error);
      }
    );
  }

  async getSummary(): Promise<DashboardSummary> {
    const response = await this.client.get<DashboardSummary>('/summary/');
    return response.data;
  }

  async getLiveGames(): Promise<LiveGame[]> {
    const response = await this.client.get<LiveGame[]>('/live-games/');
    return response.data;
  }

  async getLeagueStats(leagueId: number): Promise<LeagueStats> {
    const response = await this.client.get<LeagueStats>(`/league/${leagueId}/stats/`);
    return response.data;
  }

  async getSeasonStats(seasonId: number): Promise<SeasonStats> {
    const response = await this.client.get<SeasonStats>(`/season/${seasonId}/stats/`);
    return response.data;
  }

  async getAssociationStats(associationId: number): Promise<AssociationStats> {
    const response = await this.client.get<AssociationStats>(`/association/${associationId}/stats/`);
    return response.data;
  }
}

export const dashboardApi = new DashboardApi();
