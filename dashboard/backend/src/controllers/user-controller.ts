import { Request, Response } from 'express';
import Joi from 'joi';

import { BanService } from '../services/ban-service';
import { UserService } from '../services/user-service';
import { HttpError } from '../utils/http-error';
import { UserProfileFilter } from '../types/user';

export const listUsersQuerySchema = Joi.object({
  userGroup: Joi.string().optional(),
  registrationStatus: Joi.string().optional(),
  riskLevel: Joi.string().optional(),
  keyword: Joi.string().max(64).optional(),
});

export const updateUserBodySchema = Joi.object({
  userGroup: Joi.string().max(64).optional(),
  registrationStatus: Joi.string().max(64).optional(),
  riskLevel: Joi.string().max(64).optional(),
  lastLoginAt: Joi.date().iso().allow(null).optional(),
})
  .min(1)
  .required();

export const provisionUserSchema = Joi.object({
  username: Joi.string()
    .trim()
    .min(3)
    .max(64)
    .pattern(/^[a-zA-Z0-9._=+-]+$/)
    .required(),
  displayName: Joi.string().max(128).allow('', null).optional(),
  password: Joi.string().min(12).max(128).optional(),
  generatePassword: Joi.boolean().default(true),
  userGroup: Joi.string().max(64).default('standard'),
  registrationStatus: Joi.string().max(64).default('active'),
  riskLevel: Joi.string().max(64).default('low'),
  forcePasswordReset: Joi.boolean().default(false),
  email: Joi.string().email().optional(),
  msisdn: Joi.string().max(32).optional(),
  joinDefaultRooms: Joi.boolean().default(false),
  sendWelcomeMessage: Joi.boolean().default(false),
}).required();

export const createBanBodySchema = Joi.object({
  banType: Joi.string().valid('silence', 'soft_ban', 'hard_ban').required(),
  reason: Joi.string().max(1024).required(),
  evidence: Joi.object().optional(),
  expiresAt: Joi.date().iso().allow(null).optional(),
}).required();

export const userIdParamSchema = Joi.object({
  synapseUserId: Joi.string().min(3).max(255).required(),
});

/**
 * 用户控制器，负责处理用户相关 API
 */
export class UserController {
  constructor(
    private readonly userService: UserService,
    private readonly banService: BanService
  ) {}

  listUsers = async (req: Request, res: Response): Promise<void> => {
    const filters = req.query as unknown as UserProfileFilter;
    const users = await this.userService.listUsers(filters);
    res.json(users);
  };

  getUserProfile = async (req: Request, res: Response): Promise<void> => {
    const profile = await this.userService.getBySynapseId(req.params.synapseUserId);
    res.json(profile);
  };

  updateUserProfile = async (req: Request, res: Response): Promise<void> => {
    const actorId = this.ensureActor(req);
    const profile = await this.userService.updateProfile(
      req.params.synapseUserId,
      req.body,
      actorId
    );
    res.json(profile);
  };

  provisionUser = async (req: Request, res: Response): Promise<void> => {
    this.ensureSuperAdmin(req);
    const actorId = this.ensureActor(req);
    const result = await this.userService.provisionSynapseUser(req.body, actorId);
    res.status(201).json(result);
  };

  listUserBans = async (req: Request, res: Response): Promise<void> => {
    const bans = await this.banService.listBansForUser(req.params.synapseUserId);
    res.json(bans);
  };

  createBanForUser = async (req: Request, res: Response): Promise<void> => {
    const actorId = this.ensureActor(req);
    const ban = await this.banService.createBanForSynapseUser(
      req.params.synapseUserId,
      req.body,
      actorId
    );
    res.status(201).json(ban);
  };

  private ensureActor(req: Request): string {
    if (!req.user?.id) {
      throw new HttpError(401, '未检测到管理员身份');
    }
    return req.user.id;
  }

  private ensureSuperAdmin(req: Request): void {
    if (!req.user?.roles?.includes('super_admin')) {
      throw new HttpError(403, '仅超级管理员可以创建用户');
    }
  }
}
