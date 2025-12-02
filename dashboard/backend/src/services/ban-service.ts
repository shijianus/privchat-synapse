import { DatabaseService } from '../database/database-service';
import { RedisService } from '../redis/redis-service';
import { CreateBanRequest, UpdateBanRequest, UserBanRecord } from '../types/ban';
import { UserService } from './user-service';
import { OperationLogService } from './operation-log-service';
import { createBadRequestError, createNotFoundError } from '../utils/http-error';
import { config } from '../config/env';

type BanCreationPayload = Omit<CreateBanRequest, 'userId' | 'createdBy'>;

interface UserBanRow {
  readonly id: number;
  readonly userId: number;
  readonly synapseUserId?: string;
  readonly banType: string;
  readonly reason: string | null;
  readonly evidence?: Record<string, unknown> | null;
  readonly status: string;
  readonly createdBy: string;
  readonly expiresAt?: Date | null;
  readonly createdAt: Date;
}

const toIso = (value?: Date | null): string | null =>
  value ? value.toISOString() : null;

const mapBan = (row: UserBanRow): UserBanRecord => ({
  id: row.id,
  userId: row.userId,
  synapseUserId: row.synapseUserId,
  banType: row.banType as UserBanRecord['banType'],
  reason: row.reason,
  evidence: row.evidence,
  status: row.status as UserBanRecord['status'],
  createdBy: row.createdBy,
  expiresAt: toIso(row.expiresAt),
  createdAt: toIso(row.createdAt) || new Date().toISOString(),
});

/**
 * 封禁业务服务，封装与 user_bans 表相关的操作
 */
export class BanService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly redisService: RedisService,
    private readonly userService: UserService,
    private readonly operationLogService: OperationLogService
  ) {}

  async listActiveBans(): Promise<UserBanRecord[]> {
    const sql = `
      SELECT
        b.id,
        b.user_id AS "userId",
        up.synapse_user_id AS "synapseUserId",
        b.ban_type AS "banType",
        b.reason,
        b.evidence,
        b.status,
        b.created_by AS "createdBy",
        b.expires_at AS "expiresAt",
        b.created_at AS "createdAt"
      FROM dashboard.user_bans b
      INNER JOIN dashboard.user_profiles up ON up.id = b.user_id
      WHERE b.status = 'active'
      ORDER BY b.created_at DESC
      LIMIT 200
    `;

    const rows = await this.databaseService.query<UserBanRow>(sql);
    return rows.map(mapBan);
  }

  async listBansForUser(synapseUserId: string): Promise<UserBanRecord[]> {
    const userId = await this.userService.getInternalUserId(synapseUserId);
    const sql = `
      SELECT
        b.id,
        b.user_id AS "userId",
        $2::text AS "synapseUserId",
        b.ban_type AS "banType",
        b.reason,
        b.evidence,
        b.status,
        b.created_by AS "createdBy",
        b.expires_at AS "expiresAt",
        b.created_at AS "createdAt"
      FROM dashboard.user_bans b
      WHERE b.user_id = $1
      ORDER BY b.created_at DESC
    `;

    const rows = await this.databaseService.query<UserBanRow>(sql, [userId, synapseUserId]);
    return rows.map(mapBan);
  }

  async createBanForSynapseUser(
    synapseUserId: string,
    payload: BanCreationPayload,
    actorId: string
  ): Promise<UserBanRecord> {
    return this.databaseService.withTransaction(async (client) => {
      const userId = await this.userService.getInternalUserId(synapseUserId, client);

      const sql = `
        INSERT INTO dashboard.user_bans
        (user_id, ban_type, reason, evidence, status, created_by, expires_at)
        VALUES ($1, $2, $3, $4, 'active', $5, $6)
        RETURNING
          id,
          user_id AS "userId",
          $7::text AS "synapseUserId",
          ban_type AS "banType",
          reason,
          evidence,
          status,
          created_by AS "createdBy",
          expires_at AS "expiresAt",
          created_at AS "createdAt"
      `;

      const params = [
        userId,
        payload.banType,
        payload.reason,
        payload.evidence ?? null,
        actorId,
        payload.expiresAt ? new Date(payload.expiresAt) : null,
        synapseUserId,
      ];

      const rows = await this.databaseService.queryWithClient<UserBanRow>(client, sql, params);
      const result = mapBan(rows[0]);

      await this.operationLogService.record(
        {
          actorId,
          action: 'create_user_ban',
          targetSynapseUserId: synapseUserId,
          metadata: (payload as unknown) as Record<string, unknown>,
        },
        client
      );

      await this.redisService.publish(config.redisUserEventsChannel, {
        action: 'ban_updated',
        user_ids: [synapseUserId],
      });

      await this.userService.invalidateCache(synapseUserId);

      return result;
    });
  }

  async updateBanStatus(request: UpdateBanRequest, actorId: string): Promise<UserBanRecord> {
    const fields: string[] = [];
    const params: unknown[] = [];

    if (request.reason !== undefined) {
      params.push(request.reason);
      fields.push(`reason = $${params.length}`);
    }

    if (request.evidence !== undefined) {
      params.push(request.evidence);
      fields.push(`evidence = $${params.length}`);
    }

    if (request.status) {
      params.push(request.status);
      fields.push(`status = $${params.length}`);
    }

    if (request.expiresAt !== undefined) {
      params.push(request.expiresAt ? new Date(request.expiresAt) : null);
      fields.push(`expires_at = $${params.length}`);
    }

    if (!fields.length) {
      throw createBadRequestError('没有可更新的封禁字段');
    }

    params.push(request.banId);

    const sql = `
      UPDATE dashboard.user_bans
      SET ${fields.join(', ')}
      WHERE id = $${params.length}
      RETURNING
        id,
        user_id AS "userId",
        status,
        ban_type AS "banType",
        reason,
        evidence,
        created_by AS "createdBy",
        expires_at AS "expiresAt",
        created_at AS "createdAt"
    `;

    const rows = await this.databaseService.query<UserBanRow>(sql, params);
    if (!rows.length) {
      throw createNotFoundError('指定封禁不存在');
    }

    const synapseUserId = await this.getSynapseIdByBanId(request.banId);
    await this.operationLogService.record({
      actorId,
      action: 'update_user_ban',
      targetSynapseUserId: synapseUserId,
      metadata: (request as unknown) as Record<string, unknown>,
    });

    await this.redisService.publish(config.redisUserEventsChannel, {
      action: 'ban_updated',
      user_ids: [synapseUserId],
    });

    await this.userService.invalidateCache(synapseUserId);

    return mapBan({ ...rows[0], synapseUserId });
  }

  private async getSynapseIdByBanId(banId: number): Promise<string> {
    const sql = `
      SELECT up.synapse_user_id AS "synapseUserId"
      FROM dashboard.user_bans b
      INNER JOIN dashboard.user_profiles up ON up.id = b.user_id
      WHERE b.id = $1
      LIMIT 1
    `;

    const rows = await this.databaseService.query<{ synapseUserId: string }>(sql, [banId]);
    if (!rows.length) {
      throw createNotFoundError('封禁记录不存在');
    }
    return rows[0].synapseUserId;
  }
}
