import 'express';

import { AuthenticatedUser } from './auth';

declare global {
  namespace Express {
    /**
     * 扩展请求对象以便携带管理员身份
     */
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export {};
