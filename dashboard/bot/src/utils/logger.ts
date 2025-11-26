import winston from 'winston';
import { config } from '../config/env';

// 自定义日志格式
const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss.SSS',
  }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  config.logFormat === 'json'
    ? winston.format.json()
    : winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
);

// 创建 Winston logger
const winstonLogger = winston.createLogger({
  level: config.logLevel,
  format: logFormat,
  defaultMeta: {
    service: 'matrix-dashboard-bot',
    environment: config.env,
  },
  transports: [
    // 控制台输出
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),

    // 错误日志文件
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),

    // 组合日志文件
    new winston.transports.File({
      filename: 'logs/combined.log',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
  ],

  // 在非生产环境添加额外的调试信息
  silent: config.env === 'test',
});

// 确保日志目录存在
import { existsSync, mkdirSync } from 'fs';
const logDir = 'logs';
if (!existsSync(logDir)) {
  mkdirSync(logDir, { recursive: true });
}

// 包装 logger 以提供更好的类型安全
export const logger = {
  error: (message: string, ...args: any[]) => {
    winstonLogger.error(message, ...args);
  },
  warn: (message: string, ...args: any[]) => {
    winstonLogger.warn(message, ...args);
  },
  info: (message: string, ...args: any[]) => {
    winstonLogger.info(message, ...args);
  },
  debug: (message: string, ...args: any[]) => {
    winstonLogger.debug(message, ...args);
  },
  verbose: (message: string, ...args: any[]) => {
    winstonLogger.verbose(message, ...args);
  },
  silly: (message: string, ...args: any[]) => {
    winstonLogger.silly(message, ...args);
  },
};