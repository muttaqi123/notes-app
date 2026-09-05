import pino from 'pino';
import { env } from '../config/env.js';

/**
 * Structured logging.
 *
 * JSON in production because a log line is data a machine reads — a grep for
 * one request id across a day of traffic only works if the fields are fields.
 * Pretty-printed in development because there the reader is a person.
 */
export const logger = pino({
  level: env.logLevel,
  ...(env.isProd
    ? {}
    : {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
        },
      }),
  redact: {
    // A log that quietly contains credentials is a breach waiting for someone
    // with read access to the log.
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'password',
      'newPassword',
      'currentPassword',
      'accessToken',
      'refreshToken',
      'twoFactorCode',
    ],
    censor: '[redacted]',
  },
});
