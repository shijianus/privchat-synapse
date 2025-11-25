import Joi from 'joi';

export const listAppealsQuerySchema = Joi.object({
  status: Joi.string().valid('pending', 'accepted', 'rejected').optional(),
  synapseUserId: Joi.string().min(3).max(255).optional(),
  limit: Joi.number().integer().min(1).max(200).default(50),
});

export const appealIdParamSchema = Joi.object({
  appealId: Joi.number().integer().positive().required(),
});

export const adminDecisionSchema = Joi.object({
  status: Joi.string().valid('accepted', 'rejected').required(),
  responseMessage: Joi.string().max(4000).allow('').optional(),
});

export const adminMessageSchema = Joi.object({
  body: Joi.string().min(1).max(4000).required(),
});

export const botSubmitAppealSchema = Joi.object({
  synapseUserId: Joi.string().min(3).max(255).required(),
  banId: Joi.number().integer().positive().optional(),
  contactEmail: Joi.string().email().allow(null, '').optional(),
  contactMatrix: Joi.string().max(255).allow(null, '').optional(),
  reason: Joi.string().min(20).max(4000).required(),
  message: Joi.string().min(1).max(4000).allow(null, '').optional(),
});

export const botMessageSchema = Joi.object({
  synapseUserId: Joi.string().min(3).max(255).required(),
  body: Joi.string().min(1).max(4000).required(),
});
