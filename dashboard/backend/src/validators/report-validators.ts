import Joi from 'joi';

export const botReportSchema = Joi.object({
  reporter: Joi.string().min(3).max(255).required(),
  target: Joi.string().min(3).max(255).required(),
  reason: Joi.string().min(1).max(5000).required(),
  description: Joi.string().max(5000).optional(),
});
