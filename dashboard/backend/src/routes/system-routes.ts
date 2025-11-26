import { Router } from 'express';

import { SystemController } from '../controllers/system-controller';
import { requirePermissions } from '../middleware/permission-middleware';
import { validateBody } from '../middleware/validate-request';
import { updateSystemConfigSchema } from '../validators/system-validators';

/**
 * 系统监控与配置相关路由
 */
export const createSystemRoutes = (controller: SystemController): Router => {
  const router = Router();

  router.get('/health', requirePermissions('system:monitoring'), controller.getHealth);
  router.get('/stats', requirePermissions('system:monitoring'), controller.getStats);
  router.get('/config', requirePermissions('system:monitoring'), controller.getConfig);
  router.put(
    '/config',
    requirePermissions('system:config'),
    validateBody(updateSystemConfigSchema),
    controller.updateConfig
  );

  return router;
};
