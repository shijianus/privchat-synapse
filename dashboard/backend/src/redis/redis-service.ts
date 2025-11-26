import Redis, { RedisOptions } from 'ioredis';

import { config } from '../config/env';
import { logger } from '../utils/logger';

/**
 * Thin wrapper around ioredis that offers shared helpers for caching, pub/sub,
 * and authentication related operations.
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
      logger.error('Redis publish connection failed: %s', error.message);
    });

    this.subscriber.on('error', (error) => {
      logger.error('Redis subscribe connection failed: %s', error.message);
    });
  }

  /**
   * Store a JSON payload with the supplied TTL.
   */
  async cacheJson(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    const client = this.ensurePublisher();
    await client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  }

  /**
   * Read the cached JSON payload and deserialize it.
   */
  async readJson<T>(key: string): Promise<T | null> {
    const client = this.ensurePublisher();
    const raw = await client.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  }

  /**
   * Publish serialized payloads for cache invalidation events.
   */
  async publish(channel: string, payload: unknown): Promise<number> {
    const client = this.ensurePublisher();
    return client.publish(channel, JSON.stringify(payload));
  }

  /**
   * Remove the specified key from Redis.
   */
  async deleteKey(key: string): Promise<void> {
    const client = this.ensurePublisher();
    await client.del(key);
  }

  /**
   * Store a plain string value optionally with a TTL.
   */
  async setValue(key: string, value: string, ttlSeconds?: number): Promise<void> {
    const client = this.ensurePublisher();
    if (ttlSeconds && ttlSeconds > 0) {
      await client.set(key, value, 'EX', ttlSeconds);
      return;
    }
    await client.set(key, value);
  }

  /**
   * Read a plain string value.
   */
  async getValue(key: string): Promise<string | null> {
    const client = this.ensurePublisher();
    return client.get(key);
  }

  /**
   * Increment a counter and return the new value.
   */
  async increment(key: string): Promise<number> {
    const client = this.ensurePublisher();
    return client.incr(key);
  }

  /**
   * Apply a TTL to an existing key.
   */
  async expire(key: string, ttlSeconds: number): Promise<void> {
    const client = this.ensurePublisher();
    await client.expire(key, ttlSeconds);
  }

  /**
   * Subscribe to a channel and forward parsed messages to a handler.
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
        logger.warn('Failed to parse Redis message: %s', (error as Error).message);
      }
    });
  }

  /**
   * 对 Redis 执行一次 PING 检查
   */
  async ping(): Promise<string> {
    const client = this.ensurePublisher();
    return client.ping();
  }

  private ensurePublisher(): Redis {
    if (!this.publisher) {
      throw new Error('Redis publisher connection has not been initialised');
    }
    return this.publisher;
  }

  private ensureSubscriber(): Redis {
    if (!this.subscriber) {
      throw new Error('Redis subscriber connection has not been initialised');
    }
    return this.subscriber;
  }
}
