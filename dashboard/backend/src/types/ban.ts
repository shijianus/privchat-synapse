export type BanType = 'none' | 'silence' | 'soft_ban' | 'hard_ban';
export type BanStatus = 'active' | 'expired' | 'revoked';

/**
 * 对应 dashboard.user_bans 表的记录模型
 */
export interface UserBanRecord {
  readonly id: number;
  readonly userId: number;
  readonly synapseUserId?: string;
  readonly banType: BanType;
  readonly reason: string | null;
  readonly evidence?: Record<string, unknown> | null;
  readonly status: BanStatus;
  readonly createdBy: string;
  readonly expiresAt?: string | null;
  readonly createdAt: string;
}

/**
 * 创建封禁时的输入结构
 */
export interface CreateBanRequest {
  readonly userId: number;
  readonly banType: BanType;
  readonly reason: string;
  readonly evidence?: Record<string, unknown>;
  readonly expiresAt?: string | null;
  readonly createdBy: string;
}

/**
 * 更新封禁状态
 */
export interface UpdateBanRequest {
  readonly banId: number;
  readonly reason?: string;
  readonly evidence?: Record<string, unknown>;
  readonly status?: BanStatus;
  readonly expiresAt?: string | null;
  readonly updatedBy: string;
}
