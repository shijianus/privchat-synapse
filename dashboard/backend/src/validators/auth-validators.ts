import Joi from 'joi';

export const registerAdminSchema = Joi.object({
  email: Joi.string().email().max(255).required(),
  password: Joi.string()
    .min(12)
    .max(128)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/)
    .required(),
  fullName: Joi.string().min(2).max(100).required(),
  role: Joi.string().valid('super_admin', 'admin', 'moderator', 'operator', 'viewer').optional(),
});

export const loginSchema = Joi.object({
  email: Joi.string().email().max(255).required(),
  password: Joi.string().min(8).max(128).required(),
});

export const refreshTokenSchema = Joi.object({
  refreshToken: Joi.string().min(20).required(),
});
