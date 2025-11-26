import { Request, Response } from 'express';

import { SystemService } from '../services/system-service';
import { HttpError } from '../utils/http-error';

/**
 * 系统监控与配置控制器
 */
export class SystemController {
  constructor(private readonly systemService: SystemService) {}

  getHealth = async (_req: Request, res: Response): Promise<void> => {
    const health = await this.systemService.getHealthStatus();
    res.json(health);
  };

  getStats = async (_req: Request, res: Response): Promise<void> => {
    const stats = await this.systemService.getSystemStats();
    res.json(stats);
  };

  getConfig = async (_req: Request, res: Response): Promise<void> => {
    const config = await this.systemService.getConfig();
    res.json(config);
  };

  updateConfig = async (req: Request, res: Response): Promise<void> => {
    const actorId = this.ensureActor(req);
    const config = await this.systemService.updateConfig(req.body, actorId);
    res.json(config);
  };

  private ensureActor(req: Request): string {
    if (!req.user?.id) {
      throw new HttpError(401, '未检测到管理员身份');
    }
    return req.user.id;
  }
}
