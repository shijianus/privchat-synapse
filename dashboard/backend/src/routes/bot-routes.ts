import { Router } from 'express';

import { AppealController } from '../controllers/appeal-controller';
import { ReportController } from '../controllers/report-controller';
import { TwoFactorController } from '../controllers/two-factor-controller';
import { botAuthMiddleware } from '../middleware/bot-auth-middleware';
import { validateBody, validateParams } from '../middleware/validate-request';
import {
  appealIdParamSchema,
  botMessageSchema,
  botSubmitAppealSchema,
} from '../validators/appeal-validators';
import { friendVerificationSchema } from '../validators/two-factor-validators';
import { botReportSchema } from '../validators/report-validators';

export interface BotRouteDependencies {
  readonly appealController: AppealController;
  readonly twoFactorController: TwoFactorController;
  readonly reportController: ReportController;
}

/**
 * 面向 Matrix Bot 的专用 API 路由
 */
export const createBotRoutes = (deps: BotRouteDependencies): Router => {
  const router = Router();

  router.post(
    '/appeals',
    botAuthMiddleware,
    validateBody(botSubmitAppealSchema),
    deps.appealController.submitAppealFromBot
  );

  router.post(
    '/appeals/:appealId/messages',
    botAuthMiddleware,
    validateParams(appealIdParamSchema),
    validateBody(botMessageSchema),
    deps.appealController.appendAppealMessageFromBot
  );

  router.post(
    '/2fa/friend-verify',
    botAuthMiddleware,
    validateBody(friendVerificationSchema),
    deps.twoFactorController.verifyFriend
  );

  router.post(
    '/reports',
    botAuthMiddleware,
    validateBody(botReportSchema),
    deps.reportController.submitFromBot
  );

  return router;
};
