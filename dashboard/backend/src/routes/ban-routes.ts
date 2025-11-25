import { Router } from 'express';

import {
  BanController,
  banIdParamSchema,
  updateBanBodySchema,
} from '../controllers/ban-controller';
import { requirePermissions } from '../middleware/permission-middleware';
import { validateBody, validateParams } from '../middleware/validate-request';

/**
 * 封禁路由定义
 */
export const createBanRoutes = (controller: BanController): Router => {
  const router = Router();

  router.get('/active', requirePermissions('user:ban:manage'), controller.listActiveBans);
  router.put(
    '/:banId',
    requirePermissions('user:ban:manage'),
    validateParams(banIdParamSchema),
    validateBody(updateBanBodySchema),
    controller.updateBan
  );

  return router;
};
