import bcrypt from 'bcrypt';
import { PoolClient } from 'pg';
import { authenticator } from 'otplib';

import { config } from '../config/env';
import { DatabaseService } from '../database/database-service';
import { RedisService } from '../redis/redis-service';
import {
  FriendVerificationPayload,
  FriendVerificationResult,
  TwoFactorMethod,
  TwoFactorStatus,
  TwoFactorVerificationPayload,
  TwoFactorVerificationResult,
} from '../types/two-factor';
import { createBadRequestError, HttpError } from '../utils/http-error';
import { OperationLogService } from './operation-log-service';
import { UserService } from './user-service';

interface TwoFactorSettingsRow {
  readonly id: number;
  readonly userId: number;
  readonly secondaryPasswordHash: string | null;
  readonly totpSecret: string | null;
  readonly totpEnabled: boolean;
  readonly email2faEnabled: boolean;
  readonly phone2faEnabled: boolean;
  readonly safetyCodes: string[] | null;
  readonly recoveryKeyEncrypted: string | null;
  readonly trustedDeviceLimit: number;
  readonly lastVerifiedAt: Date | null;
  readonly updatedAt: Date;
}

interface VerificationChallengeRow {
  readonly id: number;
  readonly codeHash: string;
  readonly expiresAt: Date;
}

interface FriendVerificationRow {
  readonly id: number;
  readonly verificationHash: string;
  readonly expiresAt: Date;
}

interface TrustedDevicePayload {
  readonly deviceId?: string;
  readonly deviceName?: string;
  readonly ipAddress?: string;
  readonly trustDevice?: boolean;
}

/**
 * 二次验证服务，负责完成 2FA 状态查询、验证码校验以及好友担保验证等工作
 */
