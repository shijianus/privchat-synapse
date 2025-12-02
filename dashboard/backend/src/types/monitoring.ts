export type ServiceStatus = 'up' | 'degraded' | 'down';

export interface ServiceCheck {
  readonly name: string;
  readonly status: ServiceStatus;
  readonly latencyMs?: number;
  readonly message?: string;
  readonly endpoint?: string;
}

export interface UsageValue {
  readonly usedBytes: number;
  readonly totalBytes: number;
  readonly usagePercent: number;
  readonly detail?: string;
}

export interface DiskUsage {
  readonly mount: string;
  readonly usedBytes: number;
  readonly totalBytes: number;
  readonly availableBytes: number;
  readonly usagePercent: number;
}

export interface GpuUsage {
  readonly usagePercent: number | null;
  readonly message?: string;
}

export interface NetworkUsage {
  readonly rxBytesPerSec: number | null;
  readonly txBytesPerSec: number | null;
  readonly sampleIntervalSeconds: number | null;
  readonly interfaceCount: number;
}

export interface PoolStats {
  readonly total: number;
  readonly idle: number;
  readonly waiting: number;
  readonly active: number;
  readonly max: number;
}

export interface RedisCacheStats {
  readonly usedMemoryBytes: number | null;
  readonly hitRate: number | null;
  readonly keyCount: number | null;
  readonly status: ServiceStatus;
  readonly message?: string;
}

export interface QuickStats {
  readonly totalUsers: number;
  readonly activeBans: number;
  readonly pendingAppeals: number;
  readonly pendingRegistrations: number;
  readonly onlineUsers?: number | null;
  readonly todaysMessages?: number | null;
  readonly activeRooms?: number | null;
}

export interface LogEntry {
  readonly level: string;
  readonly message: string;
  readonly timestamp: string;
  readonly source?: string;
}

export interface SystemIdentity {
  readonly os: string;
  readonly uptimeSeconds: number;
  readonly dashboardVersion: string;
  readonly synapseVersion?: string | null;
  readonly nodeVersion: string;
  readonly host: string;
}

export interface MonitorSnapshot {
  readonly collectedAt: string;
  readonly refreshIntervalSeconds: number;
  readonly resources: {
    readonly cpuUsagePercent: number | null;
    readonly memory: UsageValue;
    readonly disk: DiskUsage | null;
    readonly gpu: GpuUsage | null;
    readonly network: NetworkUsage | null;
  };
  readonly services: {
    readonly synapse: ServiceCheck;
    readonly dashboard: ServiceCheck;
    readonly postgres: ServiceCheck;
    readonly redis: ServiceCheck;
    readonly minio: ServiceCheck;
  };
  readonly pools: {
    readonly postgres: PoolStats | null;
    readonly redis: RedisCacheStats | null;
  };
  readonly stats: QuickStats;
  readonly logs: readonly LogEntry[];
  readonly system: SystemIdentity;
  readonly warnings?: readonly string[];
}
