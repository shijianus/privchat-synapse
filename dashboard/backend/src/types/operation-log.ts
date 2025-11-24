/**
 * 对应 dashboard.operation_logs 表的模型
 */
export interface OperationLogEntry {
  readonly actorId: string;
  readonly action: string;
  readonly targetSynapseUserId?: string | null;
  readonly metadata?: Record<string, unknown> | null;
}
