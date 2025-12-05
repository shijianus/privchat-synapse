import { MatrixClient } from 'matrix-bot-sdk';
import { RedisService } from './redis-service';
import { logger } from '../utils/logger';
import { config } from '../config/env';

export interface ShadowBroadcastPayload {
  channelKey: string;
  title: string;
  content: string;
  html?: string;
  audience: string[];
}

export interface ShadowRoomMeta {
  roomIds: string[];
  delivered: number;
}

const DEFAULT_CHANNEL_KEY = 'welcome';

/**
 * 影子房间/“公众号”模式：
 * - 每个用户有独立的私聊房（与 Bot 的 DM），彼此不可见。
 * - 按 channelKey 维度缓存 DM，保证同一频道对同一用户复用同一房间。
 */
export class ShadowRoomService {
  constructor(
    private client: MatrixClient,
    private redisService: RedisService,
    private homeserverDomain: string
  ) {}

  async broadcast(payload: ShadowBroadcastPayload): Promise<ShadowRoomMeta> {
    const channelKey = this.normalizeKey(payload.channelKey);
    const audience = (payload.audience ?? []).map((mxid) => this.normalizeMxid(mxid));
    if (audience.length === 0) {
      throw new Error('audience 不能为空');
    }

    const body = `${payload.title}\n\n${payload.content}`;
    const formattedBody = payload.html ?? body.replace(/\n/g, '<br>');

    const roomIds: string[] = [];
    let delivered = 0;

    for (const user of audience) {
      const roomId = await this.ensureUserChannelRoom(channelKey, user);
      roomIds.push(roomId);
      try {
        await this.client.sendMessage(roomId, {
          msgtype: 'm.text',
          body,
          format: 'org.matrix.custom.html',
          formatted_body: formattedBody,
        });
        delivered += 1;
      } catch (error) {
        logger.warn('向 %s 发送影子广播失败: %s', user, (error as Error).message);
      }
    }

    logger.info(
      '影子房间广播完成 channel=%s delivered=%d/%d',
      channelKey,
      delivered,
      audience.length
    );
    return { roomIds, delivered };
  }

  /**
   * 为一批用户建立/复用 DM，不发送消息，用于新用户入驻
   */
  async ensureDmForUsers(users: string[], channelKey = DEFAULT_CHANNEL_KEY): Promise<string[]> {
    const normalized = users.map((u) => this.normalizeMxid(u));
    const roomIds: string[] = [];
    for (const user of normalized) {
      const roomId = await this.ensureUserChannelRoom(channelKey, user);
      roomIds.push(roomId);
    }
    return roomIds;
  }

  /**
   * 为单个用户确保一个专属的频道私聊房
   */
  private async ensureUserChannelRoom(channelKey: string, userMxid: string): Promise<string> {
    const cacheKey = this.cacheKey(channelKey, userMxid);
    const cachedRoom = await this.redisService.get(cacheKey);
    if (cachedRoom) {
      return cachedRoom;
    }

    const roomId = await this.client.createRoom({
      name: `${config.shadowRoom.namePrefix}${channelKey}`,
      topic: config.shadowRoom.topicTemplate.replace('%key%', channelKey),
      preset: 'trusted_private_chat',
      is_direct: true,
      invite: [userMxid],
      visibility: 'private',
    });

    await this.redisService.setex(cacheKey, 86400 * 30, roomId);
    await this.redisService.sadd('shadow_rooms', channelKey);
    return roomId;
  }

  private normalizeKey(key: string): string {
    const trimmed = key.trim();
    if (!trimmed) {
      throw new Error('channelKey 不能为空');
    }
    return `${config.shadowRoom.prefix}${trimmed}`;
  }

  private normalizeMxid(target: string): string {
    const trimmed = target.trim();
    if (!trimmed) {
      throw new Error('受众 Matrix ID 不能为空');
    }
    if (trimmed.startsWith('@') && trimmed.includes(':')) {
      return trimmed;
    }
    const localpart = trimmed.startsWith('@') ? trimmed.slice(1) : trimmed;
    return `@${localpart}:${this.homeserverDomain}`;
  }

  private cacheKey(channelKey: string, userMxid: string): string {
    return `shadow_dm:${channelKey}:${userMxid}`;
  }
}
