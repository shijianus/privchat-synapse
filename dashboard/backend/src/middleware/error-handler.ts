import { NextFunction, Request, Response } from 'express';

import { HttpError } from '../utils/http-error';
import { logger } from '../utils/logger';

/**
 * 统一错误处理中间件，将异常转换成一致的 JSON 响应
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const errorHandler = (
  error: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  const status = error instanceof HttpError ? error.statusCode : 500;
  const payload = {
    message: error.message,
    details: error instanceof HttpError ? error.details : undefined,
  };

  if (status >= 500) {
    logger.error('内部错误: %s', error.stack || error.message);
  }

  res.status(status).json(payload);
};
