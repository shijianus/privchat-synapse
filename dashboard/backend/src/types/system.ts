export type ServiceHealthStatus = 'up' | 'down';

export interface ServiceHealth {
  readonly status: ServiceHealthStatus;
  readonly latencyMs?: number;
  readonly message?: string;
}

export interface SystemHealthStatus {
  readonly healthy: boolean;
  readonly timestamp: string;
  readonly services: {
    readonly database: ServiceHealth;
    readonly redis: ServiceHealth;
    readonly uptimeSeconds: number;
  };
}

export interface SystemStats {
  readonly generatedAt: string;
  readonly totalUsers: number;
  readonly activeBans: number;
  readonly pendingAppeals: number;
  readonly pendingRegistrations: number;
  readonly mediaObjects: number;
  readonly mediaStoredBytes: number;
  readonly storagePolicies: number;
  readonly syncTasks: Record<string, number>;
}

export type RegistrationMode = 'disabled' | 'email' | 'sms' | 'email_and_sms';

export interface SystemConfig {
  readonly registrationMode: RegistrationMode;
  readonly autoApproveRegistrations: boolean;
  readonly requireCaptcha: boolean;
  readonly mediaCoolingHours: number;
  readonly maintenanceMode: boolean;
}

export type UpdateSystemConfigInput = Partial<SystemConfig>;
