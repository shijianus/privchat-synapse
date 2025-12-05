import Redis from 'ioredis';
import { logger } from '../utils/logger';
import { config } from '../config/env';

export class RedisService {
  private client: Redis;

  constructor() {
    this.client = new Redis(config.redis.url, {
      password: config.redis.password,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });

    // 监听连接事件
    this.client.on('connect', () => {
      logger.debug('Redis 连接已建立');
    });

    this.client.on('ready', () => {
      logger.debug('Redis 连接就绪');
    });

    this.client.on('error', (err) => {
      logger.error('Redis 连接错误:', err);
    });

    this.client.on('close', () => {
      logger.debug('Redis 连接已关闭');
    });
  }

  /**
   * 初始化 Redis 连接
   */
  async init(): Promise<void> {
    try {
      await this.client.connect();
      logger.info('Redis 服务初始化成功');
    } catch (error) {
      logger.error('Redis 服务初始化失败:', error);
      throw error;
    }
  }

  /**
   * 设置键值对
   */
  async set(key: string, value: string): Promise<void> {
    try {
      await this.client.set(key, value);
    } catch (error) {
      logger.error('Redis SET 失败:', error);
      throw error;
    }
  }

  /**
   * 设置带过期时间的键值对
   */
  async setex(key: string, seconds: number, value: string): Promise<void> {
    try {
      await this.client.setex(key, seconds, value);
    } catch (error) {
      logger.error('Redis SETEX 失败:', error);
      throw error;
    }
  }

  /**
   * 获取值
   */
  async get(key: string): Promise<string | null> {
    try {
      return await this.client.get(key);
    } catch (error) {
      logger.error('Redis GET 失败:', error);
      throw error;
    }
  }

  /**
   * 删除键
   */
  async del(key: string): Promise<number> {
    try {
      return await this.client.del(key);
    } catch (error) {
      logger.error('Redis DEL 失败:', error);
      throw error;
    }
  }

  /**
   * 检查键是否存在
   */
  async exists(key: string): Promise<number> {
    try {
      return await this.client.exists(key);
    } catch (error) {
      logger.error('Redis EXISTS 失败:', error);
      throw error;
    }
  }

  /**
   * 设置过期时间
   */
  async expire(key: string, seconds: number): Promise<number> {
    try {
      return await this.client.expire(key, seconds);
    } catch (error) {
      logger.error('Redis EXPIRE 失败:', error);
      throw error;
    }
  }

  /**
   * 获取剩余过期时间
   */
  async ttl(key: string): Promise<number> {
    try {
      return await this.client.ttl(key);
    } catch (error) {
      logger.error('Redis TTL 失败:', error);
      throw error;
    }
  }

  /**
   * 增加数值
   */
  async incr(key: string): Promise<number> {
    try {
      return await this.client.incr(key);
    } catch (error) {
      logger.error('Redis INCR 失败:', error);
      throw error;
    }
  }

  /**
   * 增加指定数值
   */
  async incrby(key: string, increment: number): Promise<number> {
    try {
      return await this.client.incrby(key, increment);
    } catch (error) {
      logger.error('Redis INCRBY 失败:', error);
      throw error;
    }
  }

  /**
   * 向集合添加成员
   */
  async sadd(key: string, ...members: string[]): Promise<number> {
    try {
      return await this.client.sadd(key, ...members);
    } catch (error) {
      logger.error('Redis SADD 失败:', error);
      throw error;
    }
  }

  /**
   * 从集合移除成员
   */
  async srem(key: string, ...members: string[]): Promise<number> {
    try {
      return await this.client.srem(key, ...members);
    } catch (error) {
      logger.error('Redis SREM 失败:', error);
      throw error;
    }
  }

  /**
   * 获取集合所有成员
   */
  async smembers(key: string): Promise<string[]> {
    try {
      return await this.client.smembers(key);
    } catch (error) {
      logger.error('Redis SMEMBERS 失败:', error);
      throw error;
    }
  }

