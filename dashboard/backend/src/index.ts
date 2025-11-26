import compression from 'compression';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import morgan from 'morgan';

import { config } from './config/env';
import { AppealController } from './controllers/appeal-controller';
import { AuthController } from './controllers/auth-controller';
import { BanController } from './controllers/ban-controller';
import { MediaController } from './controllers/media-controller';
import { RegistrationController } from './controllers/registration-controller';
import { SystemController } from './controllers/system-controller';
import { UserController } from './controllers/user-controller';
import { DatabaseService } from './database/database-service';
import { authMiddleware } from './middleware/auth-middleware';
import { errorHandler } from './middleware/error-handler';
import { RedisService } from './redis/redis-service';
import { createApiRouter } from './routes';
import { createAuthRoutes } from './routes/auth-routes';
import { createBotRoutes } from './routes/bot-routes';
import { createHealthRoutes } from './routes/health-routes';
import { AppealService } from './services/appeal-service';
import { AuthService } from './services/auth-service';
import { BanService } from './services/ban-service';
import { MediaService } from './services/media-service';
import { OperationLogService } from './services/operation-log-service';
import { RegistrationService } from './services/registration-service';
import { SystemService } from './services/system-service';
import { UserService } from './services/user-service';
import { httpLogStream, logger } from './utils/logger';

/**
 * 应用入口，负责初始化依赖并启动 HTTP 服务
 */
const startServer = async (): Promise<void> => {
  const databaseService = new DatabaseService();
  await databaseService.init();

  const redisService = new RedisService();
  await redisService.init();

  const operationLogService = new OperationLogService(databaseService);
  const userService = new UserService(databaseService, redisService, operationLogService);
  const appealService = new AppealService(databaseService, userService, operationLogService);
  const banService = new BanService(
    databaseService,
    redisService,
    userService,
    operationLogService
  );
  const authService = new AuthService(databaseService, redisService, operationLogService);
  const mediaService = new MediaService(databaseService, operationLogService);
  const registrationService = new RegistrationService(databaseService, operationLogService);
  const systemService = new SystemService(databaseService, redisService, operationLogService);

  const userController = new UserController(userService, banService);
  const banController = new BanController(banService);
  const appealController = new AppealController(appealService);
  const authController = new AuthController(authService);
  const mediaController = new MediaController(mediaService);
  const registrationController = new RegistrationController(registrationService);
  const systemController = new SystemController(systemService);

  const app = express();
  const limiter = rateLimit({
    windowMs: 60_000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.use(helmet());
  app.use(cors());
  app.use(compression());
  app.use(express.json({ limit: '1mb' }));
  app.use(morgan('combined', { stream: httpLogStream }));
  app.use(limiter);

  app.use('/health', createHealthRoutes());
  app.use('/api/v1/auth', createAuthRoutes(authController));
  app.use('/api/v1/bot', createBotRoutes({ appealController }));
  app.use(
    '/api/v1',
    authMiddleware,
    createApiRouter({
      userController,
      banController,
      appealController,
      mediaController,
      registrationController,
      systemController,
    })
  );

  app.use(errorHandler);

  app.listen(config.port, () => {
    logger.info('Dashboard API 在端口 %d 启动，环境: %s', config.port, config.env);
  });
};

startServer().catch((error) => {
  logger.error('服务启动失败: %s', error.stack || error.message);
  process.exit(1);
});
