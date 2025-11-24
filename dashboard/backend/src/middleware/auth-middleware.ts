import { NextFunction, Request, Response } from 'express';
import jwt, { JwtPayload } from 'jsonwebtoken';

import { config } from '../config/env';
import { AuthenticatedUser } from '../types/auth';
import { HttpError } from '../utils/http-error';

/**
 * 校验管理端 JWT，确保只允许认证用户访问 API
 */
export const authMiddleware = (req: Request, _res: Response, next: NextFunction): void => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    next(new HttpError(401, '缺少认证信息'));
    return;
  }

  const token = header.replace('Bearer ', '').trim();
  try {
    const payload = jwt.verify(token, config.jwtSecret) as JwtPayload & Partial<AuthenticatedUser>;
    const id = payload.sub || payload.id;

    if (!id) {
      next(new HttpError(401, 'JWT 缺少管理员标识'));
      return;
    }

    const user: AuthenticatedUser = {
      id,
      roles: payload.roles || [],
      permissions: payload.permissions || [],
    };

    req.user = user;
    next();
  } catch (error) {
    next(new HttpError(401, 'JWT 验证失败', (error as Error).message));
  }
};
