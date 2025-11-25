import { AppealService } from '../../src/services/appeal-service';
import { DatabaseService } from '../../src/database/database-service';
import { UserService } from '../../src/services/user-service';
import { OperationLogService } from '../../src/services/operation-log-service';

const buildAppealRow = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: 10,
  userId: 42,
  synapseUserId: '@demo:matrix.local',
  banId: null,
  contactEmail: 'user@matrix.local',
  contactMatrix: '@demo:matrix.local',
  reason: 'Requesting review',
  status: (overrides.status as string) ?? 'pending',
  createdAt: overrides.createdAt ?? new Date('2024-05-01T00:00:00.000Z'),
  updatedAt: overrides.updatedAt ?? new Date('2024-05-01T00:00:00.000Z'),
  ...overrides,
});

const buildMessageRow = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: 5,
  appealId: 10,
  author: '@demo:matrix.local',
  body: 'Please lift the ban',
  createdAt: overrides.createdAt ?? new Date('2024-05-01T01:00:00.000Z'),
  ...overrides,
});

const createService = () => {
  const query = jest.fn();
  const queryWithClient = jest.fn();
  const withTransaction = jest.fn(async (handler) => handler({} as never));

  const databaseService = {
    query,
    queryWithClient,
    withTransaction,
  } as unknown as DatabaseService;

  const userService = {
    getInternalUserId: jest.fn(),
  } as unknown as UserService;

  const operationLogService = {
    record: jest.fn().mockResolvedValue(undefined),
  } as unknown as OperationLogService;

  const service = new AppealService(databaseService, userService, operationLogService);

  return {
    service,
    query,
    queryWithClient,
    withTransaction,
    userService,
    operationLogService,
  };
};

describe('AppealService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('submits appeals and stores the initial message', async () => {
    const ctx = createService();
    (ctx.userService.getInternalUserId as jest.Mock).mockResolvedValue(42);

    const insertedRow = buildAppealRow();
    const messageRow = buildMessageRow();

    ctx.queryWithClient
      // pending count
      .mockResolvedValueOnce([{ count: '0' }])
      // insert appeal
      .mockResolvedValueOnce([insertedRow])
      // insert message
      .mockResolvedValueOnce([messageRow])
      // touch updated_at
      .mockResolvedValueOnce([])
      // fetch messages
      .mockResolvedValueOnce([messageRow]);

    const result = await ctx.service.submitAppeal(
      {
        synapseUserId: insertedRow.synapseUserId,
        reason: 'Requesting review',
        message: 'Please lift the ban',
      },
      insertedRow.synapseUserId
    );

    expect(result.messages).toHaveLength(1);
    expect(ctx.operationLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'submit_user_appeal' }),
      expect.any(Object)
    );
  });

  it('rejects submissions when pending appeals exceed limit', async () => {
    const ctx = createService();
    (ctx.userService.getInternalUserId as jest.Mock).mockResolvedValue(42);

    ctx.queryWithClient.mockResolvedValueOnce([{ count: '3' }]);

    await expect(
      ctx.service.submitAppeal(
        { synapseUserId: '@demo:matrix.local', reason: 'Need help' },
        '@demo:matrix.local'
      )
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('decides appeals and records the decision', async () => {
    const ctx = createService();

    const pendingRow = buildAppealRow();
    const updatedRow = buildAppealRow({ status: 'accepted' });
    const messageRow = buildMessageRow({ author: 'admin:1' });

    ctx.queryWithClient
      // fetch existing appeal
      .mockResolvedValueOnce([pendingRow])
      // update appeal status
      .mockResolvedValueOnce([updatedRow])
      // insert admin response message
      .mockResolvedValueOnce([messageRow])
      // touch updated_at
      .mockResolvedValueOnce([])
      // fetch messages
      .mockResolvedValueOnce([messageRow]);

    const detail = await ctx.service.decideAppeal(
      pendingRow.id,
      { status: 'accepted', responseMessage: 'Welcome back' },
      '1'
    );

    expect(detail.status).toBe('accepted');
    expect(detail.messages[0].author).toBe('admin:1');
    expect(ctx.operationLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'appeal_decision' }),
      expect.any(Object)
    );
  });
});
