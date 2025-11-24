import { NextFunction, Request, Response } from 'express';
import Joi, { ObjectSchema } from 'joi';

import { HttpError } from '../utils/http-error';

type RequestSource = 'body' | 'query' | 'params';

const runValidation =
  (schema: ObjectSchema, source: RequestSource) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    const { value, error } = schema.validate(req[source], {
      abortEarly: false,
      allowUnknown: false,
      stripUnknown: true,
    });

    if (error) {
      next(new HttpError(400, '请求参数校验失败', error.details));
      return;
    }

    (req as Request)[source] = value;
    next();
  };

export const validateBody = (schema: ObjectSchema) => runValidation(schema, 'body');
export const validateQuery = (schema: ObjectSchema) => runValidation(schema, 'query');
export const validateParams = (schema: ObjectSchema) => runValidation(schema, 'params');
