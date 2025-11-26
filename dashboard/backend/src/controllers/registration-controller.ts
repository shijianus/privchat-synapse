import { Request, Response } from 'express';

import { RegistrationService } from '../services/registration-service';
import {
  RegistrationApplicationFilters,
  RegistrationBlacklistFilters,
} from '../types/registration';
import { HttpError } from '../utils/http-error';

/**
 * 注册审核与黑名单控制器
 */
export class RegistrationController {
  constructor(private readonly registrationService: RegistrationService) {}

  listApplications = async (req: Request, res: Response): Promise<void> => {
    const filters = req.query as unknown as RegistrationApplicationFilters;
    const applications = await this.registrationService.listApplications(filters);
    res.json(applications);
  };

  approveApplication = async (req: Request, res: Response): Promise<void> => {
    const actorId = this.ensureActor(req);
    const applicationId = Number(req.params.applicationId);
    const record = await this.registrationService.approveApplication(applicationId, req.body, actorId);
    res.json(record);
  };

  rejectApplication = async (req: Request, res: Response): Promise<void> => {
    const actorId = this.ensureActor(req);
    const applicationId = Number(req.params.applicationId);
    const record = await this.registrationService.rejectApplication(applicationId, req.body, actorId);
    res.json(record);
  };

  listBlacklist = async (req: Request, res: Response): Promise<void> => {
    const filters = req.query as unknown as RegistrationBlacklistFilters;
    const entries = await this.registrationService.listBlacklist(filters);
    res.json(entries);
  };

  createBlacklistEntry = async (req: Request, res: Response): Promise<void> => {
    const actorId = this.ensureActor(req);
    const entry = await this.registrationService.createBlacklistEntry(req.body, actorId);
    res.status(201).json(entry);
  };

  deleteBlacklistEntry = async (req: Request, res: Response): Promise<void> => {
    const actorId = this.ensureActor(req);
    await this.registrationService.deleteBlacklistEntry(Number(req.params.entryId), actorId);
    res.status(204).send();
  };

  private ensureActor(req: Request): string {
    if (!req.user?.id) {
      throw new HttpError(401, '未检测到管理员身份');
    }
    return req.user.id;
  }
}
