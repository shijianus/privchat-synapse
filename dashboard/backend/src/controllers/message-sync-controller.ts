import { Request, Response } from 'express';

import { MessageSyncService } from '../services/message-sync-service';
import { PendingMessageFilters } from '../types/message-sync';
import { HttpError } from '../utils/http-error';

/**
 * 待同步消息控制器
 */
export class MessageSyncController {
  constructor(private readonly messageSyncService: MessageSyncService) {}

  listPendingMessages = async (req: Request, res: Response): Promise<void> => {
    const filters = req.query as unknown as PendingMessageFilters;
    const results = await this.messageSyncService.listPendingMessages(filters);
    res.json(results);
  };

  replayMessage = async (req: Request, res: Response): Promise<void> => {
    const actorId = this.ensureActor(req);
    const messageId = Number(req.params.messageId);
    const reason = req.body?.reason;
    const result = await this.messageSyncService.replayMessage(messageId, actorId, reason);
    res.json(result);
  };

  discardMessage = async (req: Request, res: Response): Promise<void> => {
    const actorId = this.ensureActor(req);
    const messageId = Number(req.params.messageId);
    const reason = req.body?.reason;
    const result = await this.messageSyncService.discardMessage(messageId, actorId, reason);
    res.json(result);
  };

  private ensureActor(req: Request): string {
    if (!req.user?.id) {
      throw new HttpError(401, '未检测到管理员身份');
    }
    return req.user.id;
  }
}
