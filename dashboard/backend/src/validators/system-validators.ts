import Joi from 'joi';

export const updateSystemConfigSchema = Joi.object({
  registrationMode: Joi.string().valid('disabled', 'email', 'sms', 'email_and_sms').optional(),
  autoApproveRegistrations: Joi.boolean().optional(),
  requireCaptcha: Joi.boolean().optional(),
  mediaCoolingHours: Joi.number().integer().min(1).max(24 * 30).optional(),
  maintenanceMode: Joi.boolean().optional(),
}).min(1);
