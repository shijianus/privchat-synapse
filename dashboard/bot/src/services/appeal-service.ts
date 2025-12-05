import { DatabaseService } from './database-service';
import { RedisService } from './redis-service';
import { logger } from '../utils/logger';

export interface AppealMessage {
  appealId: string;
  senderId: string;
  message: string;
  timestamp: number;
  isFromUser: boolean;
}

export class AppealService {
  constructor(
    private databaseService: DatabaseService,
    private redisService: RedisService
  ) {}

  /**
   * 记录申诉消息
   */
  async recordMessage(appealId: string, message: AppealMessage): Promise<void> {
    try {
      const query = `
        INSERT INTO dashboard.appeal_messages (appeal_id, sender_id, message, is_from_user, created_at)
        VALUES ($1, $2, $3, $4, to_timestamp($5 / 1000))
        ON CONFLICT (appeal_id, sender_id, created_at) DO NOTHING
      `;

      await this.databaseService.query(query, [
        appealId,
        message.senderId,
        message.message,
        message.isFromUser,
        message.timestamp
      ]);

      // 更新申诉的最后活动时间
      await this.updateLastActivity(appealId);

      // 清除相关缓存
      await this.redisService.del(`appeal:${appealId}:messages`);

      logger.debug('申诉消息已记录: %s', appealId);
    } catch (error) {
      logger.error('记录申诉消息失败:', error);
      throw error;
    }
  }

  /**
   * 获取申诉消息列表
   */
  async getMessages(appealId: string): Promise<AppealMessage[]> {
    try {
      // 先检查缓存
      const cacheKey = `appeal:${appealId}:messages`;
      const cached = await this.redisService.get(cacheKey);

      if (cached) {
        return JSON.parse(cached);
      }

      const query = `
        SELECT
          appeal_id,
          sender_id,
          message,
          is_from_user,
          extract(epoch from created_at) * 1000 as timestamp
        FROM dashboard.appeal_messages
        WHERE appeal_id = $1
        ORDER BY created_at ASC
      `;

      const result = await this.databaseService.query<{
        appeal_id: string;
        sender_id: string;
        message: string;
        is_from_user: boolean;
        timestamp: string | number;
      }>(query, [appealId]);

      const messages: AppealMessage[] = result.rows.map((row) => ({
        appealId: row.appeal_id,
        senderId: row.sender_id,
        message: row.message,
        timestamp: Number(row.timestamp),
        isFromUser: row.is_from_user,
      }));

      // 缓存结果
      await this.redisService.setex(cacheKey, 300, JSON.stringify(messages));

      return messages;
    } catch (error) {
      logger.error('获取申诉消息失败:', error);
      throw error;
    }
  }

  /**
   * 更新申诉状态
   */
  async updateStatus(appealId: string, status: string, reviewedBy?: string, decision?: string): Promise<void> {
    try {
      const query = `
        UPDATE dashboard.user_appeals
        SET
          status = $2,
          reviewed_at = CURRENT_TIMESTAMP,
          reviewed_by = $3,
          decision = $4,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `;

      await this.databaseService.query(query, [appealId, status, reviewedBy, decision]);

      // 清除相关缓存
      await this.redisService.del(`appeal:${appealId}`);

      logger.info('申诉状态已更新: %s -> %s', appealId, status);
    } catch (error) {
      logger.error('更新申诉状态失败:', error);
      throw error;
    }
  }

  /**
   * 获取申诉详情
   */
  async getAppeal(appealId: string): Promise<any> {
    try {
      const query = `
        SELECT
          ua.id,
          ua.user_id,
          ua.synapse_user_id,
          ua.reason,
          ua.status,
          ua.submitted_at,
          ua.reviewed_at,
          ua.reviewed_by,
          ua.decision,
          up.name as user_name,
          up.email as user_email
        FROM dashboard.user_appeals ua
        LEFT JOIN dashboard.user_profiles up ON ua.user_id = up.id
        WHERE ua.id = $1
      `;

      const result = await this.databaseService.query(query, [appealId]);

      if (result.rows.length === 0) {
        throw new Error('申诉不存在');
      }

      return result.rows[0];
    } catch (error) {
      logger.error('获取申诉详情失败:', error);
      throw error;
    }
  }

  /**
   * 获取待处理申诉列表
   */
  async getPendingAppeals(limit: number = 50, offset: number = 0): Promise<any[]> {
    try {
      const query = `
        SELECT
          ua.id,
          ua.synapse_user_id,
          ua.reason,
          ua.status,
          ua.submitted_at,
          up.name as user_name,
          up.email as user_email,
          ub.ban_type,
          ub.reason as ban_reason
        FROM dashboard.user_appeals ua
        LEFT JOIN dashboard.user_profiles up ON ua.user_id = up.id
        LEFT JOIN dashboard.user_bans ub ON ua.user_id = ub.user_id AND ub.is_active = true
        WHERE ua.status IN ('pending', 'under_review')
        ORDER BY ua.submitted_at ASC
        LIMIT $1 OFFSET $2
      `;

      const result = await this.databaseService.query(query, [limit, offset]);
      return result.rows;
    } catch (error) {
      logger.error('获取待处理申诉列表失败:', error);
      throw error;
    }
  }

  /**
   * 更新申诉最后活动时间
   */
  private async updateLastActivity(appealId: string): Promise<void> {
    try {
      const query = `
        UPDATE dashboard.user_appeals
        SET updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `;

      await this.databaseService.query(query, [appealId]);
    } catch (error) {
      logger.error('更新申诉活动时间失败:', error);
    }
  }

  /**
   * 创建申诉（由 webhook 触发）
   */
  async createAppeal(userId: string, synapseUserId: string, reason: string): Promise<string> {
    try {
      const query = `
        INSERT INTO dashboard.user_appeals (user_id, synapse_user_id, reason, status, submitted_at)
        VALUES ($1, $2, $3, 'pending', CURRENT_TIMESTAMP)
        RETURNING id
      `;

      const result = await this.databaseService.query(query, [userId, synapseUserId, reason]);
      const appealId = result.rows[0].id;

      logger.info('新申诉已创建: %s for user %s', appealId, synapseUserId);
      return appealId;
    } catch (error) {
      logger.error('创建申诉失败:', error);
      throw error;
    }
  }
}
