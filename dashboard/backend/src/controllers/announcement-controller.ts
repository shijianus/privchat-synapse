import { Request, Response } from 'express';

import { AnnouncementService } from '../services/announcement-service';
import { HttpError } from '../utils/http-error';

export class AnnouncementController {
  constructor(private readonly announcementService: AnnouncementService) {}

  /**
   * 管理员发起影子房间广播（公众号宣告）
   */
  async broadcast(req: Request, res: Response): Promise<void> {
    if (!req.user) {
      throw new HttpError(401, '未检测到管理员身份');
    }

    const result = await this.announcementService.broadcast(String(req.user.id), req.body);
    res.json(result);
  }
}
