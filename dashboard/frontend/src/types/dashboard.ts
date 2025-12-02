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
  details: Record<string, any>;
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
