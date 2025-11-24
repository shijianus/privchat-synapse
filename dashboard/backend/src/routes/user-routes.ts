import { Router } from 'express';

import {
  UserController,
  createBanBodySchema,
  listUsersQuerySchema,
  updateUserBodySchema,
  userIdParamSchema,
} from '../controllers/user-controller';
import { validateBody, validateParams, validateQuery } from '../middleware/validate-request';

/**
 * 用户路由定义
 */
export const createUserRoutes = (controller: UserController): Router => {
  const router = Router();

  router.get('/', validateQuery(listUsersQuerySchema), controller.listUsers);
  router.get('/:synapseUserId', validateParams(userIdParamSchema), controller.getUserProfile);
  router.put(
    '/:synapseUserId',
    validateParams(userIdParamSchema),
    validateBody(updateUserBodySchema),
    controller.updateUserProfile
  );
  router.get(
    '/:synapseUserId/bans',
    validateParams(userIdParamSchema),
    controller.listUserBans
  );
  router.post(
    '/:synapseUserId/bans',
    validateParams(userIdParamSchema),
    validateBody(createBanBodySchema),
    controller.createBanForUser
  );

  return router;
};
