import {
  AutojoinRoomsMixin,
  MatrixAuth,
  MatrixClient,
  SimpleFsStorageProvider,
} from 'matrix-bot-sdk';
import { mkdirSync } from 'fs';
import { dirname } from 'path';
import { DashboardApiService } from './dashboard-api-service';
import { AppealService } from './appeal-service';
import { FriendVerificationService } from './friend-verification-service';
import { RedisService } from './redis-service';
import { ShadowRoomService, ShadowBroadcastPayload } from './shadow-room-service';
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
  private storage: SimpleFsStorageProvider | null = null;
  private shadowRoomService: ShadowRoomService | null = null;

  constructor(
    private appealService: AppealService,
    private friendVerificationService: FriendVerificationService,
    private dashboardApiService: DashboardApiService,
    private redisService: RedisService
  ) {}

  /**
   * 启动 Matrix Bot
   */
  async start(): Promise<void> {
    try {
      logger.info('正在连接到 Matrix 服务器: %s', config.matrix.homeserver);

      mkdirSync(dirname(config.matrix.storagePath), { recursive: true });
      this.storage = new SimpleFsStorageProvider(config.matrix.storagePath);

      const { accessToken, userId } = await this.getAccessToken();

      this.client = new MatrixClient(
        config.matrix.homeserver,
        accessToken,
        this.storage
      );

      AutojoinRoomsMixin.setupOnClient(this.client);

      // 设置事件监听器
      this.client.on('room.message', this.handleRoomMessage.bind(this));
      this.client.on('room.invite', this.handleRoomInvite.bind(this));
      this.client.on('room.join', this.handleRoomJoin.bind(this));

      // 登录
      await this.client.start();
      this.botUserId = userId ?? (await this.client.getUserId());
      this.isConnected = true;
      this.shadowRoomService = new ShadowRoomService(
        this.client,
        this.redisService,
        this.getHomeserverDomain()
      );

      // 设置显示名称和头像（暂时禁用以避免 SDK 兼容性问题）
      // if (config.matrix.displayName) {
      //   await this.client.setDisplayName(config.matrix.displayName);
      // }
      // if (config.matrix.avatarUrl) {
      //   await this.client.setAvatarUrl(config.matrix.avatarUrl);
      // }

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
   * 处理影子房间广播 Webhook
   */
  async handleBroadcastWebhook(webhook: ShadowBroadcastPayload): Promise<{
    roomIds: string[];
    delivered: number;
  }> {
    if (!this.shadowRoomService) {
      throw new Error('ShadowRoomService 未初始化');
    }

    const result = await this.shadowRoomService.broadcast(webhook);
    await this.notifyAdmins('broadcast', {
      channelKey: webhook.channelKey,
      roomIds: result.roomIds,
      delivered: result.delivered,
      title: webhook.title,
    });
    return { roomIds: result.roomIds, delivered: result.delivered };
  }

  /**
   * 为一批用户确保与 Bot 的私聊 DM
   */
  async ensureDirects(users: string[], channelKey?: string): Promise<string[]> {
    if (!this.shadowRoomService) {
      throw new Error('ShadowRoomService 未初始化');
    }
    return this.shadowRoomService.ensureDmForUsers(users, channelKey);
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
      is_direct: false,
      invite: [userMxid, ...(await this.getAdminUserIds())],
    });

    await this.cacheAppealRoomMapping(appealId, roomId);

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
      const dmRoomId = await this.ensureDirectRoom(userMxid);

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
      const dmRoomId = await this.ensureDirectRoom(userMxid);

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
   * 确保存在 DM 房间（缓存 30 天）
   */
  private async ensureDirectRoom(userMxid: string): Promise<string> {
    const cacheKey = `dm_room:${userMxid}`;
    const cached = await this.redisService.get(cacheKey);
    if (cached) {
      return cached;
    }

    const roomId = await this.client!.createRoom({
      invite: [userMxid],
      is_direct: true,
      preset: 'trusted_private_chat',
    });

    await this.redisService.setex(cacheKey, 86400 * 30, roomId);
    return roomId;
  }

  /**
   * 通知管理员
   */
  private async notifyAdmins(type: string, data: any): Promise<void> {
    try {
      let prefix = '申诉更新';
      if (type === 'new_appeal') {
        prefix = '新申诉';
      } else if (type === 'broadcast') {
        prefix = '影子房间广播';
      } else if (type === 'user_report') {
        prefix = '用户举报';
      }
      await this.client!.sendMessage(config.botAdminRoomId, {
        msgtype: 'm.text',
        body: `📢 ${prefix}: ${JSON.stringify(data, null, 2)}`,
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
   * 缓存申诉房间映射（双向）
   */
  private async cacheAppealRoomMapping(appealId: string, roomId: string): Promise<void> {
    const ttl = 86400 * 7; // 7 天
    await Promise.all([
      this.redisService.setex(`appeal_room:${appealId}`, ttl, roomId),
      this.redisService.setex(`appeal_room_by_room:${roomId}`, ttl, appealId),
    ]);
  }

  /**
   * 获取管理员用户 ID 列表
   */
  private async getAdminUserIds(): Promise<string[]> {
    try {
      const adminIds = await this.redisService.smembers('admin_users');
      const domain = this.getHomeserverDomain();
      return adminIds.map((id) => `@${id}:${domain}`);
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

      const body: string | undefined = event?.content?.body;
      if (!body) {
        return;
      }

      // 处理命令
      const handled = await this.handleCommand(roomId, event.sender, body.trim());
      if (handled) {
        return;
      }

      // 记录申诉相关消息
      const appealId = await this.findAppealByRoom(roomId);
      if (appealId) {
        await this.appealService.recordMessage(appealId, {
          senderId: event.sender,
          message: body,
          timestamp: event.origin_server_ts ?? Date.now(),
          isFromUser: true,
          appealId,
        });
      }
    } catch (error) {
      logger.error('处理房间消息失败:', error);
    }
  }

  /**
   * 处理指令消息
   */
  private async handleCommand(roomId: string, sender: string, body: string): Promise<boolean> {
    const [commandRaw, ...args] = body.split(/\s+/);
    if (!commandRaw) {
      return false;
    }
    const normalized = commandRaw.toLowerCase();

    switch (normalized) {
      case '/verify':
      case '!verify':
      case 'verify':
        await this.handleFriendVerificationCommand(roomId, sender, args);
        return true;
      case '/report':
      case '!report':
      case 'report':
        await this.handleReportCommand(roomId, sender, args);
        return true;
      default:
        return false;
    }
  }

  /**
   * 好友担保验证命令
   */
  private async handleFriendVerificationCommand(
    roomId: string,
    sender: string,
    args: string[]
  ): Promise<void> {
    if (args.length < 2) {
      await this.replyText(
        roomId,
        '用法：/verify <朋友的Matrix ID> <验证码>\n示例：/verify @alice:example.com abcd1234'
      );
      return;
    }

    const [targetRaw, hash] = args;
    if (!targetRaw) {
      await this.replyText(roomId, '请提供被验证好友的用户名或 Matrix ID。');
      return;
    }
    if (!hash) {
      await this.replyText(roomId, '请提供验证码。');
      return;
    }
    const targetMatrixId = this.normalizeMatrixId(targetRaw);

    try {
      const result = await this.dashboardApiService.verifyFriend({
        verifier: sender,
        target: targetMatrixId,
        hash,
      });

      if (result.success) {
        const revocationNotice = result.revocationWindowEndsAt
          ? `\n好友可在 ${result.revocationWindowEndsAt} 前撤销担保`
          : '';
        await this.replyText(
          roomId,
          `✅ 好友担保验证已提交：${targetMatrixId}${revocationNotice}`
        );
      } else {
        await this.replyText(
          roomId,
          `❌ 验证失败：${result.reason ?? '未通过验证，请检查验证码后重试'}`
        );
      }
    } catch (error) {
      logger.error('处理朋友验证命令失败:', error);
      await this.replyText(roomId, '提交验证请求失败，请稍后重试或联系管理员。');
    }
  }

  private normalizeMatrixId(target: string): string {
    const trimmed = target.trim();
    if (trimmed.startsWith('@') && trimmed.includes(':')) {
      return trimmed;
    }

    const domain = this.getHomeserverDomain();
    const localpart = trimmed.startsWith('@') ? trimmed.slice(1) : trimmed;
    return `@${localpart}:${domain}`;
  }

  private getHomeserverDomain(): string {
    try {
      return new URL(config.matrix.homeserver).host;
    } catch {
      return config.matrix.homeserver.replace(/^https?:\/\//, '');
    }
  }

  /**
   * 处理用户举报命令
   * 用法：/report <username|@user:domain> <理由...>
   */
  private async handleReportCommand(roomId: string, sender: string, args: string[]): Promise<void> {
    if (args.length < 2) {
      await this.replyText(
        roomId,
        '用法：/report <被举报用户名或Matrix ID> <举报理由>\n示例：/report baduser 垃圾广告'
      );
      return;
    }

    const [targetRaw, ...rest] = args;
    if (!targetRaw) {
      await this.replyText(roomId, '请提供被举报的用户名或 Matrix ID。');
      return;
    }
    const targetMxid = this.normalizeMatrixId(targetRaw);
    const reason = rest.join(' ').trim();
    if (!reason) {
      await this.replyText(roomId, '请填写举报理由。');
      return;
    }

    try {
      await this.dashboardApiService.submitReport({
        reporter: sender,
        target: targetMxid,
        reason,
      });

      await this.replyText(roomId, '感谢反馈，已收到举报，会尽快处理。');
      await this.notifyAdmins('user_report', {
        reporter: sender,
        target: targetMxid,
        reason,
      });
    } catch (error) {
      logger.error('提交举报失败:', error);
      await this.replyText(roomId, '举报提交失败，请稍后再试。');
    }
  }

  private async replyText(roomId: string, message: string): Promise<void> {
    try {
      await this.client!.sendMessage(roomId, {
        msgtype: 'm.text',
        body: message,
      });
    } catch (error) {
      logger.error('发送回复消息失败:', error);
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
   * 获取访问令牌
   */
  private async getAccessToken(): Promise<{ accessToken: string; userId?: string }> {
    if (config.matrix.accessToken) {
      return { accessToken: config.matrix.accessToken };
    }

    if (!config.matrix.password) {
      throw new Error('缺少 MATRIX_BOT_PASSWORD，无法使用密码登录');
    }

    // 直接使用 HTTP 请求进行登录，避免 SDK 兼容性问题
    const loginUrl = `${config.matrix.homeserver}/_matrix/client/r0/login`;
    const loginData = {
      type: "m.login.password",
      identifier: {
        type: "m.id.user",
        user: config.matrix.username
      },
      password: config.matrix.password,
      device_id: "dashboard-bot"
    };

    const response = await fetch(loginUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(loginData)
    });

    if (!response.ok) {
      throw new Error(`Matrix 登录失败: ${response.status} ${response.statusText}`);
    }

    const login = await response.json() as any;
    return {
      accessToken: login.access_token,
      userId: login.user_id,
    };
  }

  /**
   * 根据房间查找申诉
   */
  private async findAppealByRoom(roomId: string): Promise<string | null> {
    return await this.redisService.get(`appeal_room_by_room:${roomId}`);
  }
}
