import { Request, Response } from 'express';

import { MediaService } from '../services/media-service';
import { MediaListFilters } from '../types/media';
import { HttpError } from '../utils/http-error';

/**
 * 媒体管理控制器
 */
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  listMedia = async (req: Request, res: Response): Promise<void> => {
    const filters = req.query as unknown as MediaListFilters;
    const result = await this.mediaService.listMedia(filters);
    res.json(result);
  };

  getMediaByHash = async (req: Request, res: Response): Promise<void> => {
    const record = await this.mediaService.getMediaByHash(req.params.mediaHash);
    res.json(record);
  };

  registerUpload = async (req: Request, res: Response): Promise<void> => {
    const actorId = this.ensureActor(req);
    const record = await this.mediaService.registerUpload(req.body, actorId);
    res.status(201).json(record);
  };

  deleteMedia = async (req: Request, res: Response): Promise<void> => {
    const actorId = this.ensureActor(req);
    const record = await this.mediaService.deleteMedia(req.params.mediaHash, actorId);
    res.json(record);
  };

  createSyncTask = async (req: Request, res: Response): Promise<void> => {
    const actorId = this.ensureActor(req);
    const task = await this.mediaService.createSyncTask(req.body, actorId);
    res.status(201).json(task);
  };

  getSyncTask = async (req: Request, res: Response): Promise<void> => {
    const taskId = Number(req.params.taskId);
    const task = await this.mediaService.getSyncTask(taskId);
    res.json(task);
  };

  private ensureActor(req: Request): string {
    if (!req.user?.id) {
      throw new HttpError(401, '未检测到管理员身份');
    }
    return req.user.id;
  }
}
