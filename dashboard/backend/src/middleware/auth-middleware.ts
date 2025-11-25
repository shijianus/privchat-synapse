import { NextFunction, Request, Response } from 'express';
import jwt, { JwtPayload } from 'jsonwebtoken';

import { config } from '../config/env';
import { AuthenticatedUser } from '../types/auth';
import { HttpError } from '../utils/http-error';

const decodeAccessToken = (token: string): AuthenticatedUser => {
  const payload = jwt.verify(token, config.jwtSecret) as JwtPayload & Partial<AuthenticatedUser>;
  const id = payload.sub || payload.id;

  if (!id) {
    throw new HttpError(401, 'JWT 缺少管理员标识');
  }

  const roles = Array.isArray(payload.roles) ? payload.roles : [];
  const permissions = Array.isArray(payload.permissions) ? payload.permissions : [];

  return {
    id: id.toString(),
    roles,
    permissions,
  };
};

/**
 * 校验管理员 JWT，确保只允许认证用户访问 API。
 */
export const authMiddleware = (req: Request, _res: Response, next: NextFunction): void => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    next(new HttpError(401, '缺少认证信息'));
    return;
  }

  const token = header.replace('Bearer ', '').trim();
  try {
    req.user = decodeAccessToken(token);
    next();
  } catch (error) {
    next(error as Error);
  }
};

/**
 * 可选 JWT 校验：若未提供 Authorization 头则直接放行。
 */
export const optionalAuthMiddleware = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  const header = req.headers.authorization;
  if (!header) {
    next();
    return;
  }

  if (!header.startsWith('Bearer ')) {
    next(new HttpError(401, '认证头格式错误'));
    return;
  }

  const token = header.replace('Bearer ', '').trim();
  try {
    req.user = decodeAccessToken(token);
    next();
  } catch (error) {
    next(error as Error);
  }
};
