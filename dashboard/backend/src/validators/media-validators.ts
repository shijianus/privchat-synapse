import Joi from 'joi';

export const mediaHashParamSchema = Joi.object({
  mediaHash: Joi.string()
    .pattern(/^[a-fA-F0-9]{32,128}$/)
    .required(),
});

export const listMediaQuerySchema = Joi.object({
  mediaHash: Joi.string()
    .pattern(/^[a-fA-F0-9]{32,128}$/)
    .optional(),
  uploaderId: Joi.string().max(255).optional(),
  roomId: Joi.string().max(255).optional(),
  contentType: Joi.string().max(255).optional(),
  limit: Joi.number().integer().min(1).max(200).default(50),
  offset: Joi.number().integer().min(0).default(0),
});

export const uploadMediaSchema = Joi.object({
  mediaHash: Joi.string()
    .pattern(/^[a-fA-F0-9]{32,128}$/)
    .required(),
  uploaderId: Joi.string().max(255).required(),
  roomId: Joi.string().max(255).allow(null, '').optional(),
  contentType: Joi.string().max(255).allow(null, '').optional(),
  sizeBytes: Joi.number().integer().min(0).allow(null).optional(),
  coolingPeriodHours: Joi.number().integer().min(1).max(24 * 30).optional(),
});

export const createSyncTaskSchema = Joi.object({
  policyId: Joi.number().integer().positive().allow(null).optional(),
  taskType: Joi.string().min(3).max(64).required(),
  queuedFiles: Joi.number().integer().min(0).optional(),
});

export const syncTaskParamSchema = Joi.object({
  taskId: Joi.number().integer().positive().required(),
});
