import { ApiError } from '../utils/ApiError.js';
import { env } from '../config/env.js';

export function notFound(req, _res, next) {
  next(ApiError.notFound(`No route for ${req.method} ${req.originalUrl}`, 'no_route'));
}

/**
 * The single place an error becomes an HTTP response. Everything below this
 * throws; nothing below this writes a status code.
 */
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, _next) {
  if (err instanceof ApiError) {
    return res.status(err.status).json({ error: { message: err.message, code: err.code } });
  }

  // Mongoose validation and duplicate-key errors are the user's fault, not
  // the server's, so they must not be reported as a 500.
  if (err?.name === 'ValidationError') {
    return res.status(400).json({
      error: { message: Object.values(err.errors).map((e) => e.message).join(', '), code: 'invalid' },
    });
  }
  if (err?.code === 11000) {
    return res.status(409).json({ error: { message: 'That already exists', code: 'duplicate' } });
  }

  if (!env.isTest) console.error('[error]', err);
  return res.status(500).json({
    error: {
      message: env.isProd ? 'Something went wrong' : String(err?.message || err),
      code: 'server_error',
    },
  });
}
