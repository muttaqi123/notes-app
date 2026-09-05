import { ApiError } from '../utils/ApiError.js';

/**
 * Validate a request body against a zod schema at the edge, so no unchecked
 * shape ever reaches a service. Replaces req.body with the parsed value, which
 * means unknown keys are stripped rather than silently carried inward.
 */
export function validate(schema) {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const message = result.error.issues
        .map((i) => `${i.path.join('.') || 'body'}: ${i.message}`)
        .join('; ');
      return next(ApiError.badRequest(message, 'invalid'));
    }
    req.body = result.data;
    return next();
  };
}
