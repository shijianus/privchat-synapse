import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { config } from '../config/env';
import { DatabaseService } from '../database/database-service';
import { RedisService } from '../redis/redis-service';
import {
  DiskUsage,
  GpuUsage,
  LogEntry,
  MonitorSnapshot,
  NetworkUsage,
  PoolStats,
  QuickStats,
  RedisCacheStats,
  ServiceCheck,
  ServiceStatus,
  SystemIdentity,
  UsageValue,
} from '../types/monitoring';
import { SystemService } from './system-service';

const execFileAsync = promisify(execFile);
const MINIO_HEALTH_ENDPOINT =
  process.env.MINIO_HEALTH_ENDPOINT || 'http://127.0.0.1:9000/minio/health/live';
const MINIO_HEALTH_ENABLED =
  (process.env.ENABLE_MINIO_HEALTH || '').toLowerCase() === '1' ||
  (process.env.ENABLE_MINIO_HEALTH || '').toLowerCase() === 'true';

type CpuSample = {
  readonly idle: number;
  readonly total: number;
};

type NetSample = {
  readonly timestamp: number;
  readonly rxBytes: number;
  readonly txBytes: number;
  readonly interfaceCount: number;
};

/**
 * 汇聚节点级系统指标、服务连通性以及数据库/Redis 状态，为公开监控页面提供数据。
 */
