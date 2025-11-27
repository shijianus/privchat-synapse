import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import apiService from '../services/api';
import type {
  AuthState,
  User,
  LoginCredentials,
  RefreshTokenRequest,
  ApiError,
} from '../types/auth';

interface AuthStore extends AuthState {
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
  clearError: () => void;
  setLoading: (loading: boolean) => void;
  initializeAuth: () => Promise<void>;
}

const initialState: Omit<AuthState, 'refreshToken'> = {
  user: null,
  token: null,
  isAuthenticated: false,
  permissions: [],
  isLoading: false,
  error: null,
};

const toErrorMessage = (error: unknown): string => {
  if (typeof error === 'string') {
    return error;
  }
  if (error && typeof error === 'object' && 'message' in error) {
    return (error as ApiError).message;
  }
  return '未知错误，请稍后重试';
};

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      ...initialState,
      refreshToken: null,

      login: async (credentials: LoginCredentials) => {
        set({ isLoading: true, error: null });
        try {
          const response = await apiService.login(credentials);
          localStorage.setItem('auth_token', response.token);
          localStorage.setItem('refresh_token', response.refreshToken);

          set({
            user: response.user,
            token: response.token,
            refreshToken: response.refreshToken,
            permissions: response.user.permissions,
            isAuthenticated: true,
            isLoading: false,
          });
        } catch (error) {
          set({
            ...initialState,
            refreshToken: null,
            error: toErrorMessage(error),
            isLoading: false,
          });
          throw error;
        }
      },

      logout: async () => {
        set({ isLoading: true });
        try {
          await apiService.logout();
        } catch (error) {
          console.error('注销失败：', error);
        } finally {
          localStorage.removeItem('auth_token');
          localStorage.removeItem('refresh_token');
          set({
            ...initialState,
            refreshToken: null,
            isLoading: false,
          });
        }
      },

      refreshSession: async () => {
        const storedRefreshToken =
          get().refreshToken || localStorage.getItem('refresh_token');
        if (!storedRefreshToken) {
          throw new Error('缺少刷新令牌，请重新登录');
        }

        const request: RefreshTokenRequest = {
          refreshToken: storedRefreshToken,
        };

        try {
          const response = await apiService.refreshToken(request);
          localStorage.setItem('auth_token', response.token);
          localStorage.setItem('refresh_token', response.refreshToken);

          set({
            token: response.token,
            refreshToken: response.refreshToken,
            user: response.user ?? get().user,
            permissions: response.user?.permissions ?? get().permissions,
            isAuthenticated: true,
          });
        } catch (error) {
          localStorage.removeItem('auth_token');
          localStorage.removeItem('refresh_token');
          set({
            ...initialState,
            refreshToken: null,
            error: toErrorMessage(error),
          });
          throw error;
        }
      },

      clearError: () => set({ error: null }),

      setLoading: (loading: boolean) => set({ isLoading: loading }),

      initializeAuth: async () => {
        const storedToken = localStorage.getItem('auth_token');
        const storedRefreshToken = localStorage.getItem('refresh_token');

        if (!storedToken || !storedRefreshToken) {
          set({
            ...initialState,
            refreshToken: null,
          });
          return;
        }

        set({
          isLoading: true,
          token: storedToken,
          refreshToken: storedRefreshToken,
        });

        try {
          const user = await apiService.getCurrentUser();
          set({
            user,
            permissions: user.permissions,
            isAuthenticated: true,
            error: null,
          });
        } catch (error) {
          localStorage.removeItem('auth_token');
          localStorage.removeItem('refresh_token');
          set({
            ...initialState,
            refreshToken: null,
            error: toErrorMessage(error),
          });
        } finally {
          set({ isLoading: false });
        }
      },
    }),
    {
      name: 'dashboard-auth',
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
        permissions: state.permissions,
      }),
    }
  )
);

const hasPermission = (permissions: User['permissions'], resource: string, action: string): boolean => {
  return permissions.some(
    (permission) => permission.resource === resource && permission.action === action
  );
};

export const hasRole = (user: User | null, role: string): boolean => {
  return user?.role.name === role;
};

export const canAccess = (
  user: User | null,
  resource: string,
  action: string
): boolean => {
  if (!user || !user.permissions) return false;
  return hasPermission(user.permissions, resource, action);
};

// Permission checks for common dashboard operations
export const canViewUsers = (user: User | null): boolean => canAccess(user, 'users', 'read');
export const canManageUsers = (user: User | null): boolean => canAccess(user, 'users', 'write');
export const canBanUsers = (user: User | null): boolean => canAccess(user, 'bans', 'write');
export const canViewAppeals = (user: User | null): boolean => canAccess(user, 'appeals', 'read');
export const canManageAppeals = (user: User | null): boolean => canAccess(user, 'appeals', 'write');
export const canViewLogs = (user: User | null): boolean => canAccess(user, 'logs', 'read');
export const canManageSettings = (user: User | null): boolean => canAccess(user, 'settings', 'write');
