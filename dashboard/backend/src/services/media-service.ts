import { DatabaseService } from '../database/database-service';
import {
  CreateMediaSyncTaskRequest,
  MediaListFilters,
  MediaMetadata,
  MediaSyncTask,
  MediaSyncTaskStatus,
  MediaUploadRequest,
} from '../types/media';
import { createNotFoundError } from '../utils/http-error';

import { OperationLogService } from './operation-log-service';

interface MediaMetadataRow {
  readonly id: number;
  readonly mediaHash: string;
  readonly uploaderId: string;
  readonly roomId?: string | null;
  readonly contentType?: string | null;
  readonly sizeBytes?: string | null;
  readonly referenceCount: number;
  readonly coolingExpiresAt?: Date | null;
  readonly createdAt: Date;
}

interface MediaSyncTaskRow {
  readonly id: number;
  readonly policyId?: number | null;
  readonly taskType: string;
  readonly status: MediaSyncTaskStatus;
  readonly queuedFiles: number;
  readonly processedFiles: number;
  readonly failedFiles: number;
  readonly startedAt?: Date | null;
  readonly completedAt?: Date | null;
  readonly createdAt: Date;
}

const DEFAULT_COOLING_HOURS = 24;

const toIso = (value?: Date | null): string | null => (value ? value.toISOString() : null);

const mapMediaRow = (row: MediaMetadataRow): MediaMetadata => ({
  id: row.id,
  mediaHash: row.mediaHash,
  uploaderId: row.uploaderId,
  roomId: row.roomId ?? null,
  contentType: row.contentType ?? null,
  sizeBytes: row.sizeBytes ? Number(row.sizeBytes) : null,
  referenceCount: row.referenceCount,
  coolingExpiresAt: toIso(row.coolingExpiresAt),
  createdAt: row.createdAt.toISOString(),
});

const mapSyncTask = (row: MediaSyncTaskRow): MediaSyncTask => ({
  id: row.id,
  policyId: row.policyId ?? null,
  taskType: row.taskType,
  status: row.status,
  queuedFiles: row.queuedFiles,
  processedFiles: row.processedFiles,
  failedFiles: row.failedFiles,
  startedAt: toIso(row.startedAt),
  completedAt: toIso(row.completedAt),
  createdAt: row.createdAt.toISOString(),
});

/**
 * 媒体管理服务，负责媒体元数据与同步任务相关操作
 */
