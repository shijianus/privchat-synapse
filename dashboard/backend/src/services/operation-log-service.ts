import { PoolClient } from 'pg';

import { DatabaseService } from '../database/database-service';
import { OperationLogEntry } from '../types/operation-log';

/**
 * 操作日志服务，记录所有管理动作
 */
export class OperationLogService {
  constructor(private readonly databaseService: DatabaseService) {}

  async record(entry: OperationLogEntry, client?: PoolClient): Promise<void> {
    const sql = `
      INSERT INTO dashboard.operation_logs
      (actor_id, action, target_synapse_user_id, metadata)
      VALUES ($1, $2, $3, $4)
    `;

    const params = [
      entry.actorId,
      entry.action,
      entry.targetSynapseUserId || null,
      entry.metadata ? JSON.stringify(entry.metadata) : null,
    ];

    if (client) {
      await this.databaseService.queryWithClient(client, sql, params);
    } else {
      await this.databaseService.query(sql, params);
    }
  }
}
