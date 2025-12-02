/// <reference path="../types/ambient.d.ts" />
import { Request, Response } from 'express';

import { AppealService } from '../services/appeal-service';
import { HttpError } from '../utils/http-error';
import { AppealListFilters } from '../types/appeal';

/**
 * 申诉控制器，提供管理员与 Bot 两类接口
 */
export class AppealController {
  constructor(private readonly appealService: AppealService) {}

  listAppeals = async (req: Request, res: Response): Promise<void> => {
    const filters = req.query as unknown as AppealListFilters;
    const appeals = await this.appealService.listAppeals(filters);
    res.json(appeals);
  };

  getAppeal = async (req: Request, res: Response): Promise<void> => {
    const appealId = Number(req.params.appealId);
    const detail = await this.appealService.getAppealDetail(appealId);
    res.json(detail);
  };

  addAdminMessage = async (req: Request, res: Response): Promise<void> => {
    const actorId = this.ensureActor(req);
    const appealId = Number(req.params.appealId);
    const content = req.body.body.trim();
    const message = await this.appealService.appendMessageFromAdmin(appealId, actorId, content);
    res.status(201).json(message);
  };

  decideAppeal = async (req: Request, res: Response): Promise<void> => {
    const actorId = this.ensureActor(req);
    const appealId = Number(req.params.appealId);
    const detail = await this.appealService.decideAppeal(appealId, req.body, actorId);
    res.json(detail);
  };

  submitAppealFromBot = async (req: Request, res: Response): Promise<void> => {
    this.ensureBot(req);
    const detail = await this.appealService.submitAppeal(req.body, req.body.synapseUserId);
    res.status(201).json(detail);
  };

  appendAppealMessageFromBot = async (req: Request, res: Response): Promise<void> => {
    this.ensureBot(req);
    const appealId = Number(req.params.appealId);
    const content = req.body.body.trim();
    const message = await this.appealService.appendMessageFromUser(
      appealId,
      req.body.synapseUserId,
      content
    );
    res.status(201).json(message);
  };

  private ensureActor(req: Request): string {
    if (!req.user?.id) {
      throw new HttpError(401, '未检测到管理员身份');
    }
    return req.user.id;
  }

  private ensureBot(req: Request) {
    if (!req.bot) {
      throw new HttpError(401, '缺少机器人认证信息');
    }
    return req.bot;
  }
}
