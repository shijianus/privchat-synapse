/**
 * 自定义 HTTP 错误，方便在业务层抛出明确状态码
 */
export class HttpError extends Error {
  readonly statusCode: number;
  readonly details?: unknown;

  constructor(statusCode: number, message: string, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export const createNotFoundError = (message: string): HttpError =>
  new HttpError(404, message);

export const createBadRequestError = (message: string, details?: unknown): HttpError =>
  new HttpError(400, message, details);
