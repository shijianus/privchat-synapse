import { DatabaseService } from './database-service';
import { RedisService } from './redis-service';
import { logger } from '../utils/logger';
import { randomBytes } from 'crypto';

export interface VerificationRequest {
  userId: string;
  synapseUserId: string;
  friendCode: string;
  expiresAt: Date;
  createdAt: Date;
}

export interface VerificationResult {
  success: boolean;
  message: string;
  verificationCode?: string;
}

export class FriendVerificationService {
  private readonly CODE_LENGTH = 8;
  private readonly EXPIRE_MINUTES = 30;

  constructor(
    private databaseService: DatabaseService,
    private redisService: RedisService
  ) {}

  /**
   * 生成朋友验证码
   */
  async generateVerificationCode(userId: string, synapseUserId: string): Promise<VerificationResult> {
    try {
      const verificationCode = this.generateSecureCode();
      const expiresAt = new Date(Date.now() + this.EXPIRE_MINUTES * 60 * 1000);

      // 检查是否有未完成的验证
      const existingRequest = await this.getPendingRequest(userId);
      if (existingRequest) {
        return {
          success: false,
          message: '您已有待处理的验证请求，请等待处理完成或过期后重试',
        };
      }

      // 存储验证请求
      await this.storeVerificationRequest({
        userId,
        synapseUserId,
        friendCode: verificationCode,
        expiresAt,
        createdAt: new Date(),
      });

      logger.info('朋友验证码已生成: %s for user %s', verificationCode, synapseUserId);

      return {
        success: true,
        message: '验证码已生成，将通过 Matrix 发送给您的朋友',
        verificationCode,
      };
    } catch (error) {
      logger.error('生成验证码失败:', error);
      return {
        success: false,
        message: '生成验证码失败，请稍后重试',
      };
    }
  }

  /**
   * 验证朋友码
   */
  async verifyFriendCode(userId: string, providedCode: string): Promise<VerificationResult> {
    try {
      const request = await this.getPendingRequest(userId);
      if (!request) {
        return {
          success: false,
          message: '未找到待验证的请求或验证码已过期',
        };
      }

      // 检查是否过期
      if (new Date() > request.expiresAt) {
        await this.cleanupExpiredRequest(userId);
        return {
          success: false,
          message: '验证码已过期，请重新申请',
        };
      }

      // 验证码匹配
      if (providedCode !== request.friendCode) {
        // 记录失败尝试
        await this.recordFailedAttempt(userId);
        return {
          success: false,
          message: '验证码错误，请检查后重试',
        };
      }

      // 验证成功，更新用户状态
      await this.markVerificationSuccess(userId);

      // 清理验证请求
      await this.cleanupExpiredRequest(userId);

      logger.info('朋友验证成功: %s', userId);

      return {
        success: true,
        message: '朋友验证成功！您现在可以正常使用系统功能',
      };
    } catch (error) {
      logger.error('验证朋友码失败:', error);
      return {
        success: false,
        message: '验证过程中发生错误，请稍后重试',
      };
    }
  }

  /**
   * 获取待处理的验证请求
   */
  async getPendingRequest(userId: string): Promise<VerificationRequest | null> {
    try {
      // 先检查 Redis 缓存
      const cacheKey = `friend_verification:${userId}`;
      const cached = await this.redisService.get(cacheKey);

      if (cached) {
        const request = JSON.parse(cached);
        // 检查是否过期
        if (new Date() <= new Date(request.expiresAt)) {
          return request;
        }
        // 已过期，清理缓存
        await this.redisService.del(cacheKey);
        return null;
      }

      // 从数据库查询
      const query = `
        SELECT
          user_id,
          synapse_user_id,
          friend_code,
          expires_at,
          created_at
        FROM dashboard.friend_verifications
        WHERE user_id = $1
          AND is_verified = false
          AND expires_at > CURRENT_TIMESTAMP
        ORDER BY created_at DESC
        LIMIT 1
      `;

      const result = await this.databaseService.query(query, [userId]);

      if (result.rows.length === 0) {
        return null;
      }

      const request = {
        userId: result.rows[0].user_id,
        synapseUserId: result.rows[0].synapse_user_id,
        friendCode: result.rows[0].friend_code,
        expiresAt: result.rows[0].expires_at,
        createdAt: result.rows[0].created_at,
      };

      // 缓存结果
      const ttl = Math.floor((new Date(request.expiresAt).getTime() - Date.now()) / 1000);
      if (ttl > 0) {
        await this.redisService.setex(cacheKey, ttl, JSON.stringify(request));
      }

      return request;
    } catch (error) {
      logger.error('获取待处理验证请求失败:', error);
      return null;
    }
  }