  /**
   * 检查集合中是否存在成员
   */
  async sismember(key: string, member: string): Promise<number> {
    try {
      return await this.client.sismember(key, member);
    } catch (error) {
      logger.error('Redis SISMEMBER 失败:', error);
      throw error;
    }
  }

  /**
   * 发布消息到频道
   */
  async publish(channel: string, message: string): Promise<number> {
    try {
      return await this.client.publish(channel, message);
    } catch (error) {
      logger.error('Redis PUBLISH 失败:', error);
      throw error;
    }
  }

  /**
   * 订阅频道
   */
  async subscribe(channel: string, callback: (channel: string, message: string) => void): Promise<void> {
    try {
      const subscriber = this.client.duplicate();
      await subscriber.connect();

      subscriber.subscribe(channel);
      subscriber.on('message', (channel, message) => {
        callback(channel, message);
      });
    } catch (error) {
      logger.error('Redis SUBSCRIBE 失败:', error);
      throw error;
    }
  }

  /**
   * 哈希表设置字段
   */
  async hset(key: string, field: string, value: string): Promise<number> {
    try {
      return await this.client.hset(key, field, value);
    } catch (error) {
      logger.error('Redis HSET 失败:', error);
      throw error;
    }
  }

  /**
   * 哈希表获取字段
   */
  async hget(key: string, field: string): Promise<string | null> {
    try {
      return await this.client.hget(key, field);
    } catch (error) {
      logger.error('Redis HGET 失败:', error);
      throw error;
    }
  }

  /**
   * 哈希表获取所有字段和值
   */
  async hgetall(key: string): Promise<Record<string, string>> {
    try {
      return await this.client.hgetall(key);
    } catch (error) {
      logger.error('Redis HGETALL 失败:', error);
      throw error;
    }
  }

  /**
   * 哈希表删除字段
   */
  async hdel(key: string, ...fields: string[]): Promise<number> {
    try {
      return await this.client.hdel(key, ...fields);
    } catch (error) {
      logger.error('Redis HDEL 失败:', error);
      throw error;
    }
  }

  /**
   * 列表左侧推入
   */
  async lpush(key: string, ...elements: string[]): Promise<number> {
    try {
      return await this.client.lpush(key, ...elements);
    } catch (error) {
      logger.error('Redis LPUSH 失败:', error);
      throw error;
    }
  }

  /**
   * 列表右侧弹出
   */
  async rpop(key: string): Promise<string | null> {
    try {
      return await this.client.rpop(key);
    } catch (error) {
      logger.error('Redis RPOP 失败:', error);
      throw error;
    }
  }

  /**
   * 获取列表长度
   */
  async llen(key: string): Promise<number> {
    try {
      return await this.client.llen(key);
    } catch (error) {
      logger.error('Redis LLEN 失败:', error);
      throw error;
    }
  }

  /**
   * 获取列表范围内元素
   */
  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    try {
      return await this.client.lrange(key, start, stop);
    } catch (error) {
      logger.error('Redis LRANGE 失败:', error);
      throw error;
    }
  }

  /**
   * 清空所有数据（谨慎使用）
   */
  async flushall(): Promise<string> {
    try {
      return await this.client.flushall();
    } catch (error) {
      logger.error('Redis FLUSHALL 失败:', error);
      throw error;
    }
  }

  /**
   * 检查 Redis 健康状态
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.client.ping();
      return true;
    } catch (error) {
      logger.error('Redis 健康检查失败:', error);
      return false;
    }
  }

  /**
   * 获取 Redis 连接信息
   */
  async getInfo(): Promise<string> {
    try {
      return await this.client.info();
    } catch (error) {
      logger.error('获取 Redis 信息失败:', error);
      throw error;
    }
  }

  /**
   * 关闭 Redis 连接
   */
  async disconnect(): Promise<void> {
    try {
      await this.client.quit();
      logger.info('Redis 连接已关闭');
    } catch (error) {
      logger.error('关闭 Redis 连接失败:', error);
      throw error;
    }
  }
}
