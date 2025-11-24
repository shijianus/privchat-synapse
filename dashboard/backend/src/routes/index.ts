import { Router } from 'express';

import { BanController } from '../controllers/ban-controller';
import { UserController } from '../controllers/user-controller';
import { createBanRoutes } from './ban-routes';
import { createUserRoutes } from './user-routes';

export interface RouteDependencies {
  readonly userController: UserController;
  readonly banController: BanController;
}

/**
 * 聚合全部 API 路由
 */
export const createApiRouter = (deps: RouteDependencies): Router => {
  const router = Router();

  router.use('/users', createUserRoutes(deps.userController));
  router.use('/bans', createBanRoutes(deps.banController));

  return router;
};
