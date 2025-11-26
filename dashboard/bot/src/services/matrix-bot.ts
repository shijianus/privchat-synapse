import { MatrixClient } from 'matrix-bot-sdk';
import { AppealService } from './appeal-service';
import { FriendVerificationService } from './friend-verification-service';
import { RedisService } from './redis-service';
import { logger } from '../utils/logger';
import { config } from '../config/env';

export interface AppealWebhook {
  appealId: string;
  userId: string;
  synapseUserId: string;
  action: 'created' | 'updated';
  message?: string;
}

export interface VerificationWebhook {
  userId: string;
  synapseUserId: string;
  friendCode: string;
  action: 'request' | 'verify';
}

export class MatrixBotService {
  private client: MatrixClient | null = null;
  private botUserId: string | null = null;
  private isConnected = false;

  constructor(
    private appealService: AppealService,
    private friendVerificationService: FriendVerificationService,
    private redisService: RedisService
  ) {}

  /**
   * 启动 Matrix Bot
   */
  async start(): Promise<void> {
    try {
      logger.info('正在连接到 Matrix 服务器: %s', config.matrix.homeserver);

      // 创建 Matrix 客户端
      this.client = new MatrixClient(
        config.matrix.homeserver,
        config.matrix.username,
        config.matrix.password
      );

      // 设置事件监听器
      this.client.on('room.message', this.handleRoomMessage.bind(this));
      this.client.on('room.invite', this.handleRoomInvite.bind(this));
      this.client.on('room.join', this.handleRoomJoin.bind(this));

      // 登录
      await this.client.start();
      this.botUserId = await this.client.getUserId();
      this.isConnected = true;

      // 设置显示名称和头像
      if (config.matrix.displayName) {
        await this.client.setDisplayName(config.matrix.displayName);
      }
      if (config.matrix.avatarUrl) {
        await this.client.setAvatarUrl(config.matrix.avatarUrl);
      }

      // 加入管理员房间
      await this.joinRoom(config.botAdminRoomId);

      logger.info('Matrix Bot 启动成功: %s', this.botUserId);
    } catch (error) {
      logger.error('Matrix Bot 启动失败:', error);
      throw error;
    }
  }

  /**
   * 停止 Matrix Bot
   */
  async stop(): Promise<void> {
    if (this.client && this.isConnected) {
      try {
        await this.client.stop();
        this.isConnected = false;
        logger.info('Matrix Bot 已停止');
      } catch (error) {
        logger.error('Matrix Bot 停止失败:', error);
      }
    }
  }

  /**
   * 处理申诉 Webhook
   */
  async handleAppealWebhook(webhook: AppealWebhook): Promise<void> {
    try {
      const { appealId, userId, synapseUserId, action, message } = webhook;

      if (action === 'created') {
        // 创建申诉房间并邀请用户
        const roomId = await this.createAppealRoom(appealId, synapseUserId);
        await this.sendWelcomeMessage(roomId, appealId);

        // 通知管理员
        await this.notifyAdmins('new_appeal', {
          appealId,
          userId,
          synapseUserId,
          roomId,
        });

        logger.info('申诉房间已创建: %s for appeal %s', roomId, appealId);
      } else if (action === 'updated' && message) {
        // 在现有申诉房间中发送消息
        const roomId = await this.getAppealRoomId(appealId);
        if (roomId) {
          await this.client!.sendMessage(roomId, {
            msgtype: 'm.text',
            body: `系统消息: ${message}`,
          });
        }
      }
    } catch (error) {
      logger.error('处理申诉 webhook 失败:', error);
      throw error;
    }
  }

  /**
   * 处理朋友验证 Webhook
   */
  async handleVerificationWebhook(webhook: VerificationWebhook): Promise<void> {
    try {
      const { userId, synapseUserId, friendCode, action } = webhook;

      if (action === 'request') {
        // 发送验证码
        await this.sendVerificationCode(synapseUserId, friendCode);
      } else if (action === 'verify') {
        // 验证成功，通知用户
        await this.notifyVerificationSuccess(synapseUserId);
      }
    } catch (error) {
      logger.error('处理验证 webhook 失败:', error);
      throw error;
    }
  }

  /**
   * 创建申诉房间
   */
  private async createAppealRoom(appealId: string, userMxid: string): Promise<string> {
    const roomName = `申诉 #${appealId}`;
    const topic = '用户申诉处理房间';

    // 创建私人房间
    const roomId = await this.client!.createRoom({
      name: roomName,
      topic,
      preset: 'private_chat',
      invite: [userMxid, ...await this.getAdminUserIds()],
    });

    // 存储房间映射
    await this.redisService.setex(
      `appeal_room:${appealId}`,
      86400 * 7, // 7天过期
      roomId
    );

    return roomId;
  }

