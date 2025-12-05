import { Router } from 'express';

import { ReportController } from '../controllers/report-controller';
import { requireRoles } from '../middleware/permission-middleware';

export const createReportRoutes = (controller: ReportController): Router => {
  const router = Router();

  router.get('/', requireRoles('moderator', 'admin', 'super_admin'), controller.list.bind(controller));

  return router;
};