export class MediaService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly operationLogService: OperationLogService
  ) {}

  async listMedia(filters: MediaListFilters): Promise<MediaMetadata[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters.mediaHash) {
      params.push(filters.mediaHash);
      conditions.push(`media_hash = $${params.length}`);
    }

    if (filters.uploaderId) {
      params.push(filters.uploaderId);
      conditions.push(`uploader_id = $${params.length}`);
    }

    if (filters.roomId) {
      params.push(filters.roomId);
      conditions.push(`room_id = $${params.length}`);
    }

    if (filters.contentType) {
      params.push(filters.contentType);
      conditions.push(`content_type = $${params.length}`);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
    const offset = Math.max(filters.offset ?? 0, 0);

    const rows = await this.databaseService.query<MediaMetadataRow>(
      `
        SELECT
          id,
          media_hash AS "mediaHash",
          uploader_id AS "uploaderId",
          room_id AS "roomId",
          content_type AS "contentType",
          size_bytes AS "sizeBytes",
          reference_count AS "referenceCount",
          cooling_expires_at AS "coolingExpiresAt",
          created_at AS "createdAt"
        FROM dashboard.media_metadata
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT ${limit}
        OFFSET ${offset}
      `,
      params
    );

    return rows.map(mapMediaRow);
  }

  async getMediaByHash(mediaHash: string): Promise<MediaMetadata> {
    const rows = await this.databaseService.query<MediaMetadataRow>(
      `
        SELECT
          id,
          media_hash AS "mediaHash",
          uploader_id AS "uploaderId",
          room_id AS "roomId",
          content_type AS "contentType",
          size_bytes AS "sizeBytes",
          reference_count AS "referenceCount",
          cooling_expires_at AS "coolingExpiresAt",
          created_at AS "createdAt"
        FROM dashboard.media_metadata
        WHERE media_hash = $1
        LIMIT 1
      `,
      [mediaHash]
    );

    if (!rows.length) {
      throw createNotFoundError('指定媒体文件不存在');
    }

    return mapMediaRow(rows[0]);
  }

  async registerUpload(payload: MediaUploadRequest, actorId: string): Promise<MediaMetadata> {
    const coolingHours = payload.coolingPeriodHours ?? DEFAULT_COOLING_HOURS;
    const rows = await this.databaseService.query<MediaMetadataRow>(
      `
        INSERT INTO dashboard.media_metadata
        (media_hash, uploader_id, room_id, content_type, size_bytes, reference_count, cooling_expires_at)
        VALUES ($1, $2, $3, $4, $5, 1, NOW() + make_interval(hours => $6::int))
        ON CONFLICT (media_hash) DO UPDATE
        SET
          reference_count = dashboard.media_metadata.reference_count + 1,
          size_bytes = COALESCE(EXCLUDED.size_bytes, dashboard.media_metadata.size_bytes),
          content_type = COALESCE(EXCLUDED.content_type, dashboard.media_metadata.content_type),
          room_id = COALESCE(EXCLUDED.room_id, dashboard.media_metadata.room_id),
          cooling_expires_at = GREATEST(
            dashboard.media_metadata.cooling_expires_at,
            NOW() + make_interval(hours => $6::int)
          )
        RETURNING
          id,
          media_hash AS "mediaHash",
          uploader_id AS "uploaderId",
          room_id AS "roomId",
          content_type AS "contentType",
          size_bytes AS "sizeBytes",
          reference_count AS "referenceCount",
          cooling_expires_at AS "coolingExpiresAt",
          created_at AS "createdAt"
      `,
      [
        payload.mediaHash,
        payload.uploaderId,
        payload.roomId ?? null,
        payload.contentType ?? null,
        payload.sizeBytes ?? null,
        coolingHours,
      ]
    );

    const record = mapMediaRow(rows[0]);

    await this.operationLogService.record({
      actorId,
      action: 'media_register',
      metadata: {
        mediaHash: payload.mediaHash,
        uploaderId: payload.uploaderId,
        sizeBytes: payload.sizeBytes,
      },
    });

    return record;
  }

  async deleteMedia(mediaHash: string, actorId: string): Promise<MediaMetadata> {
    const rows = await this.databaseService.query<MediaMetadataRow>(
      `
        DELETE FROM dashboard.media_metadata
        WHERE media_hash = $1
        RETURNING
          id,
          media_hash AS "mediaHash",
          uploader_id AS "uploaderId",
          room_id AS "roomId",
          content_type AS "contentType",
          size_bytes AS "sizeBytes",
          reference_count AS "referenceCount",
          cooling_expires_at AS "coolingExpiresAt",
          created_at AS "createdAt"
      `,
      [mediaHash]
    );

    if (!rows.length) {
      throw createNotFoundError('媒体记录不存在或已被删除');
    }

    const record = mapMediaRow(rows[0]);

    await this.operationLogService.record({
      actorId,
      action: 'media_delete',
      metadata: { mediaHash },
    });

    return record;
  }

  async createSyncTask(payload: CreateMediaSyncTaskRequest, actorId: string): Promise<MediaSyncTask> {
    const rows = await this.databaseService.query<MediaSyncTaskRow>(
      `
        INSERT INTO dashboard.media_sync_tasks
        (policy_id, task_type, status, queued_files)
        VALUES ($1, $2, 'queued', $3)
        RETURNING
          id,
          policy_id AS "policyId",
          task_type AS "taskType",
          status,
          queued_files AS "queuedFiles",
          processed_files AS "processedFiles",
          failed_files AS "failedFiles",
          started_at AS "startedAt",
          completed_at AS "completedAt",
          created_at AS "createdAt"
      `,
      [payload.policyId ?? null, payload.taskType, payload.queuedFiles ?? 0]
    );

    const task = mapSyncTask(rows[0]);

    await this.operationLogService.record({
      actorId,
      action: 'media_sync_task_create',
      metadata: {
        taskId: task.id,
        taskType: task.taskType,
        policyId: task.policyId,
      },
    });

    return task;
  }

  async getSyncTask(taskId: number): Promise<MediaSyncTask> {
    const rows = await this.databaseService.query<MediaSyncTaskRow>(
      `
        SELECT
          id,
          policy_id AS "policyId",
          task_type AS "taskType",
          status,
          queued_files AS "queuedFiles",
          processed_files AS "processedFiles",
          failed_files AS "failedFiles",
          started_at AS "startedAt",
          completed_at AS "completedAt",
          created_at AS "createdAt"
        FROM dashboard.media_sync_tasks
        WHERE id = $1
        LIMIT 1
      `,
      [taskId]
    );

    if (!rows.length) {
      throw createNotFoundError('同步任务不存在');
    }

    return mapSyncTask(rows[0]);
  }
}