export class MonitoringService {
  private previousCpuSample: CpuSample | null = null;
  private previousNetSample: NetSample | null = null;

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly redisService: RedisService,
    private readonly systemService: SystemService
  ) {}

  async getSnapshot(): Promise<MonitorSnapshot> {
    const collectedAt = new Date().toISOString();
    const [resources, services, postgresPool, redisStats, stats, logs, system] = await Promise.all([
      this.collectResources(),
      this.checkCoreServices(),
      this.getPostgresPoolStats(),
      this.getRedisStats(),
      this.collectQuickStats(),
      this.readRecentLogs(),
      this.getSystemIdentity(),
    ]);

    return {
      collectedAt,
      refreshIntervalSeconds: 5,
      resources,
      services,
      pools: {
        postgres: postgresPool,
        redis: redisStats,
      },
      stats,
      logs,
      system,
      warnings: this.buildWarnings(resources, services),
    };
  }

  async getHealthSummary(): Promise<{
    readonly status: ServiceStatus;
    readonly uptimeSeconds: number;
    readonly timestamp: string;
    readonly services: MonitorSnapshot['services'];
  }> {
    const services = await this.checkCoreServices();
    const anyDown = Object.values(services).some((service) => service.status === 'down');
    const anyDegraded = Object.values(services).some((service) => service.status === 'degraded');

    const status: ServiceStatus = anyDown ? 'down' : anyDegraded ? 'degraded' : 'up';

    return {
      status,
      uptimeSeconds: process.uptime(),
      timestamp: new Date().toISOString(),
      services,
    };
  }

  private async collectResources(): Promise<MonitorSnapshot['resources']> {
    const [disk, gpu, network] = await Promise.all([
      this.getDiskUsage(),
      this.getGpuUsage(),
      this.getNetworkUsage(),
    ]);

    const cpuUsagePercent = this.calculateCpuUsage();
    const memory = this.getMemoryUsage();

    return {
      cpuUsagePercent,
      memory,
      disk,
      gpu,
      network,
    };
  }

  private async checkCoreServices(): Promise<MonitorSnapshot['services']> {
    const [synapse, postgres, redis, minio] = await Promise.all([
      this.checkSynapse(),
      this.checkPostgres(),
      this.checkRedis(),
      this.checkMinio(),
    ]);

    const dashboard: ServiceCheck = {
      name: 'dashboard',
      status: 'up',
      latencyMs: 0,
      endpoint: `http://${config.host}:${config.port}`,
    };

    return {
      synapse,
      dashboard,
      postgres,
      redis,
      minio,
    };
  }

  private async collectQuickStats(): Promise<QuickStats> {
    try {
      const baseStats = await this.systemService.getSystemStats();
      const [onlineUsers, todaysMessages, activeRooms] = await Promise.all([
        this.safeCountQuery(
          `
            SELECT COUNT(DISTINCT user_id)::text AS count
            FROM user_ips
            WHERE last_seen > (EXTRACT(EPOCH FROM NOW()) * 1000 - 300000)
          `
        ),
        this.safeCountQuery(
          `
            SELECT COUNT(*)::text AS count
            FROM events
            WHERE origin_server_ts >= (EXTRACT(EPOCH FROM NOW() - INTERVAL '24 HOURS') * 1000)
              AND type = 'm.room.message'
          `
        ),
        this.safeCountQuery(
          `
            SELECT COUNT(DISTINCT room_id)::text AS count
            FROM events
            WHERE origin_server_ts >= (EXTRACT(EPOCH FROM NOW() - INTERVAL '1 HOUR') * 1000)
          `
        ),
      ]);

      return {
        totalUsers: baseStats.totalUsers,
        activeBans: baseStats.activeBans,
        pendingAppeals: baseStats.pendingAppeals,
        pendingRegistrations: baseStats.pendingRegistrations,
        onlineUsers,
        todaysMessages,
        activeRooms,
      };
    } catch (error) {
      return {
        totalUsers: 0,
        activeBans: 0,
        pendingAppeals: 0,
        pendingRegistrations: 0,
        onlineUsers: null,
        todaysMessages: null,
        activeRooms: null,
      };
    }
  }

  private async getPostgresPoolStats(): Promise<PoolStats | null> {
    try {
      return this.databaseService.getPoolStats();
    } catch (error) {
      return null;
    }
  }

  private async getRedisStats(): Promise<RedisCacheStats | null> {
    try {
      const infoRaw = await this.redisService.info();
      const info = this.parseRedisInfo(infoRaw);

      const hits = info.keyspaceHits;
      const misses = info.keyspaceMisses;
      const total = hits + misses;
      const hitRate = total > 0 ? hits / total : null;

      return {
        usedMemoryBytes: info.usedMemory,
        hitRate,
        keyCount: info.keyCount,
        status: 'up',
      };
    } catch (error) {
      return {
        usedMemoryBytes: null,
        hitRate: null,
        keyCount: null,
        status: 'down',
        message: (error as Error).message,
      };
    }
  }

  private parseRedisInfo(raw: string): {
    readonly usedMemory: number | null;
    readonly keyspaceHits: number;
    readonly keyspaceMisses: number;
    readonly keyCount: number | null;
  } {
    const lines = raw.split('\n');
    let usedMemory: number | null = null;
    let keyspaceHits = 0;
    let keyspaceMisses = 0;
    let keyCount: number | null = null;

    for (const line of lines) {
      if (line.startsWith('used_memory:')) {
        usedMemory = Number(line.split(':')[1]) || null;
      } else if (line.startsWith('keyspace_hits:')) {
        keyspaceHits = Number(line.split(':')[1]) || 0;
      } else if (line.startsWith('keyspace_misses:')) {
        keyspaceMisses = Number(line.split(':')[1]) || 0;
      } else if (line.startsWith('db0:')) {
        const match = line.match(/keys=(\d+)/);
        if (match?.[1]) {
          keyCount = Number(match[1]);
        }
      }
    }

    return { usedMemory, keyspaceHits, keyspaceMisses, keyCount };
  }

  private getMemoryUsage(): UsageValue {
    const totalBytes = os.totalmem();
    const freeBytes = os.freemem();
    const usedBytes = totalBytes - freeBytes;
    const usagePercent = totalBytes > 0 ? (usedBytes / totalBytes) * 100 : 0;

    return {
      usedBytes,
      totalBytes,
      usagePercent,
    };
  }

  private calculateCpuUsage(): number | null {
    const sample = this.sampleCpuTimes();

    if (!this.previousCpuSample) {
      this.previousCpuSample = sample;
      return null;
    }

    const idleDelta = sample.idle - this.previousCpuSample.idle;
    const totalDelta = sample.total - this.previousCpuSample.total;
    this.previousCpuSample = sample;

    if (totalDelta <= 0) {
      return null;
    }

    const usage = (1 - idleDelta / totalDelta) * 100;
    return Math.max(0, Math.min(usage, 100));
  }

  private sampleCpuTimes(): CpuSample {
    const cpus = os.cpus();
    return cpus.reduce(
      (acc, cpu) => {
        const { user, nice, sys, idle, irq } = cpu.times;
        const total = user + nice + sys + idle + irq;
        return {
          idle: acc.idle + idle,
          total: acc.total + total,
        };
      },
      { idle: 0, total: 0 }
    );
  }

  private async getDiskUsage(): Promise<DiskUsage | null> {
    try {
      const { stdout } = await execFileAsync('df', ['-k', '/']);
      const lines = stdout.trim().split('\n');
      if (lines.length < 2) {
        return null;
      }

      const parts = lines[1].split(/\s+/);
      if (parts.length < 6) {
        return null;
      }

      const totalKb = Number(parts[1]);
      const usedKb = Number(parts[2]);
      const availableKb = Number(parts[3]);

      return {
        mount: parts[5] || '/',
        totalBytes: totalKb * 1024,
        usedBytes: usedKb * 1024,
        availableBytes: availableKb * 1024,
        usagePercent: totalKb > 0 ? (usedKb / totalKb) * 100 : 0,
      };
    } catch (error) {
      return null;
    }
  }

  private async getGpuUsage(): Promise<GpuUsage | null> {
    try {
      const { stdout } = await execFileAsync('nvidia-smi', [
        '--query-gpu=utilization.gpu',
        '--format=csv,noheader,nounits',
      ]);
      const raw = stdout.trim().split('\n')[0];
      const value = Number(raw);
      return {
        usagePercent: Number.isFinite(value) ? value : null,
      };
    } catch (error) {
      return {
        usagePercent: null,
        message: 'nvidia-smi not available',
      };
    }
  }

  private async getNetworkUsage(): Promise<NetworkUsage | null> {
    try {
      const content = await fs.readFile('/proc/net/dev', 'utf8');
      const lines = content.trim().split('\n').slice(2);
      let rxBytes = 0;
      let txBytes = 0;
      let interfaceCount = 0;

      for (const line of lines) {
        const [ifacePart, rest] = line.split(':');
        const iface = ifacePart.trim();
        if (!iface || iface === 'lo') {
          continue;
        }

        const parts = rest.trim().split(/\s+/);
        if (parts.length < 9) {
          continue;
        }

        rxBytes += Number(parts[0]) || 0;
        txBytes += Number(parts[8]) || 0;
        interfaceCount += 1;
      }

      const now = Date.now();
      if (!this.previousNetSample) {
        this.previousNetSample = { timestamp: now, rxBytes, txBytes, interfaceCount };
        return {
          rxBytesPerSec: null,
          txBytesPerSec: null,
          sampleIntervalSeconds: null,
          interfaceCount,
        };
      }

      const intervalSeconds = (now - this.previousNetSample.timestamp) / 1000;
      if (intervalSeconds <= 0) {
        return null;
      }

      const rxBytesPerSec = (rxBytes - this.previousNetSample.rxBytes) / intervalSeconds;
      const txBytesPerSec = (txBytes - this.previousNetSample.txBytes) / intervalSeconds;

      this.previousNetSample = { timestamp: now, rxBytes, txBytes, interfaceCount };

      return {
        rxBytesPerSec,
        txBytesPerSec,
        sampleIntervalSeconds: intervalSeconds,
        interfaceCount,
      };
    } catch (error) {
      return null;
    }
  }

  private async checkSynapse(): Promise<ServiceCheck> {
    const targetUrl = this.resolveSynapseUrl();
    return this.checkHttpService('synapse', targetUrl);
  }

  private resolveSynapseUrl(): string {
    try {
      const adminUrl = new URL(config.synapse.adminBaseUrl);
      return `${adminUrl.protocol}//${adminUrl.host}/_matrix/client/versions`;
    } catch (error) {
      return 'http://127.0.0.1:8008/_matrix/client/versions';
    }
  }

  private async checkPostgres(): Promise<ServiceCheck> {
    const start = Date.now();
    try {
      await this.databaseService.query('SELECT 1');
      const latency = Date.now() - start;
      return {
        name: 'postgres',
        status: latency > 1200 ? 'degraded' : 'up',
        latencyMs: latency,
      };
    } catch (error) {
      return {
        name: 'postgres',
        status: 'down',
        latencyMs: Date.now() - start,
        message: (error as Error).message,
      };
    }
  }

  private async checkRedis(): Promise<ServiceCheck> {
    const start = Date.now();
    try {
      await this.redisService.ping();
      const latency = Date.now() - start;
      return {
        name: 'redis',
        status: latency > 800 ? 'degraded' : 'up',
        latencyMs: latency,
      };
    } catch (error) {
      return {
        name: 'redis',
        status: 'down',
        latencyMs: Date.now() - start,
        message: (error as Error).message,
      };
    }
  }

  private async checkMinio(): Promise<ServiceCheck> {
    if (!MINIO_HEALTH_ENABLED || !MINIO_HEALTH_ENDPOINT) {
      return {
        name: 'minio',
        status: 'up',
        latencyMs: 0,
        message: 'minio health check disabled',
      };
    }

    return this.checkHttpService('minio', MINIO_HEALTH_ENDPOINT, 1000);
  }

  private async checkHttpService(
    name: string,
    url: string,
    timeoutMs = 1500
  ): Promise<ServiceCheck> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const start = Date.now();

    try {
      const response = await fetch(url, { signal: controller.signal });
      const latency = Date.now() - start;
      clearTimeout(timeout);

      if (!response.ok) {
        return {
          name,
          status: 'down',
          latencyMs: latency,
          message: `HTTP ${response.status}`,
          endpoint: url,
        };
      }

      return {
        name,
        status: latency > timeoutMs * 0.75 ? 'degraded' : 'up',
        latencyMs: latency,
        endpoint: url,
      };
    } catch (error) {
      clearTimeout(timeout);
      return {
        name,
        status: 'down',
        latencyMs: Date.now() - start,
        message: (error as Error).message,
        endpoint: url,
      };
    }
  }

  private async safeCountQuery(sql: string): Promise<number | null> {
    try {
      const rows = await this.databaseService.query<{ count: string }>(sql);
      const value = Number(rows[0]?.count ?? '0');
      return Number.isFinite(value) ? value : null;
    } catch (error) {
      return null;
    }
  }

  private async readRecentLogs(): Promise<LogEntry[]> {
    const candidates = [
      path.resolve(process.cwd(), 'logs/backend.log'),
      path.resolve(process.cwd(), 'log.txt'),
    ];

    for (const candidate of candidates) {
      try {
        const content = await fs.readFile(candidate, 'utf8');
        const lines = content.trim().split('\n').filter(Boolean);
        if (!lines.length) {
          continue;
        }

        return lines
          .slice(-40)
          .map((line) => this.parseLogLine(line))
          .filter((entry): entry is LogEntry => Boolean(entry));
      } catch {
        // 文件不存在或无法读取时继续尝试下一个
      }
    }

    return [];
  }

  private parseLogLine(line: string): LogEntry | null {
    const match = line.match(
      /^(?<timestamp>\d{4}-\d{2}-\d{2}[^ ]*)\s+(?<level>[A-Z]+)\s+(?<message>.+)$/
    );

    if (!match?.groups) {
      return {
        timestamp: new Date().toISOString(),
        level: 'INFO',
        message: line.trim(),
      };
    }

    const { timestamp, level, message } = match.groups;
    return {
      timestamp: new Date(timestamp).toISOString(),
      level: level.toUpperCase(),
      message: message.trim(),
    };
  }

  private async getSystemIdentity(): Promise<SystemIdentity> {
    return {
      os: `${os.type()} ${os.release()}`,
      uptimeSeconds: os.uptime(),
      dashboardVersion: await this.readPackageVersion(),
      synapseVersion: null,
      nodeVersion: process.version,
      host: config.host,
    };
  }

  private async readPackageVersion(): Promise<string> {
    try {
      const packagePath = path.resolve(process.cwd(), 'package.json');
      const raw = await fs.readFile(packagePath, 'utf8');
      const parsed = JSON.parse(raw) as { version?: string };
      return parsed.version || 'unknown';
    } catch (error) {
      return 'unknown';
    }
  }

  private buildWarnings(
    resources: MonitorSnapshot['resources'],
    services: MonitorSnapshot['services']
  ): string[] {
    const warnings: string[] = [];

    if (resources.cpuUsagePercent === null) {
      warnings.push('CPU 使用率等待采样中');
    }

    if (resources.disk?.usagePercent && resources.disk.usagePercent > 90) {
      warnings.push('磁盘使用率超过 90%，请检查存储策略');
    }

    if (resources.memory.usagePercent > 90) {
      warnings.push('内存使用率超过 90%');
    }

    Object.values(services).forEach((service) => {
      if (service.status === 'degraded') {
        warnings.push(`${service.name} 响应较慢`);
      } else if (service.status === 'down') {
        warnings.push(`${service.name} 不可用`);
      }
    });

    return warnings;
  }
}
