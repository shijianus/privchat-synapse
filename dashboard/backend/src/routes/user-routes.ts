import { Router } from 'express';

import {
  UserController,
  createBanBodySchema,
  listUsersQuerySchema,
  updateUserBodySchema,
  userIdParamSchema,
} from '../controllers/user-controller';
import { requirePermissions } from '../middleware/permission-middleware';
import { validateBody, validateParams, validateQuery } from '../middleware/validate-request';

/**
 * 用户路由定义
 */
export const createUserRoutes = (controller: UserController): Router => {
  const router = Router();

  router.get(
    '/',
    requirePermissions('user:read'),
    validateQuery(listUsersQuerySchema),
    controller.listUsers
  );
  router.get(
    '/:synapseUserId',
    requirePermissions('user:read'),
    validateParams(userIdParamSchema),
    controller.getUserProfile
  );
  router.put(
    '/:synapseUserId',
    requirePermissions('user:write'),
    validateParams(userIdParamSchema),
    validateBody(updateUserBodySchema),
    controller.updateUserProfile
  );
  router.get(
    '/:synapseUserId/bans',
    requirePermissions('user:ban:manage'),
    validateParams(userIdParamSchema),
    controller.listUserBans
  );
  router.post(
    '/:synapseUserId/bans',
    requirePermissions('user:ban:manage'),
    validateParams(userIdParamSchema),
    validateBody(createBanBodySchema),
    controller.createBanForUser
  );

  return router;
};
