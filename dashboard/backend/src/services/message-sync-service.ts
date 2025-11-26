import { PoolClient } from 'pg';

import { DatabaseService } from '../database/database-service';
import { OperationLogService } from './operation-log-service';
import {
  MessageSyncActionResult,
  PendingMessage,
  PendingMessageFilters,
} from '../types/message-sync';
import { createBadRequestError, createNotFoundError } from '../utils/http-error';

interface PendingMessageRow {
  readonly id: number;
  readonly userId: number;
  readonly synapseUserId: string;
  readonly roomId: string;
  readonly senderMatrixId: string;
  readonly eventType: string;
  readonly content: unknown;
  readonly mediaHash: string | null;
  readonly receivedAt: Date;
  readonly synced: boolean;
  readonly syncedAt: Date | null;
  readonly failureReason: string | null;
}

const mapPendingMessage = (row: PendingMessageRow): PendingMessage => ({
  id: row.id,
  userId: row.userId,
  synapseUserId: row.synapseUserId,
  roomId: row.roomId,
  senderMatrixId: row.senderMatrixId,
  eventType: row.eventType,
  content: row.content,
  mediaHash: row.mediaHash,
  receivedAt: row.receivedAt.toISOString(),
  synced: row.synced,
  syncedAt: row.syncedAt ? row.syncedAt.toISOString() : null,
  failureReason: row.failureReason,
});

/**
 * MessageSyncService 负责查询与操作硬封禁期间堆积的消息
 */
export class MessageSyncService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly operationLogService: OperationLogService
  ) {}

  async listPendingMessages(filters: PendingMessageFilters): Promise<PendingMessage[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters.synapseUserId) {
      conditions.push('up.synapse_user_id = $' + (params.length + 1));
      params.push(filters.synapseUserId);
    }

    if (filters.roomId) {
      conditions.push('pm.room_id = $' + (params.length + 1));
      params.push(filters.roomId);
    }

    if (filters.senderMatrixId) {
      conditions.push('pm.sender_matrix_id = $' + (params.length + 1));
      params.push(filters.senderMatrixId);
    }

    if (filters.synced !== undefined) {
      conditions.push('pm.synced = $' + (params.length + 1));
      params.push(filters.synced);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const rows = await this.databaseService.query<PendingMessageRow>(
      `
        SELECT
          pm.id,
          pm.user_id AS "userId",
          up.synapse_user_id AS "synapseUserId",
          pm.room_id AS "roomId",
          pm.sender_matrix_id AS "senderMatrixId",
          pm.event_type AS "eventType",
          pm.content,
          pm.media_hash AS "mediaHash",
          pm.received_at AS "receivedAt",
          pm.synced,
          pm.synced_at AS "syncedAt",
          pm.failure_reason AS "failureReason"
        FROM dashboard.pending_messages pm
        JOIN dashboard.user_profiles up ON up.id = pm.user_id
        ${whereClause}
        ORDER BY pm.received_at ASC
        LIMIT 200
      `,
      params
    );

    return rows.map(mapPendingMessage);
  }

  async replayMessage(
    messageId: number,
    actorId: string,
    reason?: string
  ): Promise<MessageSyncActionResult> {
    return this.withMessageLock(messageId, async (row, client) => {
      await this.databaseService.queryWithClient(
        client,
        `
          UPDATE dashboard.pending_messages
          SET synced = TRUE,
              synced_at = NOW(),
              failure_reason = NULL
          WHERE id = $1
        `,
        [row.id]
      );

      await this.operationLogService.record(
        {
          actorId,
          action: 'pending_message_replayed',
          targetSynapseUserId: row.synapseUserId,
          metadata: {
            messageId: row.id,
            roomId: row.roomId,
            reason,
          },
        },
        client
      );

      return {
        success: true,
        messageId: row.id,
        action: 'replay',
        syncedAt: new Date().toISOString(),
      };
    });
  }

  async discardMessage(
    messageId: number,
    actorId: string,
    reason?: string
  ): Promise<MessageSyncActionResult> {
    return this.withMessageLock(messageId, async (row, client) => {
      await this.databaseService.queryWithClient(
        client,
        `
          UPDATE dashboard.pending_messages
          SET synced = TRUE,
              synced_at = NOW(),
              failure_reason = $2
          WHERE id = $1
        `,
        [row.id, reason ?? 'discarded_by_admin']
      );

      await this.operationLogService.record(
        {
          actorId,
          action: 'pending_message_discarded',
          targetSynapseUserId: row.synapseUserId,
          metadata: {
            messageId: row.id,
            roomId: row.roomId,
            reason,
          },
        },
        client
      );

      return {
        success: true,
        messageId: row.id,
        action: 'discard',
        syncedAt: new Date().toISOString(),
      };
    });
  }

  private async withMessageLock<T>(
    messageId: number,
    handler: (row: PendingMessageRow, client: PoolClient) => Promise<T>
  ): Promise<T> {
    if (!messageId || Number.isNaN(messageId)) {
      throw createBadRequestError('消息 ID 无效');
    }

    return this.databaseService.withTransaction(async (client) => {
      const rows = await this.databaseService.queryWithClient<PendingMessageRow>(
        client,
        `
          SELECT
            pm.id,
            pm.user_id AS "userId",
            up.synapse_user_id AS "synapseUserId",
            pm.room_id AS "roomId",
            pm.sender_matrix_id AS "senderMatrixId",
            pm.event_type AS "eventType",
            pm.content,
            pm.media_hash AS "mediaHash",
            pm.received_at AS "receivedAt",
            pm.synced,
            pm.synced_at AS "syncedAt",
            pm.failure_reason AS "failureReason"
          FROM dashboard.pending_messages pm
          JOIN dashboard.user_profiles up ON up.id = pm.user_id
          WHERE pm.id = $1
          FOR UPDATE
        `,
        [messageId]
      );

      if (!rows.length) {
        throw createNotFoundError('未找到待同步消息');
      }

      const row = rows[0];
      if (row.synced) {
        throw createBadRequestError('消息已标记为同步');
      }

      return handler(row, client);
    });
  }
}
