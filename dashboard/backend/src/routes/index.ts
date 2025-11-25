import { Router } from 'express';

import { AppealController } from '../controllers/appeal-controller';
import { BanController } from '../controllers/ban-controller';
import { UserController } from '../controllers/user-controller';
import { createAppealRoutes } from './appeal-routes';
import { createBanRoutes } from './ban-routes';
import { createUserRoutes } from './user-routes';

export interface RouteDependencies {
  readonly userController: UserController;
  readonly banController: BanController;
  readonly appealController: AppealController;
}

/**
 * 聚合全部 API 路由
 */
export const createApiRouter = (deps: RouteDependencies): Router => {
  const router = Router();

  router.use('/users', createUserRoutes(deps.userController));
  router.use('/bans', createBanRoutes(deps.banController));
  router.use('/appeals', createAppealRoutes(deps.appealController));

  return router;
};