  /**
   * 发送欢迎消息
   */
  private async sendWelcomeMessage(roomId: string, appealId: string): Promise<void> {
    const welcomeMessage = `
📋 申诉处理已开始

您好！我是申诉助理。您的申诉（编号: #${appealId}）已分配到专门的处理房间。

📝 在此房间中您可以：
- 详细说明申诉理由
- 提供相关证据材料
- 与管理员直接沟通

⏱️ 管理员将在24小时内回复您的申诉。
如有紧急情况，请联系系统管理员。

---
🤖 此消息由申诉助理自动发送
    `.trim();

    await this.client!.sendMessage(roomId, {
      msgtype: 'm.text',
      body: welcomeMessage,
      format: 'org.matrix.custom.html',
      formatted_body: welcomeMessage.replace(/\n/g, '<br>'),
    });
  }

  /**
   * 发送验证码
   */
  private async sendVerificationCode(userMxid: string, code: string): Promise<void> {
    try {
      const dmRoomId = await this.client!.createDmRoom(userMxid);

      const message = `
🔐 朋友验证

您的朋友验证码是: ${code}

请在30分钟内完成验证。此验证码用于确认您的朋友身份，符合我们的安全政策要求。

---
🤖 此消息由申诉助理自动发送
      `.trim();

      await this.client!.sendMessage(dmRoomId, {
        msgtype: 'm.text',
        body: message,
      });

      logger.info('验证码已发送给用户: %s', userMxid);
    } catch (error) {
      logger.error('发送验证码失败:', error);
      throw error;
    }
  }

  /**
   * 通知验证成功
   */
  private async notifyVerificationSuccess(userMxid: string): Promise<void> {
    try {
      const dmRoomId = await this.client!.createDmRoom(userMxid);

      const message = `
✅ 朋友验证成功

您的朋友身份验证已完成。您现在可以正常使用系统功能。

感谢您的配合！

---
🤖 此消息由申诉助理自动发送
      `.trim();

      await this.client!.sendMessage(dmRoomId, {
        msgtype: 'm.text',
        body: message,
      });

      logger.info('验证成功通知已发送给用户: %s', userMxid);
    } catch (error) {
      logger.error('发送验证成功通知失败:', error);
    }
  }

  /**
   * 通知管理员
   */
  private async notifyAdmins(type: string, data: any): Promise<void> {
    try {
      await this.client!.sendMessage(config.botAdminRoomId, {
        msgtype: 'm.text',
        body: `📢 ${type === 'new_appeal' ? '新申诉' : '申诉更新'}: ${JSON.stringify(data, null, 2)}`,
      });
    } catch (error) {
      logger.error('通知管理员失败:', error);
    }
  }

  /**
   * 获取申诉房间 ID
   */
  private async getAppealRoomId(appealId: string): Promise<string | null> {
    return await this.redisService.get(`appeal_room:${appealId}`);
  }

  /**
   * 获取管理员用户 ID 列表
   */
  private async getAdminUserIds(): Promise<string[]> {
    try {
      const adminIds = await this.redisService.smembers('admin_users');
      return adminIds.map(id => `@${id}:${config.matrix.homeserver.replace('https://', '')}`);
    } catch (error) {
      logger.error('获取管理员列表失败:', error);
      return [];
    }
  }

  /**
   * 加入房间
   */
  private async joinRoom(roomId: string): Promise<void> {
    try {
      await this.client!.joinRoom(roomId);
      logger.info('已加入房间: %s', roomId);
    } catch (error) {
      logger.error('加入房间失败 %s:', roomId, error);
    }
  }

  /**
   * 处理房间消息
   */
  private async handleRoomMessage(roomId: string, event: any): Promise<void> {
    try {
      // 忽略机器人自己的消息
      if (event.sender === this.botUserId) {
        return;
      }

      // 记录申诉相关消息
      const appealId = await this.findAppealByRoom(roomId);
      if (appealId) {
        await this.appealService.recordMessage(appealId, {
          senderId: event.sender,
          message: event.content.body,
          timestamp: event.origin_server_ts,
          isFromUser: true,
        });
      }
    } catch (error) {
      logger.error('处理房间消息失败:', error);
    }
  }

  /**
   * 处理房间邀请
   */
  private async handleRoomInvite(roomId: string, event: any): Promise<void> {
    try {
      await this.joinRoom(roomId);
    } catch (error) {
      logger.error('处理房间邀请失败:', error);
    }
  }

  /**
   * 处理加入房间
   */
  private async handleRoomJoin(roomId: string, event: any): Promise<void> {
    // 可以在这里添加自定义逻辑
  }

  /**
   * 根据房间查找申诉
   */
  private async findAppealByRoom(roomId: string): Promise<string | null> {
    // 这里可以实现反向查找逻辑
    // 为了简化，这里返回 null
    return null;
  }
}