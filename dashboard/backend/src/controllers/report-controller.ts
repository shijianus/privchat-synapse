import { Request, Response } from 'express';

import { ReportService } from '../services/report-service';
import { HttpError } from '../utils/http-error';

export class ReportController {
  constructor(private readonly reportService: ReportService) {}

  async submitFromBot(req: Request, res: Response): Promise<void> {
    if (!req.bot) {
      throw new HttpError(401, '未检测到 Bot 身份');
    }
    await this.reportService.submit(req.body);
    res.json({ status: 'ok' });
  }

  async list(req: Request, res: Response): Promise<void> {
    if (!req.user) {
      throw new HttpError(401, '未检测到管理员身份');
    }

    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Number(req.query.offset) || 0;
    const data = await this.reportService.list(limit, offset);
    res.json({ items: data, limit, offset });
  }
}
