import { PoolClient } from 'pg';

import { config } from '../config/env';
import { DatabaseService } from '../database/database-service';
import { RedisService } from '../redis/redis-service';
import { createBadRequestError, createNotFoundError } from '../utils/http-error';
import { UserProfile, UserProfileFilter, UserProfileUpdateRequest } from '../types/user';
import { OperationLogService } from './operation-log-service';

interface UserProfileRow {
  readonly id: number;
  readonly synapseUserId: string;
  readonly userGroup: string;
  readonly registrationStatus: string;
  readonly riskLevel: string;
  readonly lastLoginAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

const toIsoString = (value?: Date | null): string | null =>
  value ? value.toISOString() : null;

const mapUserProfile = (row: UserProfileRow): UserProfile => ({
  id: row.id,
  synapseUserId: row.synapseUserId,
  userGroup: row.userGroup,
  registrationStatus: row.registrationStatus,
  riskLevel: row.riskLevel,
  lastLoginAt: toIsoString(row.lastLoginAt),
  createdAt: toIsoString(row.createdAt) || new Date().toISOString(),
  updatedAt: toIsoString(row.updatedAt) || new Date().toISOString(),
});

/**
 * 用户服务，负责管理 user_profiles 相关逻辑
 */
export class UserService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly redisService: RedisService,
    private readonly operationLogService: OperationLogService
  ) {}

  async listUsers(filters: UserProfileFilter): Promise<UserProfile[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters.userGroup) {
      params.push(filters.userGroup);
      conditions.push(`user_group = $${params.length}`);
    }

    if (filters.registrationStatus) {
      params.push(filters.registrationStatus);
      conditions.push(`registration_status = $${params.length}`);
    }

    if (filters.riskLevel) {
      params.push(filters.riskLevel);
      conditions.push(`risk_level = $${params.length}`);
    }

    if (filters.keyword) {
      params.push(`%${filters.keyword}%`);
      conditions.push(`synapse_user_id ILIKE $${params.length}`);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const sql = `
      SELECT
        id,
        synapse_user_id AS "synapseUserId",
        user_group AS "userGroup",
        registration_status AS "registrationStatus",
        risk_level AS "riskLevel",
        last_login_at AS "lastLoginAt",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM dashboard.user_profiles
      ${whereClause}
      ORDER BY updated_at DESC
      LIMIT 100
    `;

    const rows = await this.databaseService.query<UserProfileRow>(sql, params);
    return rows.map(mapUserProfile);
  }

  async getBySynapseId(synapseUserId: string): Promise<UserProfile> {
    const cacheKey = this.getCacheKey(synapseUserId);
    const cached = await this.redisService.readJson<UserProfile>(cacheKey);
    if (cached) {
      return cached;
    }

    const row = await this.fetchUserRow(synapseUserId);
    const profile = mapUserProfile(row);
    await this.redisService.cacheJson(cacheKey, profile, config.cacheTtlSeconds);
    return profile;
  }

  async updateProfile(
    synapseUserId: string,
    payload: UserProfileUpdateRequest,
    actorId: string
  ): Promise<UserProfile> {
    const updates: string[] = [];
    const params: unknown[] = [];

    const assignField = (column: string, value: unknown) => {
      params.push(value);
      updates.push(`${column} = $${params.length}`);
    };

    if (payload.userGroup) {
      assignField('user_group', payload.userGroup);
    }

    if (payload.registrationStatus) {
      assignField('registration_status', payload.registrationStatus);
    }

    if (payload.riskLevel) {
      assignField('risk_level', payload.riskLevel);
    }

    if (payload.lastLoginAt !== undefined) {
      assignField('last_login_at', payload.lastLoginAt ? new Date(payload.lastLoginAt) : null);
    }

    if (!updates.length) {
      throw createBadRequestError('没有可更新的字段');
    }

    params.push(synapseUserId);

    const sql = `
      UPDATE dashboard.user_profiles
      SET ${updates.join(', ')}, updated_at = NOW()
      WHERE synapse_user_id = $${params.length}
      RETURNING
        id,
        synapse_user_id AS "synapseUserId",
        user_group AS "userGroup",
        registration_status AS "registrationStatus",
        risk_level AS "riskLevel",
        last_login_at AS "lastLoginAt",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
    `;

    const updated = await this.databaseService.query<UserProfileRow>(sql, params);
    if (!updated.length) {
      throw createNotFoundError('指定用户不存在');
    }

    const profile = mapUserProfile(updated[0]);
    await this.operationLogService.record({
      actorId,
      action: 'update_user_profile',
      targetSynapseUserId: synapseUserId,
      metadata: (payload as unknown) as Record<string, unknown>,
    });

    await this.redisService.cacheJson(this.getCacheKey(synapseUserId), profile, config.cacheTtlSeconds);
    await this.redisService.publish(config.redisUserEventsChannel, {
      type: 'user_profile_updated',
      synapseUserId,
    });

    return profile;
  }

  async getInternalUserId(synapseUserId: string, client?: PoolClient): Promise<number> {
    const row = await this.fetchUserRow(synapseUserId, client);
    return row.id;
  }

  async invalidateCache(synapseUserId: string): Promise<void> {
    await this.redisService.deleteKey(this.getCacheKey(synapseUserId));
  }

  private async fetchUserRow(
    synapseUserId: string,
    client?: PoolClient
  ): Promise<UserProfileRow> {
    const sql = `
      SELECT
        id,
        synapse_user_id AS "synapseUserId",
        user_group AS "userGroup",
        registration_status AS "registrationStatus",
        risk_level AS "riskLevel",
        last_login_at AS "lastLoginAt",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM dashboard.user_profiles
      WHERE synapse_user_id = $1
      LIMIT 1
    `;

    const rows = client
      ? await this.databaseService.queryWithClient<UserProfileRow>(client, sql, [synapseUserId])
      : await this.databaseService.query<UserProfileRow>(sql, [synapseUserId]);

    if (!rows.length) {
      throw createNotFoundError('指定用户不存在');
    }

    return rows[0];
  }

  private getCacheKey(synapseUserId: string): string {
    return `dashboard:user_profile:${synapseUserId}`;
  }
}
