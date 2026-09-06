import multer from 'multer';
import { ApiError } from '../utils/ApiError.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

export function notFound(req, _res, next) {
  next(ApiError.notFound(`No route for ${req.method} ${req.originalUrl}`, 'no_route'));
}

/**
 * The single place an error becomes an HTTP response. Everything below this
 * throws; nothing below this writes a status code.
 */
 
export function errorHandler(err, _req, res, _next) {
  if (err instanceof ApiError) {
    const payload = { error: { message: err.message, code: err.code } };
    // A version conflict carries the note as it currently stands, so the
    // client can show both sides instead of just refusing the save.
    if (err.current) payload.current = err.current;
    return res.status(err.status).json(payload);
  }

  if (err instanceof multer.MulterError) {
    const message = err.code === 'LIMIT_FILE_SIZE'
      ? `That image is larger than ${Math.round(env.maxUploadBytes / 1024 / 1024)} MB`
      : 'That upload was not accepted';
    return res.status(400).json({ error: { message, code: err.code } });
  }

  // Mongoose validation and duplicate-key errors are the caller's fault, not
  // the server's, so they must not be reported as a 500.
  if (err?.name === 'ValidationError') {
    return res.status(400).json({
      error: {
        message: Object.values(err.errors).map((e) => e.message).join(', '),
        code: 'invalid',
      },
    });
  }
  if (err?.code === 11000) {
    return res.status(409).json({ error: { message: 'That already exists', code: 'duplicate' } });
  }

  if (!env.isTest) logger.error({ err }, 'unhandled error');
  return res.status(500).json({
    error: {
      message: env.isProd ? 'Something went wrong' : String(err?.message || err),
      code: 'server_error',
    },
  });
}
