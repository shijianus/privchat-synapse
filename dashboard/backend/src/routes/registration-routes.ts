import { Router } from 'express';

import { RegistrationController } from '../controllers/registration-controller';
import { requirePermissions } from '../middleware/permission-middleware';
import { validateBody, validateParams, validateQuery } from '../middleware/validate-request';
import {
  applicationIdParamSchema,
  blacklistEntryIdParamSchema,
  blacklistEntrySchema,
  listBlacklistQuerySchema,
  listRegistrationsQuerySchema,
  registrationApproveSchema,
  registrationRejectSchema,
} from '../validators/registration-validators';

/**
 * 注册管理与黑名单路由
 */
export const createRegistrationRoutes = (controller: RegistrationController): Router => {
  const router = Router();

  router.get(
    '/registrations',
    requirePermissions('registration:read'),
    validateQuery(listRegistrationsQuerySchema),
    controller.listApplications
  );

  router.post(
    '/registrations/:applicationId/approve',
    requirePermissions('registration:approve'),
    validateParams(applicationIdParamSchema),
    validateBody(registrationApproveSchema),
    controller.approveApplication
  );

  router.post(
    '/registrations/:applicationId/reject',
    requirePermissions('registration:reject'),
    validateParams(applicationIdParamSchema),
    validateBody(registrationRejectSchema),
    controller.rejectApplication
  );

  router.get(
    '/blacklist',
    requirePermissions('registration:read'),
    validateQuery(listBlacklistQuerySchema),
    controller.listBlacklist
  );

  router.post(
    '/blacklist',
    requirePermissions('registration:reject'),
    validateBody(blacklistEntrySchema),
    controller.createBlacklistEntry
  );

  router.delete(
    '/blacklist/:entryId',
    requirePermissions('registration:reject'),
    validateParams(blacklistEntryIdParamSchema),
    controller.deleteBlacklistEntry
  );

  return router;
};
