import { DatabaseService } from '../database/database-service';
import { OperationLogService } from './operation-log-service';

export interface ReportPayload {
  readonly reporter: string;
  readonly target: string;
  readonly reason: string;
  readonly description?: string;
}

export interface ReportEntry {
  readonly id: string;
  readonly reporter: string;
  readonly target: string;
  readonly reason: string;
  readonly description?: string | null;
  readonly createdAt: string;
}

export class ReportService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly operationLogService: OperationLogService
  ) {}

  async submit(payload: ReportPayload): Promise<void> {
    await this.operationLogService.record({
      actorId: payload.reporter,
      action: 'user.report',
      targetSynapseUserId: payload.target,
      metadata: {
        reason: payload.reason,
        description: payload.description,
      },
    });
  }

  async list(limit = 50, offset = 0): Promise<ReportEntry[]> {
    const rows = await this.databaseService.query<{
      id: string;
      actor_id: string;
      target_synapse_user_id: string | null;
      metadata: any;
      created_at: string;
    }>(
      `
      SELECT id, actor_id, target_synapse_user_id, metadata, created_at
      FROM dashboard.operation_logs
      WHERE action = 'user.report'
      ORDER BY created_at DESC
      LIMIT $1 OFFSET $2
    `,
      [limit, offset]
    );

    return rows.map((row) => ({
      id: row.id,
      reporter: row.actor_id,
      target: row.target_synapse_user_id || '',
      reason: row.metadata?.reason ?? '',
      description: row.metadata?.description ?? null,
      createdAt: row.created_at,
    }));
  }
}
