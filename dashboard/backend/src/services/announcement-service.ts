import { config } from '../config/env';
import { OperationLogService } from './operation-log-service';

export interface BroadcastRequest {
  readonly channelKey: string;
  readonly title: string;
  readonly content: string;
  readonly html?: string;
  readonly audience: readonly string[];
}

export interface BroadcastResult {
  readonly delivered: number;
  readonly roomIds: readonly string[];
}

/**
 * 管理端公告/影子房间广播服务：将管理员指令转发给 Bot
 */
export class AnnouncementService {
  constructor(private readonly operationLogService: OperationLogService) {}

  async broadcast(adminId: string, payload: BroadcastRequest): Promise<BroadcastResult> {
    const response = await fetch(`${config.botServiceBaseUrl}/webhooks/broadcast`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${config.botApiSecret}`,
      },
      body: JSON.stringify(payload),
    });

    const data = (await response.json().catch(() => ({}))) as Partial<BroadcastResult> & {
      error?: string;
      roomId?: string;
    };

    if (!response.ok) {
      throw new Error(data.error || response.statusText);
    }

    const roomIds = (data.roomIds as string[] | undefined) ?? (data.roomId ? [data.roomId] : []);
    const delivered = Number(data.delivered ?? roomIds.length ?? 0);

    await this.operationLogService.record({
      actorId: String(adminId),
      action: 'announcement.broadcast',
      targetSynapseUserId: payload.channelKey,
      metadata: {
        delivered,
        roomIds,
        audienceCount: payload.audience.length,
        title: payload.title,
      },
    });

    return {
      delivered,
      roomIds,
    };
  }
}
