import dotenv from 'dotenv';

dotenv.config();

/**
 * 负责加载和校验服务运行时所需的环境参数
 */
export interface AppConfig {
  readonly env: string;
  readonly port: number;
  readonly logLevel: string;
  readonly jwtSecret: string;
  readonly jwtRefreshSecret: string;
  readonly botApiSecret: string;
  readonly accessTokenTtlSeconds: number;
  readonly refreshTokenTtlSeconds: number;
  readonly cacheTtlSeconds: number;
  readonly redisUserEventsChannel: string;
  readonly database: {
    readonly host: string;
    readonly port: number;
    readonly name: string;
    readonly user: string;
    readonly password: string;
    readonly maxConnections: number;
  };
  readonly redis: {
    readonly host: string;
    readonly port: number;
    readonly password?: string;
  };
}

const toNumber = (value: string | undefined, fallback: number): number => {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const env = (process.env.NODE_ENV || 'development').toLowerCase();

export const config: AppConfig = {
  env,
  port: toNumber(process.env.PORT, 3100),
  logLevel: process.env.LOG_LEVEL || 'info',
  jwtSecret: process.env.JWT_SECRET || 'change-me',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || 'change-me-too',
  botApiSecret: process.env.BOT_API_SECRET || 'matrix-bot-secret',
  accessTokenTtlSeconds: toNumber(process.env.JWT_ACCESS_TTL_SECONDS, 900),
  refreshTokenTtlSeconds: toNumber(process.env.JWT_REFRESH_TTL_SECONDS, 604800),
  cacheTtlSeconds: toNumber(process.env.DASHBOARD_CACHE_TTL_SECONDS, 300),
  redisUserEventsChannel: process.env.REDIS_USER_EVENTS_CHANNEL || 'dashboard.user_events',
  database: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: toNumber(process.env.DB_PORT, 5432),
    name: process.env.DB_NAME || 'synapse',
    user: process.env.DB_USER || 'synapse',
    password: process.env.DB_PASSWORD || '',
    maxConnections: toNumber(process.env.DB_MAX_CONNECTIONS, 20),
  },
  redis: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: toNumber(process.env.REDIS_PORT, 6379),
    password: process.env.REDIS_PASSWORD,
  },
};
