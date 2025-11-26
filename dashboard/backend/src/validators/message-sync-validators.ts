import Joi from 'joi';

export const pendingMessageQuerySchema = Joi.object({
  synapseUserId: Joi.string().min(3).max(255).optional(),
  roomId: Joi.string().min(3).max(255).optional(),
  senderMatrixId: Joi.string().min(3).max(255).optional(),
  synced: Joi.boolean().optional(),
});

export const messageIdParamSchema = Joi.object({
  messageId: Joi.number().integer().positive().required(),
});

export const messageSyncActionBodySchema = Joi.object({
  reason: Joi.string().max(512).optional(),
});
