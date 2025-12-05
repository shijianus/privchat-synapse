import { Router } from 'express';

import { AnnouncementController } from '../controllers/announcement-controller';
import { requireRoles } from '../middleware/permission-middleware';
import { validateBody } from '../middleware/validate-request';
import { broadcastAnnouncementSchema } from '../validators/announcement-validators';

export const createAnnouncementRoutes = (
  controller: AnnouncementController
): Router => {
  const router = Router();

  router.post(
    '/broadcast',
    requireRoles('admin', 'super_admin'),
    validateBody(broadcastAnnouncementSchema),
    controller.broadcast.bind(controller)
  );

  return router;
};
