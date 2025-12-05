import dotenv from 'dotenv';

dotenv.config();

/**
 * 负责加载和校验服务运行时所需的环境参数
 */
export interface AppConfig {
  readonly env: string;
  readonly port: number;
  readonly host: string;
  readonly logLevel: string;
  readonly corsOrigins: readonly string[];
  readonly jwtSecret: string;
  readonly jwtRefreshSecret: string;
  readonly botApiSecret: string;
  readonly accessTokenTtlSeconds: number;
  readonly refreshTokenTtlSeconds: number;
  readonly cacheTtlSeconds: number;
  readonly redisUserEventsChannel: string;
  readonly botServiceBaseUrl: string;
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
  readonly synapse: {
    readonly adminBaseUrl: string;
    readonly adminAccessToken: string;
    readonly serverName: string;
    readonly defaultRooms: readonly string[];
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
const DEFAULT_BIND_HOST = '127.0.0.1';

type ParsedDbUrl = {
  host: string;
  port: number;
  name: string;
  user: string;
  password: string;
};

type ParsedRedisUrl = {
  host: string;
  port: number;
  password?: string;
};

const parseDatabaseUrl = (value?: string): ParsedDbUrl | undefined => {
  if (!value) {
    return undefined;
  }

  try {
    const url = new URL(value);
    if (!url.hostname || !url.pathname) {
      return undefined;
    }
    return {
      host: url.hostname,
      port: Number(url.port || 5432),
      name: url.pathname.replace(/^\//, ''),
      user: decodeURIComponent(url.username || 'synapse'),
      password: decodeURIComponent(url.password || ''),
    };
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('DATABASE_URL 解析失败, fallback 到单独的 DB_* 变量: %s', (error as Error).message);
    return undefined;
  }
};

const parseRedisUrl = (value?: string): ParsedRedisUrl | undefined => {
  if (!value) {
    return undefined;
  }

  try {
    const url = new URL(value);
    if (!url.hostname) {
      return undefined;
    }
    return {
      host: url.hostname,
      port: Number(url.port || 6379),
      password: url.password ? decodeURIComponent(url.password) : undefined,
    };
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('REDIS_URL 解析失败, fallback 到单独的 REDIS_* 变量: %s', (error as Error).message);
    return undefined;
  }
};

const dbFromUrl = parseDatabaseUrl(process.env.DATABASE_URL);
const redisFromUrl = parseRedisUrl(process.env.REDIS_URL);
const parseList = (value?: string): string[] =>
  (value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

export const config: AppConfig = {
  env,
  port: toNumber(process.env.PORT, 3001),
  host: process.env.DASHBOARD_HOST || DEFAULT_BIND_HOST,
  logLevel: process.env.LOG_LEVEL || 'info',
  // 允许的 CORS 来源列表，多个以逗号分隔
  corsOrigins: (
    process.env.CORS_ORIGINS ||
    'http://localhost:3000,http://localhost:3001,http://localhost:5173,http://127.0.0.1:5173'
  )
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  jwtSecret: process.env.JWT_SECRET || 'change-me',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || 'change-me-too',
  botApiSecret: process.env.BOT_API_SECRET || 'matrix-bot-secret',
  accessTokenTtlSeconds: toNumber(process.env.JWT_ACCESS_TTL_SECONDS, 900),
  refreshTokenTtlSeconds: toNumber(process.env.JWT_REFRESH_TTL_SECONDS, 604800),
  cacheTtlSeconds: toNumber(process.env.DASHBOARD_CACHE_TTL_SECONDS, 300),
  botServiceBaseUrl: process.env.BOT_SERVICE_BASE_URL || 'http://127.0.0.1:3002',
  redisUserEventsChannel: process.env.REDIS_USER_EVENTS_CHANNEL || 'dashboard.user_events',
  database: {
    host: dbFromUrl?.host || process.env.DB_HOST || process.env.POSTGRES_HOST || '127.0.0.1',
    port: dbFromUrl?.port || toNumber(process.env.DB_PORT, toNumber(process.env.POSTGRES_PORT, 5432)),
    name: dbFromUrl?.name || process.env.DB_NAME || process.env.POSTGRES_DB || 'synapse',
    user: dbFromUrl?.user || process.env.DB_USER || process.env.POSTGRES_USER || 'synapse',
    password: dbFromUrl?.password || process.env.DB_PASSWORD || process.env.POSTGRES_PASSWORD || '',
    maxConnections: toNumber(process.env.DB_MAX_CONNECTIONS, 20),
  },
  redis: {
    host: redisFromUrl?.host || process.env.REDIS_HOST || '127.0.0.1',
    port: redisFromUrl?.port || toNumber(process.env.REDIS_PORT, 6379),
    password: redisFromUrl?.password || process.env.REDIS_PASSWORD,
  },
  synapse: {
    adminBaseUrl:
      process.env.SYNAPSE_ADMIN_BASE_URL ||
      'http://127.0.0.1:8008/_synapse/admin/v2',
    adminAccessToken: process.env.SYNAPSE_ADMIN_ACCESS_TOKEN || '',
    serverName: process.env.SYNAPSE_SERVER_NAME || 'localhost',
    defaultRooms: parseList(process.env.SYNAPSE_DEFAULT_ROOMS),
  },
};
