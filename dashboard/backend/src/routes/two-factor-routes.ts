import { Router } from 'express';

import { TwoFactorController } from '../controllers/two-factor-controller';
import { validateParams } from '../middleware/validate-request';
import { twoFactorStatusParamsSchema } from '../validators/two-factor-validators';

/**
 * 面向客户端的 2FA 状态查询路由
 */
export const createTwoFactorRoutes = (controller: TwoFactorController): Router => {
  const router = Router();

  router.get(
    '/users/:synapseUserId/status',
    validateParams(twoFactorStatusParamsSchema),
    controller.getStatus
  );

  return router;
};
