import axios, { AxiosInstance, AxiosError } from 'axios';
import type {
  DashboardSummary,
  LiveGame,
  LeagueStats,
  SeasonStats,
  AssociationStats,
  PlatformHealth,
  RecentAction,
  OnlineUser,
  ContentCreation,
  FeatureUsage,
  UserSegments,
  ProblemAlerts,
} from '../types/dashboard';

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

  // SaaS Admin Dashboard API methods

  async getPlatformHealth(): Promise<PlatformHealth> {
    const response = await this.client.get<PlatformHealth>('/platform-health/');
    return response.data;
  }

  async getRecentActivity(hours: number = 24, limit: number = 20): Promise<RecentAction[]> {
    const response = await this.client.get<RecentAction[]>('/recent-activity/', {
      params: { hours, limit },
    });
    return response.data;
  }

  async getOnlineUsers(minutes: number = 15): Promise<OnlineUser[]> {
    const response = await this.client.get<OnlineUser[]>('/online-users/', {
      params: { minutes },
    });
    return response.data;
  }

  async getContentCreation(days: number = 30): Promise<ContentCreation> {
    const response = await this.client.get<ContentCreation>('/content-creation/', {
      params: { days },
    });
    return response.data;
  }

  async getFeatureUsage(days: number = 30): Promise<FeatureUsage> {
    const response = await this.client.get<FeatureUsage>('/feature-usage/', {
      params: { days },
    });
    return response.data;
  }

  async getUserSegments(): Promise<UserSegments> {
    const response = await this.client.get<UserSegments>('/user-segments/');
    return response.data;
  }

  async getProblemAlerts(): Promise<ProblemAlerts> {
    const response = await this.client.get<ProblemAlerts>('/problem-alerts/');
    return response.data;
  }
}

export const dashboardApi = new DashboardApi();
