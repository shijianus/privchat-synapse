import { Router } from 'express';

import { AppealController } from '../controllers/appeal-controller';
import { requirePermissions } from '../middleware/permission-middleware';
import { validateBody, validateParams, validateQuery } from '../middleware/validate-request';
import {
  adminDecisionSchema,
  adminMessageSchema,
  appealIdParamSchema,
  listAppealsQuerySchema,
} from '../validators/appeal-validators';

/**
 * 申诉管理路由（管理员端）
 */
export const createAppealRoutes = (controller: AppealController): Router => {
  const router = Router();

  router.get(
    '/',
    requirePermissions('appeal:read'),
    validateQuery(listAppealsQuerySchema),
    controller.listAppeals
  );
  router.get(
    '/:appealId',
    requirePermissions('appeal:read'),
    validateParams(appealIdParamSchema),
    controller.getAppeal
  );
  router.post(
    '/:appealId/messages',
    requirePermissions('appeal:process'),
    validateParams(appealIdParamSchema),
    validateBody(adminMessageSchema),
    controller.addAdminMessage
  );
  router.post(
    '/:appealId/decision',
    requirePermissions('appeal:process'),
    validateParams(appealIdParamSchema),
    validateBody(adminDecisionSchema),
    controller.decideAppeal
  );

  return router;
};
