import { Router } from 'express';

import { MediaController } from '../controllers/media-controller';
import { requirePermissions } from '../middleware/permission-middleware';
import { validateBody, validateParams, validateQuery } from '../middleware/validate-request';
import {
  createSyncTaskSchema,
  listMediaQuerySchema,
  mediaHashParamSchema,
  syncTaskParamSchema,
  uploadMediaSchema,
} from '../validators/media-validators';

/**
 * 媒体管理路由
 */
export const createMediaRoutes = (controller: MediaController): Router => {
  const router = Router();

  router.get(
    '/',
    requirePermissions('media:read'),
    validateQuery(listMediaQuerySchema),
    controller.listMedia
  );
  router.get(
    '/:mediaHash',
    requirePermissions('media:read'),
    validateParams(mediaHashParamSchema),
    controller.getMediaByHash
  );
  router.post(
    '/upload',
    requirePermissions('media:policy:manage'),
    validateBody(uploadMediaSchema),
    controller.registerUpload
  );
  router.delete(
    '/:mediaHash',
    requirePermissions('media:policy:manage'),
    validateParams(mediaHashParamSchema),
    controller.deleteMedia
  );

  return router;
};

/**
 * 媒体同步任务路由
 */
export const createSyncTaskRoutes = (controller: MediaController): Router => {
  const router = Router();

  router.post(
    '/tasks',
    requirePermissions('media:policy:manage'),
    validateBody(createSyncTaskSchema),
    controller.createSyncTask
  );
  router.get(
    '/tasks/:taskId',
    requirePermissions('media:read'),
    validateParams(syncTaskParamSchema),
    controller.getSyncTask
  );

  return router;
};