export class TwoFactorService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly redisService: RedisService,
    private readonly operationLogService: OperationLogService,
    private readonly userService: UserService
  ) {}

  /**
   * 按照 Matrix ID 查询当前 2FA 状态概况
   */
  async getStatusForSynapseUser(synapseUserId: string): Promise<TwoFactorStatus> {
    const profile = await this.userService.getBySynapseId(synapseUserId);
    const settings = await this.loadSettings(profile.id);

    const methods: TwoFactorMethod[] = [];
    if (settings.secondaryPasswordHash) {
      methods.push('secondary_password');
    }
    if (settings.totpEnabled && settings.totpSecret) {
      methods.push('totp');
    }
    if (settings.email2faEnabled) {
      methods.push('email');
    }
    if (settings.phone2faEnabled) {
      methods.push('sms');
    }
    if ((settings.safetyCodes?.length ?? 0) > 0) {
      methods.push('safety_code');
    }

    const [trustedDeviceRows, friendRequestRows] = await Promise.all([
      this.databaseService.query<{ count: string }>(
        `
          SELECT COUNT(*)::text AS count
          FROM dashboard.user_devices
          WHERE user_id = $1 AND is_trusted = TRUE
        `,
        [profile.id]
      ),
      this.databaseService.query<{ count: string }>(
        `
          SELECT COUNT(*)::text AS count
          FROM dashboard.friend_verification_requests
          WHERE user_id = $1
            AND status = 'pending'
            AND expires_at > NOW()
        `,
        [profile.id]
      ),
    ]);

    return {
      synapseUserId: profile.synapseUserId,
      requiresSecondaryPassword: Boolean(settings.secondaryPasswordHash),
      availableMethods: methods,
      trustedDeviceCount: Number(trustedDeviceRows[0]?.count ?? '0'),
      pendingFriendVerification: Number(friendRequestRows[0]?.count ?? '0') > 0,
      lastUpdatedAt: settings.updatedAt?.toISOString() ?? null,
      lastVerifiedAt: settings.lastVerifiedAt?.toISOString() ?? null,
    };
  }

  /**
   * 校验用户提交的 2FA 验证信息，并可选择标记信任设备
   */
  async verifySecondFactor(
    payload: TwoFactorVerificationPayload
  ): Promise<TwoFactorVerificationResult> {
    if (!payload.synapseUserId) {
      throw createBadRequestError('缺少 synapseUserId');
    }

    const verificationTime = new Date();

    return this.databaseService.withTransaction(async (client) => {
      const userId = await this.userService.getInternalUserId(payload.synapseUserId, client);
      const settings = await this.loadSettings(userId, client);

      await this.performVerification(payload, settings, client);

      await this.databaseService.queryWithClient(
        client,
        `
          UPDATE dashboard.user_2fa_settings
          SET last_verified_at = $2, updated_at = $2
          WHERE user_id = $1
        `,
        [userId, verificationTime]
      );

      await this.upsertDeviceRecord(userId, payload, client);

      await this.operationLogService.record(
        {
          actorId: payload.actorId ?? `user:${payload.synapseUserId}`,
          action: 'user_2fa_verified',
          targetSynapseUserId: payload.synapseUserId,
          metadata: {
            method: payload.method,
            deviceId: payload.deviceId,
            trustDevice: Boolean(payload.trustDevice && payload.deviceId),
          },
        },
        client
      );

      await this.redisService.publish(config.redisUserEventsChannel, {
        type: 'two_factor_verified',
        synapseUserId: payload.synapseUserId,
        method: payload.method,
      });

      return {
        success: true,
        method: payload.method,
        lastVerifiedAt: verificationTime.toISOString(),
        trustedDeviceId: payload.trustDevice && payload.deviceId ? payload.deviceId : undefined,
      };
    });
  }

  /**
   * 好友担保流程，由 Matrix Bot 触发
   */
  async verifyFriend(payload: FriendVerificationPayload): Promise<FriendVerificationResult> {
    return this.databaseService.withTransaction(async (client) => {
      const normalizedTarget = payload.targetMatrixId.trim();
      const userId = await this.userService.getInternalUserId(normalizedTarget, client);

      await this.expireFriendRequests(userId, client);

      const request = await this.fetchFriendRequest(userId, client);
      if (!request) {
        return {
          success: false,
          reason: '未找到有效的担保请求或已过期',
        };
      }

      const matches = await bcrypt.compare(payload.verificationHash, request.verificationHash);
      if (!matches) {
        return {
          success: false,
          reason: '验证码不匹配',
        };
      }

      const revocationExpiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000);

      await this.databaseService.queryWithClient(
        client,
        `
          UPDATE dashboard.friend_verification_requests
          SET status = 'verified',
              verifier_matrix_id = $2,
              verified_at = NOW(),
              revocation_expires_at = $3
          WHERE id = $1
        `,
        [request.id, payload.verifierMatrixId, revocationExpiresAt]
      );

      await this.operationLogService.record(
        {
          actorId: payload.verifierMatrixId,
          action: 'friend_2fa_verified',
          targetSynapseUserId: normalizedTarget,
          metadata: {
            requestId: request.id,
          },
        },
        client
      );

      await this.redisService.publish(config.redisUserEventsChannel, {
        type: 'friend_two_factor_verified',
        synapseUserId: normalizedTarget,
      });

      return {
        success: true,
        revocationWindowEndsAt: revocationExpiresAt.toISOString(),
      };
    });
  }

  private async performVerification(
    payload: TwoFactorVerificationPayload,
    settings: TwoFactorSettingsRow,
    client: PoolClient
  ): Promise<void> {
    switch (payload.method) {
      case 'totp':
        await this.verifyTotp(payload.code, settings);
        return;
      case 'email':
      case 'sms':
        await this.consumeChallenge(settings.userId, payload.method, payload.code, client);
        return;
      case 'safety_code':
        await this.consumeSafetyCode(settings, payload.code, client);
        return;
      case 'secondary_password':
        await this.verifySecondaryPassword(settings, payload.code);
        return;
      default:
        throw createBadRequestError(`不支持的 2FA 验证方法: ${payload.method}`);
    }
  }

  private async verifyTotp(code: string, settings: TwoFactorSettingsRow): Promise<void> {
    if (!settings.totpEnabled || !settings.totpSecret) {
      throw new HttpError(400, '尚未启用 TOTP');
    }

    if (!authenticator.check(code, settings.totpSecret)) {
      throw new HttpError(401, 'TOTP 验证失败');
    }
  }

  private async consumeChallenge(
    userId: number,
    method: Extract<TwoFactorMethod, 'email' | 'sms'>,
    code: string,
    client: PoolClient
  ): Promise<void> {
    const rows = await this.databaseService.queryWithClient<VerificationChallengeRow>(
      client,
      `
        SELECT id, code_hash AS "codeHash", expires_at AS "expiresAt"
        FROM dashboard.two_factor_challenges
        WHERE user_id = $1
          AND method = $2
          AND consumed_at IS NULL
          AND expires_at > NOW()
        ORDER BY created_at DESC
        LIMIT 5
      `,
      [userId, method]
    );

    for (const row of rows) {
      const matches = await bcrypt.compare(code, row.codeHash);
      if (!matches) {
        continue;
      }

      await this.databaseService.queryWithClient(
        client,
        `
          UPDATE dashboard.two_factor_challenges
          SET consumed_at = NOW()
          WHERE id = $1
        `,
        [row.id]
      );
      return;
    }

    throw new HttpError(401, `${method.toUpperCase()} 验证码无效或已过期`);
  }

  private async consumeSafetyCode(
    settings: TwoFactorSettingsRow,
    code: string,
    client: PoolClient
  ): Promise<void> {
    const codes = settings.safetyCodes || [];
    if (!codes.length) {
      throw new HttpError(400, '尚未配置安全备份码');
    }

    let matchedIndex = -1;
    for (let index = 0; index < codes.length; index += 1) {
      const hashed = codes[index];
      // eslint-disable-next-line no-await-in-loop
      const matches = await bcrypt.compare(code, hashed);
      if (matches) {
        matchedIndex = index;
        break;
      }
    }

    if (matchedIndex < 0) {
      throw new HttpError(401, '安全备份码无效');
    }

    const remaining = codes.filter((_, idx) => idx !== matchedIndex);
    await this.databaseService.queryWithClient(
      client,
      `
        UPDATE dashboard.user_2fa_settings
        SET safety_codes = $2::text[], updated_at = NOW()
        WHERE user_id = $1
      `,
      [settings.userId, remaining.length ? remaining : null]
    );
  }

  private async verifySecondaryPassword(
    settings: TwoFactorSettingsRow,
    code: string
  ): Promise<void> {
    if (!settings.secondaryPasswordHash) {
      throw new HttpError(400, '尚未设置二级密码');
    }

    const matches = await bcrypt.compare(code, settings.secondaryPasswordHash);
    if (!matches) {
      throw new HttpError(401, '二级密码错误');
    }
  }

  private async loadSettings(
    userId: number,
    client?: PoolClient
  ): Promise<TwoFactorSettingsRow> {
    const rows = client
      ? await this.databaseService.queryWithClient<TwoFactorSettingsRow>(
          client,
          `
            SELECT
              id,
              user_id AS "userId",
              secondary_password_hash AS "secondaryPasswordHash",
              totp_secret AS "totpSecret",
              totp_enabled AS "totpEnabled",
              email_2fa_enabled AS "email2faEnabled",
              phone_2fa_enabled AS "phone2faEnabled",
              safety_codes AS "safetyCodes",
              recovery_key_encrypted AS "recoveryKeyEncrypted",
              trusted_device_limit AS "trustedDeviceLimit",
              last_verified_at AS "lastVerifiedAt",
              updated_at AS "updatedAt"
            FROM dashboard.user_2fa_settings
            WHERE user_id = $1
            LIMIT 1
          `,
          [userId]
        )
      : await this.databaseService.query<TwoFactorSettingsRow>(
          `
            SELECT
              id,
              user_id AS "userId",
              secondary_password_hash AS "secondaryPasswordHash",
              totp_secret AS "totpSecret",
              totp_enabled AS "totpEnabled",
              email_2fa_enabled AS "email2faEnabled",
              phone_2fa_enabled AS "phone2faEnabled",
              safety_codes AS "safetyCodes",
              recovery_key_encrypted AS "recoveryKeyEncrypted",
              trusted_device_limit AS "trustedDeviceLimit",
              last_verified_at AS "lastVerifiedAt",
              updated_at AS "updatedAt"
            FROM dashboard.user_2fa_settings
            WHERE user_id = $1
            LIMIT 1
          `,
          [userId]
        );

    if (rows.length) {
      return rows[0];
    }

    await (client
      ? this.databaseService.queryWithClient(
          client,
          `
            INSERT INTO dashboard.user_2fa_settings (user_id)
            VALUES ($1)
            ON CONFLICT (user_id) DO NOTHING
          `,
          [userId]
        )
      : this.databaseService.query(
          `
            INSERT INTO dashboard.user_2fa_settings (user_id)
            VALUES ($1)
            ON CONFLICT (user_id) DO NOTHING
          `,
          [userId]
        ));

    return this.loadSettings(userId, client);
  }

  private async upsertDeviceRecord(
    userId: number,
    payload: TrustedDevicePayload,
    client: PoolClient
  ): Promise<void> {
    if (!payload.deviceId) {
      return;
    }

    await this.databaseService.queryWithClient(
      client,
      `
        INSERT INTO dashboard.user_devices
        (user_id, device_id, device_name, is_trusted, last_seen_at, last_ip)
        VALUES ($1, $2, $3, $4, NOW(), $5)
        ON CONFLICT (user_id, device_id) DO UPDATE
        SET device_name = COALESCE(EXCLUDED.device_name, dashboard.user_devices.device_name),
            is_trusted = CASE
              WHEN EXCLUDED.is_trusted = TRUE THEN TRUE
              ELSE dashboard.user_devices.is_trusted
            END,
            last_seen_at = NOW(),
            last_ip = COALESCE(EXCLUDED.last_ip, dashboard.user_devices.last_ip)
      `,
      [
        userId,
        payload.deviceId,
        payload.deviceName ?? null,
        Boolean(payload.trustDevice),
        payload.ipAddress ?? null,
      ]
    );
  }

  private async expireFriendRequests(userId: number, client: PoolClient): Promise<void> {
    await this.databaseService.queryWithClient(
      client,
      `
        UPDATE dashboard.friend_verification_requests
        SET status = 'expired'
        WHERE user_id = $1
          AND status = 'pending'
          AND expires_at <= NOW()
      `,
      [userId]
    );
  }

  private async fetchFriendRequest(
    userId: number,
    client: PoolClient
  ): Promise<FriendVerificationRow | null> {
    const rows = await this.databaseService.queryWithClient<FriendVerificationRow>(
      client,
      `
        SELECT
          id,
          verification_hash AS "verificationHash",
          expires_at AS "expiresAt"
        FROM dashboard.friend_verification_requests
        WHERE user_id = $1
          AND status = 'pending'
          AND expires_at > NOW()
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [userId]
    );

    return rows[0] ?? null;
  }
}
