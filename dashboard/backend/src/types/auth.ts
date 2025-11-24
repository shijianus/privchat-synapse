/**
 * 通过 JWT 验证后的管理员信息
 */
export interface AuthenticatedUser {
  readonly id: string;
  readonly roles: string[];
  readonly permissions: string[];
}
