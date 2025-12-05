import axios from 'axios';
import type { AxiosResponse, AxiosError } from 'axios';
import type {
  LoginCredentials,
  AuthResponse,
  RefreshTokenRequest,
  User,
  UserProfile,
  UserBan,
  UserAppeal,
  OperationLog,
  PaginationParams,
  PaginationResponse,
  FilterParams,
  ApiError,
  UserProvisionRequest,
  UserProvisionResponse,
  RegistrationApplication,
  RegistrationApplicationFilters,
  RegistrationApprovalPayload,
  RegistrationRejectionPayload,
  RegistrationBlacklistEntry,
  RegistrationBlacklistFilters,
  CreateBlacklistEntryRequest,
} from '../types';

// API Configuration
const API_BASE_URL =
  import.meta.env.VITE_API_URL ||
  import.meta.env.VITE_API_BASE_URL ||
  'http://localhost:3001/api/v1';
const DEFAULT_TIMEOUT = 10000;

// Create axios instance
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: DEFAULT_TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('auth_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for error handling
apiClient.interceptors.response.use(
  (response: AxiosResponse) => {
    return response;
  },
  (error: AxiosError) => {
    const apiError: ApiError = {
      message: error.message || 'An error occurred',
      code: 'UNKNOWN_ERROR',
      statusCode: error.response?.status || 500,
    };

    if (error.response?.data) {
      const responseData = error.response.data as { message?: string; code?: string };
      apiError.message = responseData.message || apiError.message;
      apiError.code = responseData.code || apiError.code;
    }

    // Handle authentication errors
    if (error.response?.status === 401) {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('refresh_token');
      window.location.href = '/login';
    }

    return Promise.reject(apiError);
  }
);

export class ApiService {
  // Generic HTTP methods
  private async get<T>(endpoint: string): Promise<T> {
    const response = await apiClient.get<T>(endpoint);
    return response.data;
  }

  private async post<T>(endpoint: string, data?: unknown): Promise<T> {
    const response = await apiClient.post<T>(endpoint, data);
    return response.data;
  }

  private async put<T>(endpoint: string, data?: unknown): Promise<T> {
    const response = await apiClient.put<T>(endpoint, data);
    return response.data;
  }

  private async delete<T>(endpoint: string): Promise<T> {
    const response = await apiClient.delete<T>(endpoint);
    return response.data;
  }

  // Authentication endpoints
  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    return this.post<AuthResponse>('/auth/login', credentials);
  }

  async refreshToken(request: RefreshTokenRequest): Promise<AuthResponse> {
    return this.post<AuthResponse>('/auth/refresh', request);
  }

  async logout(): Promise<void> {
    await this.post<void>('/auth/logout');
  }

  async getCurrentUser(): Promise<User> {
    return this.get<User>('/auth/me');
  }

  // User management endpoints
  async getUsers(filters?: FilterParams): Promise<UserProfile[]> {
    const params = new URLSearchParams();

    if (filters?.userGroup) {
      params.append('userGroup', filters.userGroup);
    }

    if (filters?.registrationStatus) {
      params.append('registrationStatus', filters.registrationStatus);
    }

    if (filters?.riskLevel) {
      params.append('riskLevel', filters.riskLevel);
    }

    const keyword = filters?.keyword || filters?.search;
    if (keyword) {
      params.append('keyword', keyword);
    }

    const query = params.toString();
    const endpoint = query ? `/users?${query}` : '/users';
    return this.get<UserProfile[]>(endpoint);
  }

  async getUser(id: string): Promise<UserProfile> {
    return this.get<UserProfile>(`/users/${id}`);
  }

  async updateUser(id: string, updates: Partial<UserProfile>): Promise<UserProfile> {
    return this.put<UserProfile>(`/users/${id}`, updates);
  }

  async createUser(userData: Omit<UserProfile, 'id' | 'createdAt' | 'updatedAt'>): Promise<UserProfile> {
    return this.post<UserProfile>('/users', userData);
  }

  async provisionUser(payload: UserProvisionRequest): Promise<UserProvisionResponse> {
    return this.post<UserProvisionResponse>('/users/provision', payload);
  }

  async deleteUser(id: string): Promise<void> {
    await this.delete<void>(`/users/${id}`);
  }

  // Registration management
  async getRegistrationApplications(
    filters?: RegistrationApplicationFilters
  ): Promise<RegistrationApplication[]> {
    const params = new URLSearchParams();

    if (filters?.status && filters.status !== 'all') {
      params.append('status', filters.status);
    }

    if (filters?.keyword) {
      params.append('keyword', filters.keyword);
    }

    if (typeof filters?.limit === 'number') {
      params.append('limit', filters.limit.toString());
    }

    if (typeof filters?.offset === 'number') {
      params.append('offset', filters.offset.toString());
    }

    const query = params.toString();
    const endpoint = query ? `/registrations?${query}` : '/registrations';
    return this.get<RegistrationApplication[]>(endpoint);
  }

  async approveRegistration(
    applicationId: number,
    payload: RegistrationApprovalPayload
  ): Promise<RegistrationApplication> {
    return this.post<RegistrationApplication>(`/registrations/${applicationId}/approve`, payload);
  }

  async rejectRegistration(
    applicationId: number,
    payload: RegistrationRejectionPayload
  ): Promise<RegistrationApplication> {
    return this.post<RegistrationApplication>(`/registrations/${applicationId}/reject`, payload);
  }

  // Announcements
  async broadcastAnnouncement(payload: {
    channelKey: string;
    title: string;
    content: string;
    html?: string;
    audience: string[];
  }): Promise<{ delivered: number; roomIds: string[] }> {
    return this.post('/announcements/broadcast', payload);
  }

  // Reports (user complaints)
  async listReports(params?: { limit?: number; offset?: number }): Promise<{
    items: Array<{
      id: string;
      reporter: string;
      target: string;
      reason: string;
      description?: string | null;
      createdAt: string;
    }>;
    limit: number;
    offset: number;
  }> {
    const search = new URLSearchParams();
    if (params?.limit) search.append('limit', String(params.limit));
    if (params?.offset) search.append('offset', String(params.offset));
    const query = search.toString();
    return this.get(query ? `/reports?${query}` : '/reports');
  }

  async getRegistrationBlacklist(
    filters?: RegistrationBlacklistFilters
  ): Promise<RegistrationBlacklistEntry[]> {
    const params = new URLSearchParams();

    if (filters?.type && filters.type !== 'all') {
      params.append('type', filters.type);
    }

    if (filters?.value) {
      params.append('value', filters.value);
    }

    if (typeof filters?.limit === 'number') {
      params.append('limit', filters.limit.toString());
    }

    if (typeof filters?.offset === 'number') {
      params.append('offset', filters.offset.toString());
    }

    const query = params.toString();
    const endpoint = query ? `/blacklist?${query}` : '/blacklist';
    return this.get<RegistrationBlacklistEntry[]>(endpoint);
  }

  async createRegistrationBlacklistEntry(
    payload: CreateBlacklistEntryRequest
  ): Promise<RegistrationBlacklistEntry> {
    return this.post<RegistrationBlacklistEntry>('/blacklist', payload);
  }

  async deleteRegistrationBlacklistEntry(entryId: number): Promise<void> {
    await this.delete<void>(`/blacklist/${entryId}`);
  }

  // Ban management endpoints
  async getBans(
    pagination: PaginationParams,
    filters?: FilterParams
  ): Promise<PaginationResponse<UserBan>> {
    const params = new URLSearchParams();

    Object.entries(pagination).forEach(([key, value]) => {
      if (value !== undefined) {
        params.append(key, value.toString());
      }
    });

    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== '') {
          params.append(key, value);
        }
      });
    }

    const endpoint = `/bans?${params.toString()}`;
    return this.get<PaginationResponse<UserBan>>(endpoint);
  }

  async createBan(banData: Omit<UserBan, 'id' | 'createdAt' | 'updatedAt' | 'isActive'>): Promise<UserBan> {
    return this.post<UserBan>('/bans', banData);
  }

  async updateBan(id: string, updates: Partial<UserBan>): Promise<UserBan> {
    return this.put<UserBan>(`/bans/${id}`, updates);
  }

  async liftBan(id: string): Promise<UserBan> {
    return this.put<UserBan>(`/bans/${id}/lift`);
  }

  // Appeal management endpoints
  async getAppeals(
    pagination: PaginationParams,
    filters?: FilterParams
  ): Promise<PaginationResponse<UserAppeal>> {
    const params = new URLSearchParams();

    Object.entries(pagination).forEach(([key, value]) => {
      if (value !== undefined) {
        params.append(key, value.toString());
      }
    });

    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== '') {
          params.append(key, value);
        }
      });
    }

    const endpoint = `/appeals?${params.toString()}`;
    return this.get<PaginationResponse<UserAppeal>>(endpoint);
  }

  async getAppeal(id: string): Promise<UserAppeal> {
    return this.get<UserAppeal>(`/appeals/${id}`);
  }

  async updateAppeal(
    id: string,
    updates: { status: string; decision?: string }
  ): Promise<UserAppeal> {
    return this.put<UserAppeal>(`/appeals/${id}`, updates);
  }

  // Operation logs endpoints
  async getOperationLogs(
    pagination: PaginationParams,
    filters?: FilterParams
  ): Promise<PaginationResponse<OperationLog>> {
    const params = new URLSearchParams();

    Object.entries(pagination).forEach(([key, value]) => {
      if (value !== undefined) {
        params.append(key, value.toString());
      }
    });

    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== '') {
          params.append(key, value);
        }
      });
    }

    const endpoint = `/logs?${params.toString()}`;
    return this.get<PaginationResponse<OperationLog>>(endpoint);
  }

  // Health check
  async healthCheck(): Promise<{ status: string; timestamp: string }> {
    return this.get<{ status: string; timestamp: string }>('/health');
  }
}

// Create singleton instance
export const apiService = new ApiService();
export default apiService;
