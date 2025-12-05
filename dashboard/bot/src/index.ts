import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import dotenv from 'dotenv';
import { MatrixBotService } from './services/matrix-bot';
import { AppealService } from './services/appeal-service';
import { FriendVerificationService } from './services/friend-verification-service';
import { DashboardApiService } from './services/dashboard-api-service';
import { DatabaseService } from './services/database-service';
import { RedisService } from './services/redis-service';
import { ShadowBroadcastPayload } from './services/shadow-room-service';
import { logger } from './utils/logger';
import { config } from './config/env';

// Load environment variables
dotenv.config();

/**
 * Matrix Dashboard Bot - 申诉收集和朋友验证服务
 * 根据 REQUEST.md §XIV 规范实现
 */
async function startBot(): Promise<void> {
  const fastify: FastifyInstance = Fastify({
    logger: false, // 使用自定义 logger
  });

  // 注册插件
  await fastify.register(helmet);
  await fastify.register(cors, {
    origin: config.corsOrigins,
  });
  await fastify.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  });

  // 初始化服务
  const databaseService = new DatabaseService();
  await databaseService.init();

  const redisService = new RedisService();
  await redisService.init();

  const appealService = new AppealService(databaseService, redisService);
  const friendVerificationService = new FriendVerificationService(
    databaseService,
    redisService
  );
  const dashboardApiService = new DashboardApiService();
  const matrixBot = new MatrixBotService(
    appealService,
    friendVerificationService,
    dashboardApiService,
    redisService
  );

  // 健康检查路由
  fastify.get('/health', async () => {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'matrix-dashboard-bot',
    };
  });

  // Webhook 路由 (用于与主 API 通信)
  fastify.post('/webhooks/appeal', {
    config: {
      rateLimit: {
        max: 10,
        timeWindow: '1 minute',
      },
    },
  }, async (request, reply) => {
    try {
      const webhook = request.body as any;
      await matrixBot.handleAppealWebhook(webhook);
      return { status: 'processed' };
    } catch (error) {
      logger.error('处理申诉 webhook 失败:', error);
      reply.code(500);
      return { error: '处理失败' };
    }
  });

  fastify.post('/webhooks/verification', {
    config: {
      rateLimit: {
        max: 5,
        timeWindow: '1 minute',
      },
    },
  }, async (request, reply) => {
    try {
      const webhook = request.body as any;
      await matrixBot.handleVerificationWebhook(webhook);
      return { status: 'processed' };
    } catch (error) {
      logger.error('处理验证 webhook 失败:', error);
      reply.code(500);
      return { error: '处理失败' };
    }
  });

  fastify.post(
    '/webhooks/broadcast',
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: '1 minute',
        },
      },
    },
    async (request, reply) => {
      try {
        const authHeader = request.headers.authorization;
        if (!authHeader || authHeader.replace('Bearer ', '').trim() !== config.botApiSecret) {
          reply.code(401);
          return { error: 'unauthorized' };
        }

        const webhook = request.body as ShadowBroadcastPayload;
        if (!webhook?.channelKey || !webhook?.title || !webhook?.content || !webhook?.audience) {
          reply.code(400);
          return { error: 'channelKey、title、content、audience 均为必填' };
        }
        const result = await matrixBot.handleBroadcastWebhook(webhook);
        return { status: 'processed', roomIds: result.roomIds, delivered: result.delivered };
      } catch (error) {
        logger.error('处理广播 webhook 失败:', error);
        reply.code(500);
        return { error: '处理失败' };
      }
    }
  );

  fastify.post(
    '/webhooks/ensure_dm',
    async (request, reply) => {
      try {
        const authHeader = request.headers.authorization;
        if (!authHeader || authHeader.replace('Bearer ', '').trim() !== config.botApiSecret) {
          reply.code(401);
          return { error: 'unauthorized' };
        }
        const body = request.body as { audience?: string[]; channelKey?: string };
        if (!body?.audience || body.audience.length === 0) {
          reply.code(400);
          return { error: 'audience 不能为空' };
        }
        const result = await matrixBot.ensureDirects(body.audience, body.channelKey);
        return { status: 'processed', roomIds: result };
      } catch (error) {
        logger.error('处理 ensure_dm webhook 失败:', error);
        reply.code(500);
        return { error: '处理失败' };
      }
    }
  );

  // 启动 Matrix Bot
  await matrixBot.start();

  // 启动 HTTP 服务器
  try {
    await fastify.listen({
      port: config.port,
      host: config.host,
    });
    logger.info('Matrix Dashboard Bot 启动在端口 %d', config.port);
  } catch (error) {
    logger.error('启动失败:', error);
    process.exit(1);
  }

  // 优雅关闭处理
  const shutdown = async (signal: string) => {
    logger.info('收到 %s 信号，开始优雅关闭...', signal);

    try {
      await matrixBot.stop();
      await fastify.close();
      await redisService.disconnect();
      await databaseService.disconnect();
      logger.info('优雅关闭完成');
      process.exit(0);
    } catch (error) {
      logger.error('优雅关闭失败:', error);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

// 启动服务
startBot().catch((error) => {
  logger.error('Matrix Bot 启动失败:', error);
  process.exit(1);
});
