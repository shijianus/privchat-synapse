import { createLogger, format, transports } from 'winston';

import { config } from '../config/env';

/**
 * 提供统一的 Winston 日志记录器，方便在服务内共享
 */
export const logger = createLogger({
  level: config.logLevel,
  format: format.combine(
    format.timestamp(),
    format.errors({ stack: true }),
    format.splat(),
    format.json()
  ),
  transports: [
    new transports.Console({
      format: format.combine(format.colorize(), format.simple()),
    }),
  ],
});

/**
 * 允许将 morgan 的输出直接写入日志
 */
export const httpLogStream = {
  write: (message: string): void => {
    logger.info(message.trim());
  },
};
