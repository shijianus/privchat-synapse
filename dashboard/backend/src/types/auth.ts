import { AdminRole, PublicAdminUser } from './admin';

export type DashboardPermission =
  | 'user:read'
  | 'user:write'
  | 'user:ban:manage'
  | 'appeal:read'
  | 'appeal:process'
  | 'media:read'
  | 'media:policy:manage'
  | 'registration:read'
  | 'registration:approve'
  | 'registration:reject'
  | 'system:config'
  | 'system:monitoring'
  | 'system:audit';

/**
 * 通过 JWT 验证后的管理员信息。
 */
export interface AuthenticatedUser {
  readonly id: string;
  readonly roles: AdminRole[];
  readonly permissions: DashboardPermission[];
}

/**
 * 登录成功后返回的令牌对以及管理员资料。
 */
export interface AuthTokens {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly user: PublicAdminUser;
}
