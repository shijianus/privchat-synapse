// Authentication types based on dashboard backend API

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  permissions: Permission[];
  createdAt: string;
  updatedAt: string;
}

export interface UserRole {
  id: string;
  name: 'super_admin' | 'admin' | 'moderator' | 'operator' | 'viewer';
  level: number;
  permissions: Permission[];
}

export interface Permission {
  id: string;
  name: string;
  resource: string;
  action: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface AuthResponse {
  user: User;
  token: string;
  refreshToken: string;
  expiresIn: number;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  permissions: Permission[];
  isLoading: boolean;
  error: string | null;
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

export interface ApiError {
  message: string;
  code: string;
  statusCode: number;
}