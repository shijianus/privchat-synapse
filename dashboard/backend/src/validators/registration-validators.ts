import Joi from 'joi';

const blacklistType = Joi.string().valid(
  'username',
  'email',
  'msisdn',
  'ip_address',
  'device_fingerprint'
);

export const listRegistrationsQuerySchema = Joi.object({
  status: Joi.string().valid('pending', 'approved', 'rejected').optional(),
  keyword: Joi.string().max(128).optional(),
  limit: Joi.number().integer().min(1).max(200).default(50),
  offset: Joi.number().integer().min(0).default(0),
});

export const applicationIdParamSchema = Joi.object({
  applicationId: Joi.number().integer().positive().required(),
});

export const registrationApproveSchema = Joi.object({
  reviewerNote: Joi.string().max(1024).allow('', null).optional(),
  synapseUserId: Joi.string().max(255).optional(),
});

export const registrationRejectSchema = Joi.object({
  reviewerNote: Joi.string().min(3).max(1024).required(),
  blacklistTypes: Joi.array().items(blacklistType).max(5).optional(),
  blacklistExpiresAt: Joi.date().iso().optional(),
});

export const listBlacklistQuerySchema = Joi.object({
  type: blacklistType.optional(),
  value: Joi.string().max(255).optional(),
  limit: Joi.number().integer().min(1).max(200).default(50),
  offset: Joi.number().integer().min(0).default(0),
});

export const blacklistEntrySchema = Joi.object({
  type: blacklistType.required(),
  value: Joi.string().min(2).max(255).required(),
  reason: Joi.string().max(512).allow('', null).optional(),
  expiresAt: Joi.date().iso().allow(null).optional(),
});

export const blacklistEntryIdParamSchema = Joi.object({
  entryId: Joi.number().integer().positive().required(),
});
