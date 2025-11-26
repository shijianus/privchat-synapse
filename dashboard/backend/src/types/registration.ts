export type RegistrationStatus = 'pending' | 'approved' | 'rejected';

export type RegistrationBlacklistType =
  | 'username'
  | 'email'
  | 'msisdn'
  | 'ip_address'
  | 'device_fingerprint';

/**
 * registration_applications 表对应的记录
 */
export interface RegistrationApplication {
  readonly id: number;
  readonly username: string;
  readonly email: string;
  readonly msisdn?: string | null;
  readonly ipAddress: string;
  readonly deviceFingerprint?: string | null;
  readonly status: RegistrationStatus;
  readonly reviewer?: string | null;
  readonly reviewerNote?: string | null;
  readonly synapseUserId?: string | null;
  readonly decidedAt?: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface RegistrationApplicationFilters {
  readonly status?: RegistrationStatus;
  readonly keyword?: string;
  readonly limit?: number;
  readonly offset?: number;
}

export interface RegistrationApprovalRequest {
  readonly reviewerNote?: string;
  readonly synapseUserId?: string;
}

export interface RegistrationRejectionRequest {
  readonly reviewerNote: string;
  readonly blacklistTypes?: RegistrationBlacklistType[];
  readonly blacklistExpiresAt?: string | null;
}

export interface RegistrationBlacklistEntry {
  readonly id: number;
  readonly type: RegistrationBlacklistType;
  readonly value: string;
  readonly reason?: string | null;
  readonly expiresAt?: string | null;
  readonly createdAt: string;
  readonly createdBy: string;
}

export interface RegistrationBlacklistFilters {
  readonly type?: RegistrationBlacklistType;
  readonly value?: string;
  readonly limit?: number;
  readonly offset?: number;
}

export interface CreateBlacklistEntryRequest {
  readonly type: RegistrationBlacklistType;
  readonly value: string;
  readonly reason?: string;
  readonly expiresAt?: string | null;
}
