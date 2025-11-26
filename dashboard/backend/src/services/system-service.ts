import { DatabaseService } from '../database/database-service';
import { RedisService } from '../redis/redis-service';
import {
  ServiceHealth,
  SystemConfig,
  SystemHealthStatus,
  SystemStats,
  UpdateSystemConfigInput,
} from '../types/system';

import { OperationLogService } from './operation-log-service';

interface CountRow {
  readonly count: string;
}

interface MediaStatsRow {
  readonly count: string;
  readonly bytes: string;
}

interface SyncBreakdownRow {
  readonly status: string;
  readonly count: string;
}

const DEFAULT_SYSTEM_CONFIG: SystemConfig = {
  registrationMode: 'email',
  autoApproveRegistrations: false,
  requireCaptcha: true,
  mediaCoolingHours: 24,
  maintenanceMode: false,
};

/**
 * 系统管理服务，提供健康检查、统计与配置维护能力
 */
export class SystemService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly redisService: RedisService,
    private readonly operationLogService: OperationLogService
  ) {}

  async getHealthStatus(): Promise<SystemHealthStatus> {
    const timestamp = new Date().toISOString();
    const uptimeSeconds = process.uptime();

    const databaseHealth = await this.checkDatabase();
    const redisHealth = await this.checkRedis();

    return {
      healthy: databaseHealth.status === 'up' && redisHealth.status === 'up',
      timestamp,
      services: {
        database: databaseHealth,
        redis: redisHealth,
        uptimeSeconds,
      },
    };
  }

  async getSystemStats(): Promise<SystemStats> {
    const [
      userCountRows,
      banCountRows,
      pendingAppealsRows,
      pendingRegistrationRows,
      mediaStatsRows,
      policyCountRows,
      syncBreakdownRows,
    ] = await Promise.all([
      this.databaseService.query<CountRow>(
        'SELECT COUNT(*)::text AS count FROM dashboard.user_profiles'
      ),
      this.databaseService.query<CountRow>(
        "SELECT COUNT(*)::text AS count FROM dashboard.user_bans WHERE status = 'active'"
      ),
      this.databaseService.query<CountRow>(
        "SELECT COUNT(*)::text AS count FROM dashboard.user_appeals WHERE status = 'pending'"
      ),
      this.databaseService.query<CountRow>(
        "SELECT COUNT(*)::text AS count FROM dashboard.registration_applications WHERE status = 'pending'"
      ),
      this.databaseService.query<MediaStatsRow>(
        `
          SELECT
            COUNT(*)::text AS count,
            COALESCE(SUM(size_bytes), 0)::text AS bytes
          FROM dashboard.media_metadata
        `
      ),
      this.databaseService.query<CountRow>(
        'SELECT COUNT(*)::text AS count FROM dashboard.storage_policies'
      ),
      this.databaseService.query<SyncBreakdownRow>(
        `
          SELECT status, COUNT(*)::text AS count
          FROM dashboard.media_sync_tasks
          GROUP BY status
        `
      ),
    ]);

    const syncMap: Record<string, number> = {};
    syncBreakdownRows.forEach((row) => {
      syncMap[row.status] = Number(row.count);
    });

    const mediaRow = mediaStatsRows[0] ?? { count: '0', bytes: '0' };

    return {
      generatedAt: new Date().toISOString(),
      totalUsers: Number(userCountRows[0]?.count ?? '0'),
      activeBans: Number(banCountRows[0]?.count ?? '0'),
      pendingAppeals: Number(pendingAppealsRows[0]?.count ?? '0'),
      pendingRegistrations: Number(pendingRegistrationRows[0]?.count ?? '0'),
      mediaObjects: Number(mediaRow.count ?? '0'),
      mediaStoredBytes: Number(mediaRow.bytes ?? '0'),
      storagePolicies: Number(policyCountRows[0]?.count ?? '0'),
      syncTasks: syncMap,
    };
  }

  async getConfig(): Promise<SystemConfig> {
    const rows = await this.databaseService.query<{ configValue: SystemConfig }>(
      `
        SELECT config_value AS "configValue"
        FROM dashboard.system_config
        WHERE config_key = 'core'
        LIMIT 1
      `
    );

    return rows.length ? rows[0].configValue : DEFAULT_SYSTEM_CONFIG;
  }

  async updateConfig(updates: UpdateSystemConfigInput, actorId: string): Promise<SystemConfig> {
    const current = await this.getConfig();
    const next = this.normalizeConfig({
      ...current,
      ...updates,
    });

    await this.databaseService.query(
      `
        INSERT INTO dashboard.system_config (config_key, config_value, updated_by, updated_at)
        VALUES ('core', $1::jsonb, $2, NOW())
        ON CONFLICT (config_key) DO UPDATE
        SET config_value = EXCLUDED.config_value,
            updated_by = EXCLUDED.updated_by,
            updated_at = NOW()
      `,
      [JSON.stringify(next), actorId]
    );

    await this.operationLogService.record({
      actorId,
      action: 'system_config_update',
      metadata: updates,
    });

    return next;
  }

  private normalizeConfig(config: SystemConfig): SystemConfig {
    const registrationMode = this.validateRegistrationMode(config.registrationMode);
    const mediaCoolingHours = Math.max(1, Math.min(config.mediaCoolingHours, 24 * 30));

    return {
      registrationMode,
      autoApproveRegistrations: Boolean(config.autoApproveRegistrations),
      requireCaptcha: Boolean(config.requireCaptcha),
      maintenanceMode: Boolean(config.maintenanceMode),
      mediaCoolingHours,
    };
  }

  private validateRegistrationMode(mode: string | undefined): SystemConfig['registrationMode'] {
    switch (mode) {
      case 'disabled':
      case 'sms':
      case 'email':
      case 'email_and_sms':
        return mode;
      default:
        return DEFAULT_SYSTEM_CONFIG.registrationMode;
    }
  }

  private async checkDatabase(): Promise<ServiceHealth> {
    const start = Date.now();
    try {
      await this.databaseService.query('SELECT 1');
      const latency = Date.now() - start;
      return {
        status: 'up' as const,
        latencyMs: latency,
      };
    } catch (error) {
      return {
        status: 'down' as const,
        message: (error as Error).message,
      };
    }
  }

  private async checkRedis(): Promise<ServiceHealth> {
    const start = Date.now();
    try {
      await this.redisService.ping();
      const latency = Date.now() - start;
      return {
        status: 'up' as const,
        latencyMs: latency,
      };
    } catch (error) {
      return {
        status: 'down' as const,
        message: (error as Error).message,
      };
    }
  }
}
