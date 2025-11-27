import { Pool, PoolClient, PoolConfig, QueryResultRow } from 'pg';

import { config } from '../config/env';
import { logger } from '../utils/logger';

/**
 * PostgreSQL 连接池封装，负责提供统一的数据库访问能力
 */
export class DatabaseService {
  private pool?: Pool;

  /**
   * 初始化连接池，确保只创建一次
   */
  async init(): Promise<void> {
    if (this.pool) {
      return;
    }

    const poolConfig: PoolConfig = {
      host: config.database.host,
      port: config.database.port,
      database: config.database.name,
      user: config.database.user,
      password: config.database.password,
      max: config.database.maxConnections,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 2_000,
    };

    this.pool = new Pool(poolConfig);

    this.pool.on('error', (error) => {
      logger.error('数据库连接池出现错误: %s', error.message);
    });
  }

  /**
   * 执行单次查询并返回全部结果
   */
  async query<T extends QueryResultRow>(sql: string, params: unknown[] = []): Promise<T[]> {
    const pool = this.ensurePool();
    const client = await pool.connect();

    try {
      const result = await client.query<T>(sql, params);
      return result.rows;
    } finally {
      client.release();
    }
  }

  /**
   * 在事务上下文中执行自定义逻辑
   */
  async withTransaction<T>(handler: (client: PoolClient) => Promise<T>): Promise<T> {
    const pool = this.ensurePool();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      const result = await handler(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('事务执行失败: %s', (error as Error).message);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * 允许调用方直接复用事务中的 client
   */
  async queryWithClient<T extends QueryResultRow>(
    client: PoolClient,
    sql: string,
    params: unknown[] = []
  ): Promise<T[]> {
    const result = await client.query<T>(sql, params);
    return result.rows;
  }

  private ensurePool(): Pool {
    if (!this.pool) {
      throw new Error('DatabaseService 尚未初始化');
    }
    return this.pool;
  }
}