  /**
   * 存储验证请求
   */
  private async storeVerificationRequest(request: VerificationRequest): Promise<void> {
    try {
      const query = `
        INSERT INTO dashboard.friend_verifications (
          user_id, synapse_user_id, friend_code, expires_at, created_at
        ) VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (user_id)
        DO UPDATE SET
          friend_code = EXCLUDED.friend_code,
          expires_at = EXCLUDED.expires_at,
          created_at = EXCLUDED.created_at
      `;

      await this.databaseService.query(query, [
        request.userId,
        request.synapseUserId,
        request.friendCode,
        request.expiresAt,
        request.createdAt,
      ]);

      // 缓存到 Redis
      const cacheKey = `friend_verification:${request.userId}`;
      const ttl = this.EXPIRE_MINUTES * 60;
      await this.redisService.setex(cacheKey, ttl, JSON.stringify(request));
    } catch (error) {
      logger.error('存储验证请求失败:', error);
      throw error;
    }
  }

  /**
   * 标记验证成功
   */
  private async markVerificationSuccess(userId: string): Promise<void> {
    try {
      const query = `
        UPDATE dashboard.friend_verifications
        SET
          is_verified = true,
          verified_at = CURRENT_TIMESTAMP
        WHERE user_id = $1
          AND is_verified = false
      `;

      await this.databaseService.query(query, [userId]);

      // 更新用户档案状态
      await this.updateUserVerificationStatus(userId);

      // 清除缓存
      await this.redisService.del(`friend_verification:${userId}`);
    } catch (error) {
      logger.error('标记验证成功失败:', error);
      throw error;
    }
  }

  /**
   * 更新用户验证状态
   */
  private async updateUserVerificationStatus(userId: string): Promise<void> {
    try {
      const query = `
        UPDATE dashboard.user_profiles
        SET
          friend_verified = true,
          friend_verified_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `;

      await this.databaseService.query(query, [userId]);
    } catch (error) {
      logger.error('更新用户验证状态失败:', error);
      throw error;
    }
  }

  /**
   * 记录失败尝试
   */
  private async recordFailedAttempt(userId: string): Promise<void> {
    try {
      const failKey = `friend_verification_fail:${userId}`;
      const currentAttempts = await this.redisService.incr(failKey);

      // 设置过期时间为1小时
      if (currentAttempts === 1) {
        await this.redisService.expire(failKey, 3600);
      }

      // 如果失败次数过多，可以在这里添加限制逻辑
      if (currentAttempts >= 5) {
        logger.warn('用户 %s 朋友验证失败次数过多: %d', userId, currentAttempts);
      }
    } catch (error) {
      logger.error('记录验证失败尝试失败:', error);
    }
  }

  /**
   * 清理过期请求
   */
  private async cleanupExpiredRequest(userId: string): Promise<void> {
    try {
      await this.databaseService.query(`
        DELETE FROM dashboard.friend_verifications
        WHERE user_id = $1
          AND is_verified = false
          AND expires_at <= CURRENT_TIMESTAMP
      `, [userId]);

      await this.redisService.del(`friend_verification:${userId}`);
    } catch (error) {
      logger.error('清理过期验证请求失败:', error);
    }
  }

  /**
   * 生成安全验证码
   */
  private generateSecureCode(): string {
    // 生成8位数字验证码
    const bytes = randomBytes(4);
    const code = bytes.readUInt32BE(0) % 100000000;
    return code.toString().padStart(8, '0');
  }

  /**
   * 定期清理过期数据
   */
  async cleanupExpiredData(): Promise<void> {
    try {
      await this.databaseService.query(`
        DELETE FROM dashboard.friend_verifications
        WHERE is_verified = false
          AND expires_at <= CURRENT_TIMESTAMP - INTERVAL '1 day'
      `);

      logger.info('过期朋友验证数据清理完成');
    } catch (error) {
      logger.error('清理过期朋友验证数据失败:', error);
    }
  }

  /**
   * 获取用户验证状态
   */
  async getVerificationStatus(userId: string): Promise<{
    isVerified: boolean;
    verifiedAt?: Date;
    pendingRequest?: boolean;
  }> {
    try {
      // 检查是否已验证
      const verifiedQuery = `
        SELECT friend_verified, friend_verified_at
        FROM dashboard.user_profiles
        WHERE id = $1
      `;

      const verifiedResult = await this.databaseService.query(verifiedQuery, [userId]);

      if (verifiedResult.rows.length > 0 && verifiedResult.rows[0].friend_verified) {
        return {
          isVerified: true,
          verifiedAt: verifiedResult.rows[0].friend_verified_at,
        };
      }

      // 检查是否有待处理请求
      const pendingRequest = await this.getPendingRequest(userId);

      return {
        isVerified: false,
        pendingRequest: !!pendingRequest,
      };
    } catch (error) {
      logger.error('获取用户验证状态失败:', error);
      return {
        isVerified: false,
        pendingRequest: false,
      };
    }
  }
}