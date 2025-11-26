import { DatabaseService } from '../database/database-service';
import {
  CreateBlacklistEntryRequest,
  RegistrationApplication,
  RegistrationApplicationFilters,
  RegistrationApprovalRequest,
  RegistrationBlacklistEntry,
  RegistrationBlacklistFilters,
  RegistrationBlacklistType,
  RegistrationRejectionRequest,
  RegistrationStatus,
} from '../types/registration';
import { createBadRequestError, createNotFoundError } from '../utils/http-error';

import { OperationLogService } from './operation-log-service';

interface RegistrationApplicationRow {
  readonly id: number;
  readonly username: string;
  readonly email: string;
  readonly msisdn?: string | null;
  readonly ipAddress: string;
  readonly deviceFingerprint?: string | null;
  readonly status: RegistrationStatus;
  readonly reviewer?: string | null;
  readonly reviewerNote?: string | null;
  readonly synapseUserId?: string | null;
  readonly decidedAt?: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

interface RegistrationBlacklistRow {
  readonly id: number;
  readonly type: RegistrationBlacklistType;
  readonly value: string;
  readonly reason?: string | null;
  readonly createdBy: string;
  readonly expiresAt?: Date | null;
  readonly createdAt: Date;
}

const mapApplication = (row: RegistrationApplicationRow): RegistrationApplication => ({
  id: row.id,
  username: row.username,
  email: row.email,
  msisdn: row.msisdn ?? null,
  ipAddress: row.ipAddress,
  deviceFingerprint: row.deviceFingerprint ?? null,
  status: row.status,
  reviewer: row.reviewer ?? null,
  reviewerNote: row.reviewerNote ?? null,
  synapseUserId: row.synapseUserId ?? null,
  decidedAt: row.decidedAt ? row.decidedAt.toISOString() : null,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

const mapBlacklist = (row: RegistrationBlacklistRow): RegistrationBlacklistEntry => ({
  id: row.id,
  type: row.type,
  value: row.value,
  reason: row.reason ?? null,
  createdBy: row.createdBy,
  expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
  createdAt: row.createdAt.toISOString(),
});

/**
 * 注册管理服务，负责应用审核及黑名单维�? *
 * 所有写操作均进入操作日志，确保审计可追溯
 */
export class RegistrationService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly operationLogService: OperationLogService
  ) {}

  async listApplications(filters: RegistrationApplicationFilters): Promise<RegistrationApplication[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters.status) {
      params.push(filters.status);
      conditions.push(`status = $${params.length}`);
    }

    if (filters.keyword) {
      params.push(`%${filters.keyword}%`);
      conditions.push(`(username ILIKE $${params.length} OR email ILIKE $${params.length})`);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
    const offset = Math.max(filters.offset ?? 0, 0);

    const rows = await this.databaseService.query<RegistrationApplicationRow>(
      `
        SELECT
          id,
          username,
          email,
          msisdn,
          ip_address AS "ipAddress",
          device_fingerprint AS "deviceFingerprint",
          status,
          reviewer,
          reviewer_note AS "reviewerNote",
          synapse_user_id AS "synapseUserId",
          decided_at AS "decidedAt",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM dashboard.registration_applications
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT ${limit}
        OFFSET ${offset}
      `,
      params
    );

    return rows.map(mapApplication);
  }

  async getApplication(applicationId: number): Promise<RegistrationApplication> {
    const rows = await this.databaseService.query<RegistrationApplicationRow>(
      `
        SELECT
          id,
          username,
          email,
          msisdn,
          ip_address AS "ipAddress",
          device_fingerprint AS "deviceFingerprint",
          status,
          reviewer,
          reviewer_note AS "reviewerNote",
          synapse_user_id AS "synapseUserId",
          decided_at AS "decidedAt",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM dashboard.registration_applications
        WHERE id = $1
        LIMIT 1
      `,
      [applicationId]
    );

    if (!rows.length) {
      throw createNotFoundError('注册申请不存在');
    }

    return mapApplication(rows[0]);
  }

  async approveApplication(
    applicationId: number,
    payload: RegistrationApprovalRequest,
    actorId: string
  ): Promise<RegistrationApplication> {
    const current = await this.getApplication(applicationId);
    if (current.status === 'approved') {
      throw createBadRequestError('该申请已审核通过');
    }

    const rows = await this.databaseService.query<RegistrationApplicationRow>(
      `
        UPDATE dashboard.registration_applications
        SET
          status = 'approved',
          reviewer = $1,
          reviewer_note = $2,
          synapse_user_id = COALESCE($3, synapse_user_id),
          decided_at = NOW(),
          updated_at = NOW()
        WHERE id = $4
        RETURNING
          id,
          username,
          email,
          msisdn,
          ip_address AS "ipAddress",
          device_fingerprint AS "deviceFingerprint",
          status,
          reviewer,
          reviewer_note AS "reviewerNote",
          synapse_user_id AS "synapseUserId",
          decided_at AS "decidedAt",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
      `,
      [actorId, payload.reviewerNote ?? null, payload.synapseUserId ?? null, applicationId]
    );

    const updated = mapApplication(rows[0]);

    if (payload.synapseUserId) {
      await this.ensureUserProfile(payload.synapseUserId);
    }

    await this.operationLogService.record({
      actorId,
      action: 'registration_approve',
      metadata: {
        applicationId,
        reviewerNote: payload.reviewerNote,
        synapseUserId: payload.synapseUserId,
      },
    });

    return updated;
  }

  async rejectApplication(
    applicationId: number,
    payload: RegistrationRejectionRequest,
    actorId: string
  ): Promise<RegistrationApplication> {
    const current = await this.getApplication(applicationId);
    if (current.status === 'rejected') {
      throw createBadRequestError('该申请已被拒绝');
    }

    const rows = await this.databaseService.query<RegistrationApplicationRow>(
      `
        UPDATE dashboard.registration_applications
        SET
          status = 'rejected',
          reviewer = $1,
          reviewer_note = $2,
          decided_at = NOW(),
          updated_at = NOW()
        WHERE id = $3
        RETURNING
          id,
          username,
          email,
          msisdn,
          ip_address AS "ipAddress",
          device_fingerprint AS "deviceFingerprint",
          status,
          reviewer,
          reviewer_note AS "reviewerNote",
          synapse_user_id AS "synapseUserId",
          decided_at AS "decidedAt",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
      `,
      [actorId, payload.reviewerNote, applicationId]
    );

    if (!rows.length) {
      throw createNotFoundError('注册申请不存在');
    }

    const updated = mapApplication(rows[0]);

    if (payload.blacklistTypes?.length) {
      await this.insertBlacklistEntriesFromApplication(updated, payload, actorId);
    }

    await this.operationLogService.record({
      actorId,
      action: 'registration_reject',
      metadata: {
        applicationId,
        reviewerNote: payload.reviewerNote,
        blacklistTypes: payload.blacklistTypes,
      },
    });

    return updated;
  }

  async listBlacklist(filters: RegistrationBlacklistFilters): Promise<RegistrationBlacklistEntry[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters.type) {
      params.push(filters.type);
      conditions.push(`type = $${params.length}`);
    }

    if (filters.value) {
      params.push(`%${filters.value}%`);
      conditions.push(`value ILIKE $${params.length}`);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
    const offset = Math.max(filters.offset ?? 0, 0);

    const rows = await this.databaseService.query<RegistrationBlacklistRow>(
      `
        SELECT
          id,
          type,
          value,
          reason,
          created_by AS "createdBy",
          expires_at AS "expiresAt",
          created_at AS "createdAt"
        FROM dashboard.registration_blacklist
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT ${limit}
        OFFSET ${offset}
      `,
      params
    );

    return rows.map(mapBlacklist);
  }

  async createBlacklistEntry(
    payload: CreateBlacklistEntryRequest,
    actorId: string
  ): Promise<RegistrationBlacklistEntry> {
    if (!payload.value.trim()) {
      throw createBadRequestError('黑名单值不能为空');
    }

    const rows = await this.databaseService.query<RegistrationBlacklistRow>(
      `
        INSERT INTO dashboard.registration_blacklist
        (type, value, reason, created_by, expires_at)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (type, value) DO UPDATE
        SET reason = EXCLUDED.reason,
            expires_at = EXCLUDED.expires_at,
            created_by = EXCLUDED.created_by,
            created_at = NOW()
        RETURNING
          id,
          type,
          value,
          reason,
          created_by AS "createdBy",
          expires_at AS "expiresAt",
          created_at AS "createdAt"
      `,
      [
        payload.type,
        payload.value.trim(),
        payload.reason ?? null,
        actorId,
        payload.expiresAt ? new Date(payload.expiresAt) : null,
      ]
    );

    const entry = mapBlacklist(rows[0]);

    await this.operationLogService.record({
      actorId,
      action: 'registration_blacklist_upsert',
      metadata: {
        entryId: entry.id,
        type: entry.type,
        value: entry.value,
      },
    });

    return entry;
  }

  async deleteBlacklistEntry(entryId: number, actorId: string): Promise<void> {
    const rows = await this.databaseService.query<{ id: number; type: RegistrationBlacklistType; value: string }>(
      `
        DELETE FROM dashboard.registration_blacklist
        WHERE id = $1
        RETURNING id, type, value
      `,
      [entryId]
    );

    if (!rows.length) {
      throw createNotFoundError('黑名单记录不存在');
    }

    await this.operationLogService.record({
      actorId,
      action: 'registration_blacklist_delete',
      metadata: rows[0],
    });
  }

  private async ensureUserProfile(synapseUserId: string): Promise<void> {
    await this.databaseService.query(
      `
        INSERT INTO dashboard.user_profiles
        (synapse_user_id, user_group, registration_status, risk_level)
        VALUES ($1, 'standard', 'active', 'low')
        ON CONFLICT (synapse_user_id) DO UPDATE
        SET registration_status = 'active',
            updated_at = NOW()
      `,
      [synapseUserId]
    );
  }

  private async insertBlacklistEntriesFromApplication(
    application: RegistrationApplication,
    payload: RegistrationRejectionRequest,
    actorId: string
  ): Promise<void> {
    const expiresAt = payload.blacklistExpiresAt ? new Date(payload.blacklistExpiresAt) : null;

    const entries: CreateBlacklistEntryRequest[] = [];
    payload.blacklistTypes?.forEach((type) => {
      const value = this.resolveBlacklistValue(application, type);
      if (value) {
        entries.push({
          type,
          value,
          reason: payload.reviewerNote,
          expiresAt: expiresAt ? expiresAt.toISOString() : null,
        });
      }
    });

    for (const entry of entries) {
      await this.createBlacklistEntry(entry, actorId);
    }
  }

  private resolveBlacklistValue(
    application: RegistrationApplication,
    type: RegistrationBlacklistType
  ): string | null {
    switch (type) {
      case 'username':
        return application.username;
      case 'email':
        return application.email;
      case 'msisdn':
        return application.msisdn ?? null;
      case 'ip_address':
        return application.ipAddress;
      case 'device_fingerprint':
        return application.deviceFingerprint ?? null;
      default:
        return null;
    }
  }
}
