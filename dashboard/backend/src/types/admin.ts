export type AdminRole = 'super_admin' | 'admin' | 'moderator' | 'operator' | 'viewer';
export type AdminStatus = 'active' | 'suspended' | 'locked';

/**
 * Dashboard administrator entity mapped from dashboard.admin_users.
 */
export interface AdminUser {
  readonly id: number;
  readonly email: string;
  readonly passwordHash: string;
  readonly fullName: string;
  readonly role: AdminRole;
  readonly status: AdminStatus;
  readonly lastLoginAt?: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * Administrator data returned to clients (password hash stripped).
 */
export type PublicAdminUser = Omit<AdminUser, 'passwordHash'>;

/**
 * Payload accepted when registering a new administrator account.
 */
export interface AdminRegistrationRequest {
  readonly email: string;
  readonly password: string;
  readonly fullName: string;
  readonly role?: AdminRole;
}
