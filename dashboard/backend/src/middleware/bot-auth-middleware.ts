import { NextFunction, Request, Response } from 'express';
import jwt, { JwtPayload } from 'jsonwebtoken';

import { config } from '../config/env';
import { MatrixBotIdentity } from '../types/auth';
import { HttpError } from '../utils/http-error';

const decodeBotToken = (token: string): MatrixBotIdentity => {
  const secret = config.botApiSecret;
  if (!secret) {
    throw new HttpError(500, 'Bot API secret 尚未配置');
  }

  const payload = jwt.verify(token, secret) as JwtPayload & Partial<MatrixBotIdentity>;
  const id = payload.sub || payload.id;
  if (!id) {
    throw new HttpError(401, '无效的 Bot 令牌');
  }

  return {
    id: id.toString(),
    name: payload.name,
    scopes: Array.isArray(payload.scopes) ? payload.scopes : undefined,
  };
};

/**
 * Matrix 机器人专用认证中间件，要求携带独立的 JWT 令�? */
export const botAuthMiddleware = (req: Request, _res: Response, next: NextFunction): void => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    next(new HttpError(401, '缺少 Bot 认证信息'));
    return;
  }

  try {
    req.bot = decodeBotToken(header.replace('Bearer ', '').trim());
    next();
  } catch (error) {
    next(error as Error);
  }
};
