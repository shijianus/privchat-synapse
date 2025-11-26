import { Router } from 'express';

import { AppealController } from '../controllers/appeal-controller';
import { BanController } from '../controllers/ban-controller';
import { MediaController } from '../controllers/media-controller';
import { RegistrationController } from '../controllers/registration-controller';
import { SystemController } from '../controllers/system-controller';
import { UserController } from '../controllers/user-controller';

import { createAppealRoutes } from './appeal-routes';
import { createBanRoutes } from './ban-routes';
import { createMediaRoutes, createSyncTaskRoutes } from './media-routes';
import { createRegistrationRoutes } from './registration-routes';
import { createSystemRoutes } from './system-routes';
import { createUserRoutes } from './user-routes';

export interface RouteDependencies {
  readonly userController: UserController;
  readonly banController: BanController;
  readonly appealController: AppealController;
  readonly mediaController: MediaController;
  readonly registrationController: RegistrationController;
  readonly systemController: SystemController;
}

/**
 * 聚合全部 API 路由
 */
export const createApiRouter = (deps: RouteDependencies): Router => {
  const router = Router();

  router.use('/users', createUserRoutes(deps.userController));
  router.use('/bans', createBanRoutes(deps.banController));
  router.use('/appeals', createAppealRoutes(deps.appealController));
  router.use('/media', createMediaRoutes(deps.mediaController));
  router.use('/sync', createSyncTaskRoutes(deps.mediaController));
  router.use('/', createRegistrationRoutes(deps.registrationController));
  router.use('/system', createSystemRoutes(deps.systemController));

  return router;
};
