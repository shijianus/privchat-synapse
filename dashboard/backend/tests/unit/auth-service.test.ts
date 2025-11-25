import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

import { config } from '../../src/config/env';
import { AuthService } from '../../src/services/auth-service';
import { DatabaseService } from '../../src/database/database-service';
import { RedisService } from '../../src/redis/redis-service';
import { OperationLogService } from '../../src/services/operation-log-service';

const buildAdminRow = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: 1,
  email: 'admin@matrix.local',
  password_hash: overrides.password_hash ?? '$2b$12$examplehash',
  full_name: 'Root Admin',
  role: (overrides.role as string) ?? 'super_admin',
  status: (overrides.status as string) ?? 'active',
  last_login_at: null,
  created_at: new Date('2024-05-01T00:00:00.000Z'),
  updated_at: new Date('2024-05-01T00:00:00.000Z'),
});

const createAuthService = () => {
  const queryMock = jest.fn();
  const databaseService = {
    query: queryMock,
  } as unknown as DatabaseService;

  const redisMocks = {
    setValue: jest.fn().mockResolvedValue(undefined),
    getValue: jest.fn().mockResolvedValue(null),
    deleteKey: jest.fn().mockResolvedValue(undefined),
    increment: jest.fn().mockResolvedValue(1),
    expire: jest.fn().mockResolvedValue(undefined),
  };
  const redisService = redisMocks as unknown as RedisService;

  const operationLogMock = jest.fn().mockResolvedValue(undefined);
  const operationLogService = {
    record: operationLogMock,
  } as unknown as OperationLogService;

  const service = new AuthService(databaseService, redisService, operationLogService);

  return {
    service,
    queryMock,
    redisMocks,
    operationLogMock,
  };
};

describe('AuthService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates the first administrator as a super admin without actor', async () => {
    const { service, queryMock, operationLogMock } = createAuthService();
    const insertedRow = buildAdminRow();

    queryMock
      .mockResolvedValueOnce([{ count: '0' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([insertedRow]);

    const result = await service.registerAdmin({
      email: 'admin@matrix.local',
      password: 'StrongPass123!',
      fullName: 'Root Admin',
    });

    expect(result.role).toBe('super_admin');
    expect(operationLogMock).toHaveBeenCalledWith({
      actorId: 'system',
      action: 'create_admin_user',
      metadata: expect.objectContaining({ email: 'admin@matrix.local' }),
    });
  });

  it('requires authenticated actor after the first administrator is created', async () => {
    const { service, queryMock } = createAuthService();
    queryMock.mockResolvedValueOnce([{ count: '1' }]);

    await expect(
      service.registerAdmin({
        email: 'second@matrix.local',
        password: 'StrongPass123!',
        fullName: 'Second Admin',
      })
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it('prevents duplicate administrator registrations', async () => {
    const { service, queryMock } = createAuthService();
    queryMock
      .mockResolvedValueOnce([{ count: '1' }])
      .mockResolvedValueOnce([{ id: 1 }]);

    await expect(
      service.registerAdmin(
        {
          email: 'existing@matrix.local',
          password: 'StrongPass123!',
          fullName: 'Duplicate',
          role: 'operator',
        },
        { id: '1', role: 'super_admin' }
      )
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('logs in active administrators and issues JWT tokens', async () => {
    const { service, queryMock, redisMocks } = createAuthService();
    const password = 'StrongPass123!';
    const hashed = await bcrypt.hash(password, 10);
    const row = buildAdminRow({ password_hash: hashed });

    redisMocks.getValue.mockResolvedValueOnce(null);
    queryMock.mockResolvedValueOnce([row]).mockResolvedValueOnce([]);

    const result = await service.login(row.email, password);

    expect(result.user.email).toBe(row.email);
    expect(result.accessToken).toBeDefined();
    expect(result.refreshToken).toBeDefined();
    expect(redisMocks.setValue).toHaveBeenCalledWith(
      expect.stringContaining('dashboard:auth:refresh:'),
      expect.any(String),
      config.refreshTokenTtlSeconds
    );
  });

  it('refreshes access tokens when refresh token is valid', async () => {
    const { service, queryMock, redisMocks } = createAuthService();
    const row = buildAdminRow();
    const refreshToken = jwt.sign(
      {
        sub: row.id.toString(),
        email: row.email,
        roles: ['super_admin'],
        permissions: [],
      },
      config.jwtRefreshSecret,
      { expiresIn: 3600 }
    );

    redisMocks.getValue.mockResolvedValueOnce(JSON.stringify({ adminId: row.id }));
    queryMock.mockResolvedValueOnce([row]);

    const result = await service.refreshAccessToken(refreshToken);

    expect(result.accessToken).toBeDefined();
  });
});
