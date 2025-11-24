import { Router } from 'express';

import { BanController, banIdParamSchema, updateBanBodySchema } from '../controllers/ban-controller';
import { validateBody, validateParams } from '../middleware/validate-request';

/**
 * 封禁路由定义
 */
export const createBanRoutes = (controller: BanController): Router => {
  const router = Router();

  router.get('/active', controller.listActiveBans);
  router.put(
    '/:banId',
    validateParams(banIdParamSchema),
    validateBody(updateBanBodySchema),
    controller.updateBan
  );

  return router;
};
