"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const bcrypt_1 = __importDefault(require("bcrypt"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const env_1 = require("../../src/config/env");
const auth_service_1 = require("../../src/services/auth-service");
const buildAdminRow = (overrides = {}) => ({
    id: 1,
    email: 'admin@matrix.local',
    password_hash: overrides.password_hash ?? '$2b$12$examplehash',
    full_name: 'Root Admin',
    role: overrides.role ?? 'super_admin',
    status: overrides.status ?? 'active',
    last_login_at: null,
    created_at: new Date('2024-05-01T00:00:00.000Z'),
    updated_at: new Date('2024-05-01T00:00:00.000Z'),
});
const createAuthService = () => {
    const queryMock = jest.fn();
    const databaseService = {
        query: queryMock,
    };
    const redisMocks = {
        setValue: jest.fn().mockResolvedValue(undefined),
        getValue: jest.fn().mockResolvedValue(null),
        deleteKey: jest.fn().mockResolvedValue(undefined),
        increment: jest.fn().mockResolvedValue(1),
        expire: jest.fn().mockResolvedValue(undefined),
    };
    const redisService = redisMocks;
    const operationLogMock = jest.fn().mockResolvedValue(undefined);
    const operationLogService = {
        record: operationLogMock,
    };
    const service = new auth_service_1.AuthService(databaseService, redisService, operationLogService);
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
        await expect(service.registerAdmin({
            email: 'second@matrix.local',
            password: 'StrongPass123!',
            fullName: 'Second Admin',
        })).rejects.toMatchObject({ statusCode: 401 });
    });
    it('prevents duplicate administrator registrations', async () => {
        const { service, queryMock } = createAuthService();
        queryMock
            .mockResolvedValueOnce([{ count: '1' }])
            .mockResolvedValueOnce([{ id: 1 }]);
        await expect(service.registerAdmin({
            email: 'existing@matrix.local',
            password: 'StrongPass123!',
            fullName: 'Duplicate',
            role: 'operator',
        }, { id: '1', role: 'super_admin' })).rejects.toMatchObject({ statusCode: 400 });
    });
    it('logs in active administrators and issues JWT tokens', async () => {
        const { service, queryMock, redisMocks } = createAuthService();
        const password = 'StrongPass123!';
        const hashed = await bcrypt_1.default.hash(password, 10);
        const row = buildAdminRow({ password_hash: hashed });
        redisMocks.getValue.mockResolvedValueOnce(null);
        queryMock.mockResolvedValueOnce([row]).mockResolvedValueOnce([]);
        const result = await service.login(row.email, password);
        expect(result.user.email).toBe(row.email);
        expect(result.accessToken).toBeDefined();
        expect(result.refreshToken).toBeDefined();
        expect(redisMocks.setValue).toHaveBeenCalledWith(expect.stringContaining('dashboard:auth:refresh:'), expect.any(String), env_1.config.refreshTokenTtlSeconds);
    });
    it('refreshes access tokens when refresh token is valid', async () => {
        const { service, queryMock, redisMocks } = createAuthService();
        const row = buildAdminRow();
        const refreshToken = jsonwebtoken_1.default.sign({
            sub: row.id.toString(),
            email: row.email,
            roles: ['super_admin'],
            permissions: [],
        }, env_1.config.jwtRefreshSecret, { expiresIn: 3600 });
        redisMocks.getValue.mockResolvedValueOnce(JSON.stringify({ adminId: row.id }));
        queryMock.mockResolvedValueOnce([row]);
        const result = await service.refreshAccessToken(refreshToken);
        expect(result.accessToken).toBeDefined();
    });
});
//# sourceMappingURL=auth-service.test.js.map