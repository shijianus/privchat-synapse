import Joi from 'joi';

export const broadcastAnnouncementSchema = Joi.object({
  channelKey: Joi.string().min(1).max(64).required(),
  title: Joi.string().min(1).max(200).required(),
  content: Joi.string().min(1).max(5000).required(),
  html: Joi.string().max(10000).optional(),
  audience: Joi.array().items(Joi.string().min(3).max(255)).min(1).required(),
});
