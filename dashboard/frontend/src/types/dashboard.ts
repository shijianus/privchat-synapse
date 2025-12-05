// Dashboard domain types

export type UserGroup = 'free' | 'standard' | 'premium' | 'enterprise' | 'general';

export type RegistrationStatus = 'pending' | 'active' | 'suspended' | 'deleted';

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface UserProfile {
  id: number;
  synapseUserId: string;
  userGroup: UserGroup;
  registrationStatus: RegistrationStatus;
  riskLevel: RiskLevel;
  lastLoginAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UserBan {
  id: string;
  userId: string;
  synapseUserId: string;
  banType: 'none' | 'silence' | 'soft_ban' | 'hard_ban';
  reason: string;
  isActive: boolean;
  createdAt: string;
  expiresAt?: string;
  createdBy: string;
  updatedAt: string;
}

export interface UserAppeal {
  id: string;
  userId: string;
  synapseUserId: string;
  banId?: string;
  reason: string;
  status: 'pending' | 'under_review' | 'approved' | 'rejected';
  submittedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  decision?: string;
}

export interface AppealMessage {
  id: string;
  appealId: string;
  senderId: string;
  message: string;
  isFromUser: boolean;
  createdAt: string;
}

export interface OperationLog {
  id: string;
  userId: string;
  targetSynapseUserId?: string;
  operation: string;
  resource: string;
  details: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  createdAt: string;
}

export interface MediaMetadata {
  id: string;
  synapseMediaId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  uploaderId: string;
  checksum: string;
  storagePath: string;
  createdAt: string;
}

export interface StoragePolicy {
  id: string;
  name: string;
  scope: 'global' | 'room' | 'user';
  targetId?: string;
  maxFileSize: number;
  allowedMimeTypes: string[];
  retentionDays: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// UI State types
export interface PaginationParams {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginationResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface FilterParams {
  search?: string;
  keyword?: string;
  userGroup?: string;
  registrationStatus?: string;
  riskLevel?: string;
  banType?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
}

export type SortableFields =
  | 'createdAt'
  | 'updatedAt'
  | 'name'
  | 'email'
  | 'lastActiveAt'
  | 'riskLevel'
  | 'userGroup';

export type DashboardView =
  | 'overview'
  | 'users'
  | 'bans'
  | 'appeals'
  | 'media'
  | 'logs'
  | 'settings';

export interface UserProvisionRequest {
  username: string;
  displayName?: string;
  password?: string;
  generatePassword?: boolean;
  userGroup?: UserGroup;
  registrationStatus?: RegistrationStatus;
  riskLevel?: RiskLevel;
  forcePasswordReset?: boolean;
  email?: string;
  msisdn?: string;
  joinDefaultRooms?: boolean;
  sendWelcomeMessage?: boolean;
}

export interface UserProvisionResponse {
  synapseUserId: string;
  userGroup: UserGroup;
  registrationStatus: RegistrationStatus;
  riskLevel: RiskLevel;
  initialPassword?: string;
  createdAt: string;
}

export type RegistrationApplicationStatus = 'pending' | 'approved' | 'rejected';

export type RegistrationBlacklistType =
  | 'username'
  | 'email'
  | 'msisdn'
  | 'ip_address'
  | 'device_fingerprint';

export interface RegistrationApplication {
  id: number;
  username: string;
  email: string;
  msisdn?: string | null;
  ipAddress: string;
  deviceFingerprint?: string | null;
  status: RegistrationApplicationStatus;
  reviewer?: string | null;
  reviewerNote?: string | null;
  synapseUserId?: string | null;
  decidedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RegistrationApplicationFilters {
  status?: RegistrationApplicationStatus | 'all';
  keyword?: string;
  limit?: number;
  offset?: number;
}

export interface RegistrationApprovalPayload {
  reviewerNote?: string | null;
  synapseUserId?: string | null;
}

export interface RegistrationRejectionPayload {
  reviewerNote: string;
  blacklistTypes?: RegistrationBlacklistType[];
  blacklistExpiresAt?: string | null;
}

export interface RegistrationBlacklistEntry {
  id: number;
  type: RegistrationBlacklistType;
  value: string;
  reason?: string | null;
  expiresAt?: string | null;
  createdAt: string;
  createdBy: string;
}

export interface RegistrationBlacklistFilters {
  type?: RegistrationBlacklistType | 'all';
  value?: string;
  limit?: number;
  offset?: number;
}

export interface CreateBlacklistEntryRequest {
  type: RegistrationBlacklistType;
  value: string;
  reason?: string;
  expiresAt?: string | null;
}
