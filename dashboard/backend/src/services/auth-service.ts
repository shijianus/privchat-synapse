import bcrypt from 'bcrypt';
import jwt, { JwtPayload } from 'jsonwebtoken';

import { config } from '../config/env';
import { getPermissionsForRole } from '../config/rbac';
import { DatabaseService } from '../database/database-service';
import { RedisService } from '../redis/redis-service';
import {
  AdminRegistrationRequest,
  AdminRole,
  AdminStatus,
  AdminUser,
  PublicAdminUser,
} from '../types/admin';
import { AuthTokens } from '../types/auth';
import { OperationLogService } from './operation-log-service';
import { HttpError, createBadRequestError } from '../utils/http-error';

interface AdminUserRow {
  readonly id: number;
  readonly email: string;
  readonly password_hash: string;
  readonly full_name: string;
  readonly role: AdminRole;
  readonly status: AdminStatus;
  readonly last_login_at: Date | null;
  readonly created_at: Date;
  readonly updated_at: Date;
}

interface AdminActor {
  readonly id: string;
  readonly role: AdminRole;
}

const REFRESH_TOKEN_PREFIX = 'dashboard:auth:refresh:';
const FAILED_LOGIN_PREFIX = 'dashboard:auth:failed:';
const ACCOUNT_LOCK_PREFIX = 'dashboard:auth:locked:';

const toIso = (value?: Date | null): string | null => (value ? value.toISOString() : null);

const mapAdminRow = (row: AdminUserRow): AdminUser => ({
  id: row.id,
  email: row.email,
  passwordHash: row.password_hash,
  fullName: row.full_name,
  role: row.role,
  status: row.status,
  lastLoginAt: toIso(row.last_login_at),
  createdAt: row.created_at.toISOString(),
  updatedAt: row.updated_at.toISOString(),
});

/**
 * 提供管理员注册、登录、令牌管理等核心逻辑。
 */
