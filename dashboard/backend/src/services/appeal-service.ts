import { PoolClient } from 'pg';

import { DatabaseService } from '../database/database-service';
import { createBadRequestError, createNotFoundError } from '../utils/http-error';
import {
  AppealDecisionRequest,
  AppealDetail,
  AppealListFilters,
  AppealMessage,
  AppealSubmissionRequest,
  AppealStatus,
  UserAppeal,
} from '../types/appeal';
import { UserService } from './user-service';
import { OperationLogService } from './operation-log-service';

interface AppealRow {
  readonly id: number;
  readonly userId: number;
  readonly synapseUserId: string;
  readonly banId?: number | null;
  readonly contactEmail?: string | null;
  readonly contactMatrix?: string | null;
  readonly reason: string;
  readonly status: AppealStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

interface AppealMessageRow {
  readonly id: number;
  readonly appealId: number;
  readonly author: string;
  readonly body: string;
  readonly createdAt: Date;
}

const toIso = (value: Date): string => value.toISOString();

const mapAppeal = (row: AppealRow): UserAppeal => ({
  id: row.id,
  userId: row.userId,
  synapseUserId: row.synapseUserId,
  banId: row.banId ?? null,
  contactEmail: row.contactEmail ?? null,
  contactMatrix: row.contactMatrix ?? null,
  reason: row.reason,
  status: row.status,
  createdAt: toIso(row.createdAt),
  updatedAt: toIso(row.updatedAt),
});

const mapAppealMessage = (row: AppealMessageRow): AppealMessage => ({
  id: row.id,
  appealId: row.appealId,
  author: row.author,
  body: row.body,
  createdAt: toIso(row.createdAt),
});

/**
 * 申诉业务服务，提供提交、查询与处理等功能
 */
export class AppealService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly userService: UserService,
    private readonly operationLogService: OperationLogService
  ) {}

  async listAppeals(filters: AppealListFilters): Promise<UserAppeal[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters.status) {
      params.push(filters.status);
      conditions.push(`a.status = $${params.length}`);
    }

    if (filters.synapseUserId) {
      params.push(filters.synapseUserId);
      conditions.push(`up.synapse_user_id = $${params.length}`);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);

    const sql = `
      SELECT
        a.id,
        a.user_id AS "userId",
        up.synapse_user_id AS "synapseUserId",
        a.ban_id AS "banId",
        a.contact_email AS "contactEmail",
        a.contact_matrix AS "contactMatrix",
        a.reason,
        a.status,
        a.created_at AS "createdAt",
        a.updated_at AS "updatedAt"
      FROM dashboard.user_appeals a
      INNER JOIN dashboard.user_profiles up ON up.id = a.user_id
      ${whereClause}
      ORDER BY a.created_at DESC
      LIMIT ${limit}
    `;

    const rows = await this.databaseService.query<AppealRow>(sql, params);
    return rows.map(mapAppeal);
  }

  async getAppealDetail(appealId: number): Promise<AppealDetail> {
    const appeal = await this.fetchAppeal(appealId);
    const messages = await this.fetchMessages(appealId);
    return {
      ...appeal,
      messages,
    };
  }

  async submitAppeal(payload: AppealSubmissionRequest, actorId: string): Promise<AppealDetail> {
    return this.databaseService.withTransaction(async (client) => {
      const userId = await this.userService.getInternalUserId(payload.synapseUserId, client);
      await this.assertPendingLimit(userId, client);

      if (payload.banId) {
        await this.ensureBanOwnership(payload.banId, userId, client);
      }

      const rows = await this.databaseService.queryWithClient<AppealRow>(
        client,
        `
          INSERT INTO dashboard.user_appeals
          (user_id, ban_id, contact_email, contact_matrix, reason, status)
          VALUES ($1, $2, $3, $4, $5, 'pending')
          RETURNING
            id,
            user_id AS "userId",
            $6::text AS "synapseUserId",
            ban_id AS "banId",
            contact_email AS "contactEmail",
            contact_matrix AS "contactMatrix",
            reason,
            status,
            created_at AS "createdAt",
            updated_at AS "updatedAt"
        `,
        [
          userId,
          payload.banId ?? null,
          payload.contactEmail ?? null,
          payload.contactMatrix ?? null,
          payload.reason,
          payload.synapseUserId,
        ]
      );

      if (!rows.length) {
        throw new Error('Failed to insert appeal record');
      }

      const appeal = mapAppeal(rows[0]);

      if (payload.message?.trim()) {
        await this.insertMessage(client, appeal.id, payload.synapseUserId, payload.message.trim());
      }

      const logMetadata: Record<string, unknown> = {
        banId: payload.banId ?? null,
        contactEmail: payload.contactEmail ?? null,
        contactMatrix: payload.contactMatrix ?? null,
      };
      if (payload.message?.trim()) {
        logMetadata.messagePreview = payload.message.trim().slice(0, 200);
      }

      await this.operationLogService.record(
        {
          actorId,
          action: 'submit_user_appeal',
          targetSynapseUserId: payload.synapseUserId,
          metadata: logMetadata,
        },
        client
      );

      const messages = await this.fetchMessages(appeal.id, client);
      return {
        ...appeal,
        messages,
      };
    });
  }

  async appendMessageFromUser(
    appealId: number,
    synapseUserId: string,
    body: string
  ): Promise<AppealMessage> {
    const appeal = await this.fetchAppeal(appealId);
    if (appeal.synapseUserId !== synapseUserId) {
      throw createNotFoundError('未找到对应申诉');
    }

    if (appeal.status !== 'pending') {
      throw createBadRequestError('该申诉已处理，无法继续留言');
    }

    return this.insertMessage(undefined, appealId, synapseUserId, body);
  }

  async appendMessageFromAdmin(
    appealId: number,
    actorId: string,
    body: string
  ): Promise<AppealMessage> {
    const appeal = await this.fetchAppeal(appealId);
    const message = await this.insertMessage(undefined, appealId, `admin:${actorId}`, body);

    await this.operationLogService.record({
      actorId,
      action: 'appeal_add_admin_message',
      targetSynapseUserId: appeal.synapseUserId,
      metadata: { appealId },
    });

    return message;
  }

  async decideAppeal(
    appealId: number,
    decision: AppealDecisionRequest,
    actorId: string
  ): Promise<AppealDetail> {
    return this.databaseService.withTransaction(async (client) => {
      const appeal = await this.fetchAppeal(appealId, client);
      if (appeal.status !== 'pending') {
        throw createBadRequestError('申诉已处理');
      }

      const rows = await this.databaseService.queryWithClient<AppealRow>(
        client,
        `
          UPDATE dashboard.user_appeals
          SET status = $2, updated_at = NOW()
          WHERE id = $1
          RETURNING
            id,
            user_id AS "userId",
            $3::text AS "synapseUserId",
            ban_id AS "banId",
            contact_email AS "contactEmail",
            contact_matrix AS "contactMatrix",
            reason,
            status,
            created_at AS "createdAt",
            updated_at AS "updatedAt"
        `,
        [appealId, decision.status, appeal.synapseUserId]
      );

      const updated = mapAppeal(rows[0]);

      if (decision.responseMessage?.trim()) {
        await this.insertMessage(client, appealId, `admin:${actorId}`, decision.responseMessage.trim());
      }

      await this.operationLogService.record(
        {
          actorId,
          action: 'appeal_decision',
          targetSynapseUserId: appeal.synapseUserId,
          metadata: {
            appealId,
            status: decision.status,
            responseMessage: decision.responseMessage,
          },
        },
        client
      );

      const messages = await this.fetchMessages(appealId, client);
      return {
        ...updated,
        messages,
      };
    });
  }

  private async assertPendingLimit(userId: number, client: PoolClient): Promise<void> {
    const result = await this.databaseService.queryWithClient<{ count: string }>(
      client,
      `
        SELECT COUNT(*)::text AS count
        FROM dashboard.user_appeals
        WHERE user_id = $1 AND status = 'pending'
      `,
      [userId]
    );

    const total = Number(result[0]?.count ?? '0');
    if (total >= 3) {
      throw createBadRequestError('存在多条待处理申诉，请等待管理员处理后再试');
    }
  }

  private async ensureBanOwnership(
    banId: number,
    userId: number,
    client: PoolClient
  ): Promise<void> {
    const rows = await this.databaseService.queryWithClient<{ id: number }>(
      client,
      `
        SELECT id
        FROM dashboard.user_bans
        WHERE id = $1 AND user_id = $2
        LIMIT 1
      `,
      [banId, userId]
    );

    if (!rows.length) {
      throw createBadRequestError('封禁记录与用户不匹配');
    }
  }

  private async fetchAppeal(
    appealId: number,
    client?: PoolClient
  ): Promise<UserAppeal> {
    const rows = client
      ? await this.databaseService.queryWithClient<AppealRow>(
          client,
          `
            SELECT
              a.id,
              a.user_id AS "userId",
              up.synapse_user_id AS "synapseUserId",
              a.ban_id AS "banId",
              a.contact_email AS "contactEmail",
              a.contact_matrix AS "contactMatrix",
              a.reason,
              a.status,
              a.created_at AS "createdAt",
              a.updated_at AS "updatedAt"
            FROM dashboard.user_appeals a
            INNER JOIN dashboard.user_profiles up ON up.id = a.user_id
            WHERE a.id = $1
            LIMIT 1
          `,
          [appealId]
        )
      : await this.databaseService.query<AppealRow>(
          `
            SELECT
              a.id,
              a.user_id AS "userId",
              up.synapse_user_id AS "synapseUserId",
              a.ban_id AS "banId",
              a.contact_email AS "contactEmail",
              a.contact_matrix AS "contactMatrix",
              a.reason,
              a.status,
              a.created_at AS "createdAt",
              a.updated_at AS "updatedAt"
            FROM dashboard.user_appeals a
            INNER JOIN dashboard.user_profiles up ON up.id = a.user_id
            WHERE a.id = $1
            LIMIT 1
          `,
          [appealId]
        );

    if (!rows.length) {
      throw createNotFoundError('申诉不存在');
    }

    return mapAppeal(rows[0]);
  }

  private async ensureAppealExists(appealId: number): Promise<void> {
    await this.fetchAppeal(appealId);
  }

  private async fetchMessages(
    appealId: number,
    client?: PoolClient
  ): Promise<AppealMessage[]> {
    const sql = `
      SELECT
        id,
        appeal_id AS "appealId",
        author,
        body,
        created_at AS "createdAt"
      FROM dashboard.appeal_messages
      WHERE appeal_id = $1
      ORDER BY created_at ASC
    `;

    const rows = client
      ? await this.databaseService.queryWithClient<AppealMessageRow>(client, sql, [appealId])
      : await this.databaseService.query<AppealMessageRow>(sql, [appealId]);

    return rows.map(mapAppealMessage);
  }

  private async insertMessage(
    client: PoolClient | undefined,
    appealId: number,
    author: string,
    body: string
  ): Promise<AppealMessage> {
    const rows = client
      ? await this.databaseService.queryWithClient<AppealMessageRow>(
          client,
          `
            INSERT INTO dashboard.appeal_messages
            (appeal_id, author, body)
            VALUES ($1, $2, $3)
            RETURNING
              id,
              appeal_id AS "appealId",
              author,
              body,
              created_at AS "createdAt"
          `,
          [appealId, author, body]
        )
      : await this.databaseService.query<AppealMessageRow>(
          `
            INSERT INTO dashboard.appeal_messages
            (appeal_id, author, body)
            VALUES ($1, $2, $3)
            RETURNING
              id,
              appeal_id AS "appealId",
              author,
              body,
              created_at AS "createdAt"
          `,
          [appealId, author, body]
        );

    const touchSql = `
      UPDATE dashboard.user_appeals
      SET updated_at = NOW()
      WHERE id = $1
    `;
    if (client) {
      await this.databaseService.queryWithClient(client, touchSql, [appealId]);
    } else {
      await this.databaseService.query(touchSql, [appealId]);
    }

    return mapAppealMessage(rows[0]);
  }
}
