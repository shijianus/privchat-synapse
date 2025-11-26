import { Pool, PoolClient } from 'pg';
import { logger } from '../utils/logger';
import { config } from '../config/env';

export class DatabaseService {
  private pool: Pool;

  constructor() {
    this.pool = new Pool({
      connectionString: config.database.url,
      ssl: config.database.ssl ? { rejectUnauthorized: false } : false,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    // 监听连接事件
    this.pool.on('connect', () => {
      logger.debug('数据库连接已建立');
    });

    this.pool.on('error', (err) => {
      logger.error('数据库连接错误:', err);
    });
  }

  /**
   * 初始化数据库连接
   */
  async init(): Promise<void> {
    try {
      // 测试连接
      const client = await this.pool.connect();
      await client.query('SELECT NOW()');
      client.release();

      // 创建必要的扩展
      await this.createExtensions();

      logger.info('数据库服务初始化成功');
    } catch (error) {
      logger.error('数据库服务初始化失败:', error);
      throw error;
    }
  }

  /**
   * 执行查询
   */
  async query(text: string, params?: any[]): Promise<any> {
    const start = Date.now();
    try {
      const result = await this.pool.query(text, params);
      const duration = Date.now() - start;

      if (config.logLevel === 'debug') {
        logger.debug('数据库查询执行时间: %d ms', duration);
      }

      return result;
    } catch (error) {
      logger.error('数据库查询失败: %s', error.message);
      throw error;
    }
  }

  /**
   * 获取事务客户端
   */
  async getClient(): Promise<PoolClient> {
    return await this.pool.connect();
  }

  /**
   * 执行事务
   */
  async transaction<T>(
    callback: (client: PoolClient) => Promise<T>
  ): Promise<T> {
    const client = await this.getClient();

    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * 创建必要的扩展
   */
  private async createExtensions(): Promise<void> {
    const extensions = [
      'uuid-ossp',
      'pg_trgm',
      'btree_gin',
    ];

    for (const extension of extensions) {
      try {
        await this.query(`CREATE EXTENSION IF NOT EXISTS "${extension}"`);
        logger.debug('数据库扩展已创建: %s', extension);
      } catch (error) {
        logger.warn('创建数据库扩展失败 %s:', extension, error);
      }
    }
  }

  /**
   * 检查数据库健康状态
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.query('SELECT 1');
      return true;
    } catch (error) {
      logger.error('数据库健康检查失败:', error);
      return false;
    }
  }

  /**
   * 获取连接池状态
   */
  getPoolStatus() {
    return {
      totalCount: this.pool.totalCount,
      idleCount: this.pool.idleCount,
      waitingCount: this.pool.waitingCount,
    };
  }

  /**
   * 关闭数据库连接
   */
  async disconnect(): Promise<void> {
    try {
      await this.pool.end();
      logger.info('数据库连接池已关闭');
    } catch (error) {
      logger.error('关闭数据库连接失败:', error);
      throw error;
    }
  }
}