import dotenv from 'dotenv';
import Joi from 'joi';

dotenv.config();

const envSchema = Joi.object({
  // 服务配置
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().default(3002),
  HOST: Joi.string().default('0.0.0.0'),

  // Matrix 配置
  MATRIX_BOT_USERNAME: Joi.string().required(),
  MATRIX_BOT_PASSWORD: Joi.string().optional().allow(''),
  MATRIX_BOT_ACCESS_TOKEN: Joi.string().optional().allow(''),
  MATRIX_BOT_HOMESERVER: Joi.string().required(),
  MATRIX_BOT_DISPLAY_NAME: Joi.string().default('申诉助理'),
  MATRIX_BOT_AVATAR_URL: Joi.string().optional(),
  MATRIX_BOT_STORAGE_PATH: Joi.string().default('data/matrix-bot.json'),

  // Dashboard API 配置
  DASHBOARD_API_BASE_URL: Joi.string().uri().default('http://127.0.0.1:3001'),
  BOT_API_SECRET: Joi.string().min(16).required(),

  // 数据库配置 (与主 API 共享)
  DATABASE_URL: Joi.string().required(),
  DATABASE_SSL: Joi.boolean().default(true),

  // Redis 配置 (与主 API 共享)
  REDIS_URL: Joi.string().required(),
  REDIS_PASSWORD: Joi.string().optional(),

  // 安全配置
  JWT_SECRET: Joi.string().required(),
  CORS_ORIGINS: Joi.string().default('http://localhost:3000,http://localhost:3001'),

  // 业务配置
  APPEAL_ROOM_PREFIX: Joi.string().default('appeal_'),
  VERIFICATION_ROOM_PREFIX: Joi.string().default('verify_'),
  BOT_ADMIN_ROOM_ID: Joi.string().required(),
  SHADOW_ROOM_PREFIX: Joi.string().default('shadow_'),
  SHADOW_ROOM_NAME_PREFIX: Joi.string().default('频道 | '),
  SHADOW_ROOM_TOPIC_TEMPLATE: Joi.string().default('频道 %key% 的系统广播'),

  // 缓存配置
  CACHE_TTL_SECONDS: Joi.number().default(300),

  // 日志配置
  LOG_LEVEL: Joi.string().valid('error', 'warn', 'info', 'debug').default('info'),
  LOG_FORMAT: Joi.string().valid('json', 'simple').default('json'),
}).unknown(true);

const { error, value: envVars } = envSchema.validate(process.env);

if (error) {
  throw new Error(`配置验证失败: ${error.message}`);
}

// 自定义验证：确保密码和访问令牌至少有一个
if ((!envVars.MATRIX_BOT_PASSWORD || envVars.MATRIX_BOT_PASSWORD.trim() === '') && (!envVars.MATRIX_BOT_ACCESS_TOKEN || envVars.MATRIX_BOT_ACCESS_TOKEN.trim() === '')) {
  throw new Error('配置验证失败: 必须提供 MATRIX_BOT_PASSWORD 或 MATRIX_BOT_ACCESS_TOKEN 中的至少一个');
}

export const config = {
  env: envVars.NODE_ENV,
  port: envVars.PORT,
  host: envVars.HOST,

  // Matrix 配置
  matrix: {
    username: envVars.MATRIX_BOT_USERNAME,
    password: envVars.MATRIX_BOT_PASSWORD,
    accessToken: envVars.MATRIX_BOT_ACCESS_TOKEN,
    homeserver: envVars.MATRIX_BOT_HOMESERVER,
    displayName: envVars.MATRIX_BOT_DISPLAY_NAME,
    avatarUrl: envVars.MATRIX_BOT_AVATAR_URL,
    storagePath: envVars.MATRIX_BOT_STORAGE_PATH,
  },

  dashboardApiBaseUrl: envVars.DASHBOARD_API_BASE_URL,
  botApiSecret: envVars.BOT_API_SECRET,
  botIdentity: envVars.MATRIX_BOT_USERNAME,

  // 数据库配置
  database: {
    url: envVars.DATABASE_URL,
    ssl: envVars.DATABASE_SSL,
  },

  // Redis 配置
  redis: {
    url: envVars.REDIS_URL,
    password: envVars.REDIS_PASSWORD,
  },

  // 安全配置
  jwtSecret: envVars.JWT_SECRET,
  corsOrigins: envVars.CORS_ORIGINS.split(','),

  // 业务配置
  appealRoomPrefix: envVars.APPEAL_ROOM_PREFIX,
  verificationRoomPrefix: envVars.VERIFICATION_ROOM_PREFIX,
  botAdminRoomId: envVars.BOT_ADMIN_ROOM_ID,
  shadowRoom: {
    prefix: envVars.SHADOW_ROOM_PREFIX,
    namePrefix: envVars.SHADOW_ROOM_NAME_PREFIX,
    topicTemplate: envVars.SHADOW_ROOM_TOPIC_TEMPLATE,
  },

  // 缓存配置
  cacheTtlSeconds: envVars.CACHE_TTL_SECONDS,

  // 日志配置
  logLevel: envVars.LOG_LEVEL,
  logFormat: envVars.LOG_FORMAT,
} as const;
