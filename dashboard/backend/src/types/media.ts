export type MediaSyncTaskStatus = 'queued' | 'running' | 'paused' | 'failed' | 'completed';

/**
 * media_metadata 表对应的记录结构
 */
export interface MediaMetadata {
  readonly id: number;
  readonly mediaHash: string;
  readonly uploaderId: string;
  readonly roomId?: string | null;
  readonly contentType?: string | null;
  readonly sizeBytes?: number | null;
  readonly referenceCount: number;
  readonly coolingExpiresAt?: string | null;
  readonly createdAt: string;
}

/**
 * 媒体列表查询条件
 */
export interface MediaListFilters {
  readonly mediaHash?: string;
  readonly uploaderId?: string;
  readonly roomId?: string;
  readonly contentType?: string;
  readonly limit?: number;
  readonly offset?: number;
}

/**
 * 注册文件元数据时的请求体
 */
export interface MediaUploadRequest {
  readonly mediaHash: string;
  readonly uploaderId: string;
  readonly roomId?: string | null;
  readonly contentType?: string | null;
  readonly sizeBytes?: number | null;
  readonly coolingPeriodHours?: number;
}

/**
 * 媒体同步任务记录
 */
export interface MediaSyncTask {
  readonly id: number;
  readonly policyId?: number | null;
  readonly taskType: string;
  readonly status: MediaSyncTaskStatus;
  readonly queuedFiles: number;
  readonly processedFiles: number;
  readonly failedFiles: number;
  readonly startedAt?: string | null;
  readonly completedAt?: string | null;
  readonly createdAt: string;
}

/**
 * 创建同步任务时的输入
 */
export interface CreateMediaSyncTaskRequest {
  readonly policyId?: number | null;
  readonly taskType: string;
  readonly queuedFiles?: number;
}
