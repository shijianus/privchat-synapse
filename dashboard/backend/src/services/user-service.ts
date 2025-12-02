import crypto from 'crypto';
import { PoolClient } from 'pg';

import { config } from '../config/env';
import { DatabaseService } from '../database/database-service';
import { RedisService } from '../redis/redis-service';
import { createBadRequestError, createNotFoundError } from '../utils/http-error';
import {
  CreateUserPayload,
  ProvisionedUser,
  UserProfile,
  UserProfileFilter,
  UserProfileUpdateRequest,
  UserProfileUpsertRequest,
} from '../types/user';
import { RegistrationBlacklistType } from '../types/registration';
import { OperationLogService } from './operation-log-service';
import { SynapseAdminService } from './synapse-admin-service';

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
    private readonly operationLogService: OperationLogService,
    private readonly synapseAdminService: SynapseAdminService
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

  async provisionSynapseUser(
    payload: CreateUserPayload,
    actorId: string
  ): Promise<ProvisionedUser> {
    const username = payload.username.trim();
    if (!username) {
      throw createBadRequestError('用户名不能为空');
    }

    const normalizedEmail = payload.email?.trim();
    const normalizedMsisdn = payload.msisdn?.trim();
    const normalizedUserId = this.buildMatrixUserId(username);

    await this.rejectIfBlacklisted({
      username,
      email: normalizedEmail,
      msisdn: normalizedMsisdn,
    });

    if (await this.userExists(normalizedUserId)) {
      throw createBadRequestError('该 Matrix ID 已存在，请更换用户名');
    }

    const trimmedPassword = (payload.password ?? '').trim();
    const shouldGeneratePassword = payload.generatePassword !== false;
    if (!shouldGeneratePassword && !trimmedPassword) {
      throw createBadRequestError('未提供初始密码');
    }

    const password = shouldGeneratePassword ? this.generateStrongPassword() : trimmedPassword;
    this.ensurePasswordStrength(password);

    const provisionResult = await this.synapseAdminService.createUser({
      username,
      password,
      displayName: payload.displayName?.trim() || undefined,
    });

    const synapseUserId = provisionResult.userId || normalizedUserId;
    const profile = await this.upsertProfile(
      synapseUserId,
      {
        userGroup: payload.userGroup ?? 'standard',
        registrationStatus: payload.registrationStatus ?? 'active',
        riskLevel: payload.riskLevel ?? 'low',
        source: 'dashboard_provision',
      },
      actorId
    );

    await this.operationLogService.record({
      actorId,
      action: 'create_synapse_user',
      targetSynapseUserId: synapseUserId,
      metadata: {
        userGroup: profile.userGroup,
        registrationStatus: profile.registrationStatus,
        riskLevel: profile.riskLevel,
        joinDefaultRoomsRequested: Boolean(payload.joinDefaultRooms),
        sendWelcomeMessageRequested: Boolean(payload.sendWelcomeMessage),
        forcePasswordReset: Boolean(payload.forcePasswordReset),
        generatedPassword: shouldGeneratePassword,
        synapseRequestId: provisionResult.requestId,
      },
    });

    return {
      synapseUserId,
      userGroup: profile.userGroup,
      registrationStatus: profile.registrationStatus,
      riskLevel: profile.riskLevel,
      initialPassword: password,
      createdAt: profile.createdAt,
    };
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
      action: 'user_profile_updated',
      user_ids: [synapseUserId],
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

  private async upsertProfile(
    synapseUserId: string,
    payload: UserProfileUpsertRequest,
    actorId?: string
  ): Promise<UserProfile> {
    const rows = await this.databaseService.query<UserProfileRow>(
      `
        INSERT INTO dashboard.user_profiles
        (synapse_user_id, user_group, registration_status, risk_level, last_login_at)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (synapse_user_id) DO UPDATE
        SET user_group = EXCLUDED.user_group,
            registration_status = EXCLUDED.registration_status,
            risk_level = EXCLUDED.risk_level,
            last_login_at = COALESCE(EXCLUDED.last_login_at, dashboard.user_profiles.last_login_at),
            updated_at = NOW()
        RETURNING
          id,
          synapse_user_id AS "synapseUserId",
          user_group AS "userGroup",
          registration_status AS "registrationStatus",
          risk_level AS "riskLevel",
          last_login_at AS "lastLoginAt",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
      `,
      [
        synapseUserId,
        payload.userGroup ?? 'standard',
        payload.registrationStatus ?? 'active',
        payload.riskLevel ?? 'low',
        payload.lastLoginAt ? new Date(payload.lastLoginAt) : null,
      ]
    );

    const profile = mapUserProfile(rows[0]);

    if (actorId) {
      await this.operationLogService.record({
        actorId,
        action: 'user_profile_upsert',
        targetSynapseUserId: synapseUserId,
        metadata: {
          userGroup: profile.userGroup,
          registrationStatus: profile.registrationStatus,
          riskLevel: profile.riskLevel,
          source: payload.source,
        },
      });
    }

    await this.cacheProfile(profile);
    await this.publishUserProfileUpdate(profile.synapseUserId);

    return profile;
  }

  private async cacheProfile(profile: UserProfile): Promise<void> {
    await this.redisService.cacheJson(
      this.getCacheKey(profile.synapseUserId),
      profile,
      config.cacheTtlSeconds
    );
  }

  private async publishUserProfileUpdate(synapseUserId: string): Promise<void> {
    await this.redisService.publish(config.redisUserEventsChannel, {
      action: 'user_profile_updated',
      user_ids: [synapseUserId],
    });
  }

  private async rejectIfBlacklisted(values: {
    username?: string;
    email?: string | null;
    msisdn?: string | null;
  }): Promise<void> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    const addCondition = (type: RegistrationBlacklistType, value?: string | null): void => {
      if (!value) return;
      params.push(value);
      conditions.push(`(type = '${type}' AND value = $${params.length})`);
    };

    addCondition('username', values.username);
    addCondition('email', values.email);
    addCondition('msisdn', values.msisdn);

    if (!conditions.length) {
      return;
    }

    const rows = await this.databaseService.query<{
      type: RegistrationBlacklistType;
      value: string;
      expiresAt: Date | null;
    }>(
      `
        SELECT type, value, expires_at AS "expiresAt"
        FROM dashboard.registration_blacklist
        WHERE ${conditions.join(' OR ')}
      `,
      params
    );

    const now = Date.now();
    const activeHits = rows.filter((row) => !row.expiresAt || row.expiresAt.getTime() > now);
    if (activeHits.length) {
      const detail = activeHits.map((row) => `${row.type}:${row.value}`).join(', ');
      throw createBadRequestError(`命中注册黑名单: ${detail}`);
    }
  }

  private async userExists(synapseUserId: string): Promise<boolean> {
    const rows = await this.databaseService.query<{ exists: boolean }>(
      `
        SELECT EXISTS (
          SELECT 1 FROM dashboard.user_profiles WHERE synapse_user_id = $1
        ) AS "exists"
      `,
      [synapseUserId]
    );

    return Boolean(rows[0]?.exists);
  }

  private generateStrongPassword(length = 16): string {
    const charset = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%^&*()-_=+';
    const complexity = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&()_\-+=])/;

    // 确保包含大小写、数字和特殊字符
    let password = '';
    do {
      const bytes = crypto.randomBytes(length);
      let candidate = '';
      for (let i = 0; i < length; i += 1) {
        candidate += charset[bytes[i] % charset.length];
      }
      password = candidate;
    } while (!complexity.test(password));

    return password;
  }

  private ensurePasswordStrength(password: string): void {
    if (password.length < 12) {
      throw createBadRequestError('初始密码至少 12 位，需包含大小写、数字和符号');
    }

    const complexity = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&()_\-+=])/;
    if (!complexity.test(password)) {
      throw createBadRequestError('初始密码需包含大小写、数字和特殊字符');
    }
  }

  private buildMatrixUserId(username: string): string {
    if (username.startsWith('@') && username.includes(':')) {
      if (!username.endsWith(`:${config.synapse.serverName}`)) {
        throw createBadRequestError(`仅允许创建 ${config.synapse.serverName} 域的账户`);
      }
      return username;
    }
    return `@${username}:${config.synapse.serverName}`;
  }
}
