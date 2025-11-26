import { Router } from 'express';

import { AuthController } from '../controllers/auth-controller';
import { authMiddleware, optionalAuthMiddleware } from '../middleware/auth-middleware';
import { validateBody } from '../middleware/validate-request';
import {
  loginSchema,
  refreshTokenSchema,
  registerAdminSchema,
} from '../validators/auth-validators';
import { twoFactorVerificationSchema } from '../validators/two-factor-validators';

/**
 * 认证相关路由定义。
 */
export const createAuthRoutes = (controller: AuthController): Router => {
  const router = Router();

  router.post(
    '/register-admin',
    optionalAuthMiddleware,
    validateBody(registerAdminSchema),
    controller.registerAdmin
  );

  router.post('/login', validateBody(loginSchema), controller.login);

  router.post('/refresh', validateBody(refreshTokenSchema), controller.refreshToken);

  router.post('/logout', authMiddleware, validateBody(refreshTokenSchema), controller.logout);

  router.post('/verify-2fa', validateBody(twoFactorVerificationSchema), controller.verifyTwoFactor);

  return router;
};
