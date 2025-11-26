import { Router } from 'express';

import { MessageSyncController } from '../controllers/message-sync-controller';
import { requirePermissions } from '../middleware/permission-middleware';
import { validateBody, validateParams, validateQuery } from '../middleware/validate-request';
import {
  messageIdParamSchema,
  messageSyncActionBodySchema,
  pendingMessageQuerySchema,
} from '../validators/message-sync-validators';

/**
 * 消息同步管理路由
 */
export const createMessageSyncRoutes = (controller: MessageSyncController): Router => {
  const router = Router();

  router.get(
    '/pending',
    requirePermissions('user:read'),
    validateQuery(pendingMessageQuerySchema),
    controller.listPendingMessages
  );

  router.post(
    '/pending/:messageId/replay',
    requirePermissions('user:write'),
    validateParams(messageIdParamSchema),
    validateBody(messageSyncActionBodySchema),
    controller.replayMessage
  );

  router.post(
    '/pending/:messageId/discard',
    requirePermissions('user:write'),
    validateParams(messageIdParamSchema),
    validateBody(messageSyncActionBodySchema),
    controller.discardMessage
  );

  return router;
};
