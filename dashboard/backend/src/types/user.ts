/**
 * 对应 dashboard.user_profiles 表的核心字段
 */
export interface UserProfile {
  readonly id: number;
  readonly synapseUserId: string;
  readonly userGroup: string;
  readonly registrationStatus: string;
  readonly riskLevel: string;
  readonly lastLoginAt?: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * 更新用户资料时支持的字段集合
 */
export interface UserProfileUpdateRequest {
  readonly userGroup?: string;
  readonly registrationStatus?: string;
  readonly riskLevel?: string;
  readonly lastLoginAt?: string | null;
}

/**
 * 查询用户列表时使用的过滤条件
 */
export interface UserProfileFilter {
  readonly userGroup?: string;
  readonly registrationStatus?: string;
  readonly riskLevel?: string;
  readonly keyword?: string;
}
