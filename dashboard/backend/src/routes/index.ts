import { Router } from 'express';

import { AppealController } from '../controllers/appeal-controller';
import { BanController } from '../controllers/ban-controller';
import { MediaController } from '../controllers/media-controller';
import { MessageSyncController } from '../controllers/message-sync-controller';
import { RegistrationController } from '../controllers/registration-controller';
import { SystemController } from '../controllers/system-controller';
import { UserController } from '../controllers/user-controller';
import { AnnouncementController } from '../controllers/announcement-controller';
import { ReportController } from '../controllers/report-controller';

import { createAppealRoutes } from './appeal-routes';
import { createAnnouncementRoutes } from './announcement-routes';
import { createBanRoutes } from './ban-routes';
import { createMediaRoutes, createSyncTaskRoutes } from './media-routes';
import { createRegistrationRoutes } from './registration-routes';
import { createSystemRoutes } from './system-routes';
import { createUserRoutes } from './user-routes';
import { createMessageSyncRoutes } from './message-sync-routes';
import { createReportRoutes } from './report-routes';

export interface RouteDependencies {
  readonly userController: UserController;
  readonly banController: BanController;
  readonly appealController: AppealController;
  readonly mediaController: MediaController;
  readonly registrationController: RegistrationController;
  readonly systemController: SystemController;
  readonly messageSyncController: MessageSyncController;
  readonly announcementController: AnnouncementController;
  readonly reportController: ReportController;
}

/**
 * 聚合全部 API 路由
 */
export const createApiRouter = (deps: RouteDependencies): Router => {
  const router = Router();

  router.use('/users', createUserRoutes(deps.userController));
  router.use('/bans', createBanRoutes(deps.banController));
  router.use('/appeals', createAppealRoutes(deps.appealController));
  router.use('/announcements', createAnnouncementRoutes(deps.announcementController));
  router.use('/media', createMediaRoutes(deps.mediaController));
  router.use('/sync', createSyncTaskRoutes(deps.mediaController));
  router.use('/', createRegistrationRoutes(deps.registrationController));
  router.use('/system', createSystemRoutes(deps.systemController));
  router.use('/message-sync', createMessageSyncRoutes(deps.messageSyncController));
  router.use('/reports', createReportRoutes(deps.reportController));

  return router;
};
