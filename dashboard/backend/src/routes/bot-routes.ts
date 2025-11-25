import { Router } from 'express';

import { AppealController } from '../controllers/appeal-controller';
import { botAuthMiddleware } from '../middleware/bot-auth-middleware';
import { validateBody, validateParams } from '../middleware/validate-request';
import {
  appealIdParamSchema,
  botMessageSchema,
  botSubmitAppealSchema,
} from '../validators/appeal-validators';

export interface BotRouteDependencies {
  readonly appealController: AppealController;
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

  return router;
};
