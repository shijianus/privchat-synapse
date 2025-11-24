import { Request, Response } from 'express';
import Joi from 'joi';

import { BanService } from '../services/ban-service';
import { HttpError } from '../utils/http-error';

export const updateBanBodySchema = Joi.object({
  reason: Joi.string().max(1024).optional(),
  evidence: Joi.object().optional(),
  status: Joi.string().valid('active', 'expired', 'revoked').optional(),
  expiresAt: Joi.date().iso().allow(null).optional(),
})
  .min(1)
  .required();

export const banIdParamSchema = Joi.object({
  banId: Joi.number().integer().positive().required(),
});

/**
 * 封禁控制器，提供全局封禁管理接口
 */
export class BanController {
  constructor(private readonly banService: BanService) {}

  listActiveBans = async (_req: Request, res: Response): Promise<void> => {
    const bans = await this.banService.listActiveBans();
    res.json(bans);
  };

  updateBan = async (req: Request, res: Response): Promise<void> => {
    const actorId = this.ensureActor(req);
    const ban = await this.banService.updateBanStatus(
      {
        ...req.body,
        banId: Number(req.params.banId),
        updatedBy: actorId,
      },
      actorId
    );
    res.json(ban);
  };

  private ensureActor(req: Request): string {
    if (!req.user?.id) {
      throw new HttpError(401, '未检测到管理员身份');
    }
    return req.user.id;
  }
}
