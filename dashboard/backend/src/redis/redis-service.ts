import Redis, { RedisOptions } from 'ioredis';

import { config } from '../config/env';
import { logger } from '../utils/logger';

/**
 * Redis 连接封装，负责缓存与 Pub/Sub 服务
 */
export class RedisService {
  private publisher?: Redis;
  private subscriber?: Redis;

  async init(): Promise<void> {
    if (this.publisher && this.subscriber) {
      return;
    }

    const options: RedisOptions = {
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password || undefined,
      enableAutoPipelining: true,
      maxRetriesPerRequest: 3,
      retryStrategy: (attempt) => Math.min(attempt * 100, 1_000),
    };

    this.publisher = new Redis(options);
    this.subscriber = new Redis(options);

    this.publisher.on('error', (error) => {
      logger.error('Redis 发布通道错误: %s', error.message);
    });
    this.subscriber.on('error', (error) => {
      logger.error('Redis 订阅通道错误: %s', error.message);
    });
  }

  /**
   * 将任意对象以 JSON 格式缓存一段时间
   */
  async cacheJson(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    const client = this.ensurePublisher();
    await client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  }

  /**
   * 读取 JSON 缓存并解析返回
   */
  async readJson<T>(key: string): Promise<T | null> {
    const client = this.ensurePublisher();
    const raw = await client.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  }

  /**
   * 发布消息用于通知 Synapse 或其他进程
   */
  async publish(channel: string, payload: unknown): Promise<number> {
    const client = this.ensurePublisher();
    return client.publish(channel, JSON.stringify(payload));
  }

  /**
   * 删除缓存，保证后续请求能重新加载
   */
  async deleteKey(key: string): Promise<void> {
    const client = this.ensurePublisher();
    await client.del(key);
  }

  /**
   * 订阅指定频道，实时处理消息
   */
  async subscribe(channel: string, handler: (message: unknown) => void): Promise<void> {
    const client = this.ensureSubscriber();
    await client.subscribe(channel);
    client.on('message', (incomingChannel, message) => {
      if (incomingChannel !== channel) {
        return;
      }

      try {
        handler(JSON.parse(message));
      } catch (error) {
        logger.warn('处理 Redis 消息失败: %s', (error as Error).message);
      }
    });
  }

  private ensurePublisher(): Redis {
    if (!this.publisher) {
      throw new Error('Redis 发布连接尚未初始化');
    }
    return this.publisher;
  }

  private ensureSubscriber(): Redis {
    if (!this.subscriber) {
      throw new Error('Redis 订阅连接尚未初始化');
    }
    return this.subscriber;
  }
}
