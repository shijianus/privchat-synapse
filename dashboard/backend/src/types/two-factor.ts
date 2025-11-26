export type TwoFactorMethod =
  | 'email'
  | 'sms'
  | 'totp'
  | 'safety_code'
  | 'secondary_password';

export interface TwoFactorStatus {
  readonly synapseUserId: string;
  readonly requiresSecondaryPassword: boolean;
  readonly availableMethods: TwoFactorMethod[];
  readonly trustedDeviceCount: number;
  readonly pendingFriendVerification: boolean;
  readonly lastUpdatedAt: string | null;
  readonly lastVerifiedAt: string | null;
}

export interface TwoFactorVerificationPayload {
  readonly synapseUserId: string;
  readonly method: TwoFactorMethod;
  readonly code: string;
  readonly deviceId?: string;
  readonly deviceName?: string;
  readonly ipAddress?: string;
  readonly trustDevice?: boolean;
  readonly actorId?: string;
}

export interface TwoFactorVerificationResult {
  readonly success: boolean;
  readonly method: TwoFactorMethod;
  readonly lastVerifiedAt: string;
  readonly trustedDeviceId?: string;
}

export interface FriendVerificationPayload {
  readonly verifierMatrixId: string;
  readonly targetMatrixId: string;
  readonly verificationHash: string;
}

export interface FriendVerificationResult {
  readonly success: boolean;
  readonly reason?: string;
  readonly revocationWindowEndsAt?: string | null;
}
