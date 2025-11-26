import Joi from 'joi';

export const twoFactorStatusParamsSchema = Joi.object({
  synapseUserId: Joi.string().min(3).max(255).required(),
});

export const twoFactorVerificationSchema = Joi.object({
  synapseUserId: Joi.string().min(3).max(255).required(),
  method: Joi.string()
    .valid('email', 'sms', 'totp', 'safety_code', 'secondary_password')
    .required(),
  code: Joi.string().min(4).max(128).required(),
  deviceId: Joi.string().max(255).optional(),
  deviceName: Joi.string().max(255).optional(),
  ipAddress: Joi.string().max(64).optional(),
  trustDevice: Joi.boolean().optional(),
});

export const friendVerificationSchema = Joi.object({
  verifier: Joi.string().min(3).max(255).required(),
  target: Joi.string().min(3).max(255).required(),
  hash: Joi.string().min(6).max(255).required(),
});