export class AuthService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly redisService: RedisService,
    private readonly operationLogService: OperationLogService
  ) {}

  async registerAdmin(
    payload: AdminRegistrationRequest,
    actor?: AdminActor
  ): Promise<PublicAdminUser> {
    const normalizedEmail = payload.email.trim().toLowerCase();
    this.ensurePasswordStrength(payload.password);

    const existing = await this.databaseService.query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM dashboard.admin_users'
    );
    const totalAdmins = Number(existing[0]?.count ?? '0');
    const isFirstAdmin = totalAdmins === 0;

    if (!isFirstAdmin && !actor) {
      throw new HttpError(401, '需要已登录管理员才能创建新账号');
    }

    const desiredRole = this.resolveRole(payload.role, actor, isFirstAdmin);

    const duplicate = await this.databaseService.query<{ id: number }>(
      'SELECT id FROM dashboard.admin_users WHERE email = $1',
      [normalizedEmail]
    );
    if (duplicate.length) {
      throw createBadRequestError('该邮箱已被注册');
    }

    const passwordHash = await bcrypt.hash(payload.password, 12);
    const rows = await this.databaseService.query<AdminUserRow>(
      `
        INSERT INTO dashboard.admin_users
        (email, password_hash, full_name, role, status)
        VALUES ($1, $2, $3, $4, 'active')
        RETURNING
          id,
          email,
          password_hash,
          full_name,
          role,
          status,
          last_login_at,
          created_at,
          updated_at
      `,
      [normalizedEmail, passwordHash, payload.fullName, desiredRole]
    );

    const admin = mapAdminRow(rows[0]);
    const recordActor = actor?.id ?? 'system';

    await this.operationLogService.record({
      actorId: recordActor,
      action: 'create_admin_user',
      metadata: {
        adminId: admin.id,
        email: admin.email,
        role: admin.role,
      },
    });

    return this.stripPassword(admin);
  }

  async login(email: string, password: string): Promise<AuthTokens> {
    const normalizedEmail = email.trim().toLowerCase();

    await this.ensureNotLocked(normalizedEmail);

    const admin = await this.getAdminByEmail(normalizedEmail);
    if (admin.status !== 'active') {
      throw new HttpError(403, '管理员账户已被停用');
    }

    const valid = await bcrypt.compare(password, admin.passwordHash);
    if (!valid) {
      await this.trackFailedLogin(normalizedEmail);
      throw new HttpError(401, '邮箱或密码错误');
    }

    await this.resetFailedLogin(normalizedEmail);
    await this.updateLastLogin(admin.id);

    const tokens = this.issueTokens(admin);
    await this.persistRefreshToken(tokens.refreshToken, admin.id);

    return tokens;
  }

  async refreshAccessToken(refreshToken: string): Promise<{ accessToken: string }> {
    const cacheKey = this.getRefreshTokenKey(refreshToken);
    const cached = await this.redisService.getValue(cacheKey);
    if (!cached) {
      throw new HttpError(401, '刷新令牌已失效');
    }

    try {
      const decoded = jwt.verify(refreshToken, config.jwtRefreshSecret) as JwtPayload;
      const adminId = Number(decoded.sub);
      if (!adminId) {
        throw new HttpError(401, '刷新令牌缺少管理员信息');
      }

      const admin = await this.getAdminById(adminId);
      if (admin.status !== 'active') {
        throw new HttpError(403, '管理员已被禁用');
      }

      const accessToken = this.generateAccessToken(admin);
      return { accessToken };
    } catch (error) {
      throw new HttpError(401, '刷新令牌验证失败', (error as Error).message);
    }
  }

  async logout(refreshToken: string): Promise<void> {
    const cacheKey = this.getRefreshTokenKey(refreshToken);
    await this.redisService.deleteKey(cacheKey);
  }

  private resolveRole(
    requestedRole: AdminRole | undefined,
    actor: AdminActor | undefined,
    isFirstAdmin: boolean
  ): AdminRole {
    if (isFirstAdmin) {
      return 'super_admin';
    }

    if (!requestedRole) {
      return 'operator';
    }

    if (!actor) {
      throw new HttpError(403, '只有授权管理员才能指定角色');
    }

    if (actor.role !== 'super_admin' && requestedRole === 'super_admin') {
      throw new HttpError(403, '只有超级管理员可以创建超级管理员');
    }

    if (actor.role === 'moderator' && requestedRole !== 'operator' && requestedRole !== 'viewer') {
      throw new HttpError(403, '当前管理员无权创建该角色');
    }

    return requestedRole;
  }

  private stripPassword(admin: AdminUser): PublicAdminUser {
    const { passwordHash: _passwordHash, ...rest } = admin;
    return rest;
  }

  private issueTokens(admin: AdminUser): AuthTokens {
    const accessToken = this.generateAccessToken(admin);
    const refreshToken = this.generateRefreshToken(admin);

    return {
      accessToken,
      refreshToken,
      user: this.stripPassword(admin),
    };
  }

  private generateAccessToken(admin: AdminUser): string {
    return jwt.sign(this.buildTokenPayload(admin), config.jwtSecret, {
      expiresIn: config.accessTokenTtlSeconds,
    });
  }

  private generateRefreshToken(admin: AdminUser): string {
    return jwt.sign(this.buildTokenPayload(admin), config.jwtRefreshSecret, {
      expiresIn: config.refreshTokenTtlSeconds,
    });
  }

  private buildTokenPayload(admin: AdminUser) {
    return {
      sub: admin.id.toString(),
      email: admin.email,
      roles: [admin.role],
      permissions: getPermissionsForRole(admin.role),
    };
  }

  private async persistRefreshToken(token: string, adminId: number): Promise<void> {
    const cacheKey = this.getRefreshTokenKey(token);
    await this.redisService.setValue(
      cacheKey,
      JSON.stringify({ adminId }),
      config.refreshTokenTtlSeconds
    );
  }

  private getRefreshTokenKey(token: string): string {
    return `${REFRESH_TOKEN_PREFIX}${token}`;
  }

  private getFailedLoginKey(email: string): string {
    return `${FAILED_LOGIN_PREFIX}${email}`;
  }

  private getAccountLockKey(email: string): string {
    return `${ACCOUNT_LOCK_PREFIX}${email}`;
  }

  private async ensureNotLocked(email: string): Promise<void> {
    const lockKey = this.getAccountLockKey(email);
    const locked = await this.redisService.getValue(lockKey);
    if (locked) {
      throw new HttpError(423, '账户已被暂时锁定，请稍后重试');
    }
  }

  private async trackFailedLogin(email: string): Promise<void> {
    const key = this.getFailedLoginKey(email);
    const attempts = await this.redisService.increment(key);
    await this.redisService.expire(key, 900);

    if (attempts >= 5) {
      const lockKey = this.getAccountLockKey(email);
      await this.redisService.setValue(lockKey, '1', 1_800);
    }
  }

  private async resetFailedLogin(email: string): Promise<void> {
    await this.redisService.deleteKey(this.getFailedLoginKey(email));
    await this.redisService.deleteKey(this.getAccountLockKey(email));
  }

  private ensurePasswordStrength(password: string): void {
    if (password.length < 12) {
      throw createBadRequestError('密码长度至少 12 位');
    }

    const complexity = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/;
    if (!complexity.test(password)) {
      throw createBadRequestError('密码必须包含大小写字母、数字和特殊字符');
    }
  }

  private async getAdminByEmail(email: string): Promise<AdminUser> {
    const rows = await this.databaseService.query<AdminUserRow>(
      `
        SELECT
          id,
          email,
          password_hash,
          full_name,
          role,
          status,
          last_login_at,
          created_at,
          updated_at
        FROM dashboard.admin_users
        WHERE email = $1
        LIMIT 1
      `,
      [email]
    );

    if (!rows.length) {
      throw new HttpError(401, '邮箱或密码错误');
    }

    return mapAdminRow(rows[0]);
  }

  private async getAdminById(adminId: number): Promise<AdminUser> {
    const rows = await this.databaseService.query<AdminUserRow>(
      `
        SELECT
          id,
          email,
          password_hash,
          full_name,
          role,
          status,
          last_login_at,
          created_at,
          updated_at
        FROM dashboard.admin_users
        WHERE id = $1
        LIMIT 1
      `,
      [adminId]
    );

    if (!rows.length) {
      throw new HttpError(404, '管理员不存在');
    }

    return mapAdminRow(rows[0]);
  }

  private async updateLastLogin(adminId: number): Promise<void> {
    await this.databaseService.query(
      `
        UPDATE dashboard.admin_users
        SET last_login_at = NOW(), updated_at = NOW()
        WHERE id = $1
      `,
      [adminId]
    );
  }
}
