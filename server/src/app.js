import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import crypto from 'node:crypto';
import authRoutes from './routes/auth.routes.js';
import noteRoutes from './routes/notes.routes.js';
import labelRoutes from './routes/labels.routes.js';
import miscRoutes from './routes/misc.routes.js';
import { mountDocs } from './docs/openapi.js';
import { notFound, errorHandler } from './middleware/error.js';
import { logger } from './utils/logger.js';
import { env } from './config/env.js';

/**
 * Builds the Express app without starting a server or touching a database.
 *
 * That separation is what lets the test suite mount the whole API against an
 * in-memory MongoDB and drive it with supertest — no port to pick, no race
 * between "the server is starting" and "the test is running", and no way for
 * two test files to collide on a port.
 */
export function createApp() {
  const app = express();

  app.set('trust proxy', 1);

  app.use(
    helmet({
      // Attachments are served from this origin and displayed on another, so
      // the default same-origin resource policy would block every image.
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    })
  );

  app.use(
    cors({
      origin(origin, cb) {
        // No Origin header at all is a same-origin or server-to-server call
        // (curl, health checks), which CORS is not there to police.
        if (!origin || env.corsOrigins.includes(origin)) return cb(null, true);
        return cb(new Error(`Origin ${origin} is not allowed`));
      },
      credentials: true,
    })
  );

  // A note body is capped at 20k characters; 1mb of JSON is already generous.
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  if (!env.isTest) {
    app.use(
      pinoHttp({
        logger,
        // A request id on every line is what makes it possible to follow one
        // request through the log afterwards.
        genReqId: (req) => req.headers['x-request-id'] || crypto.randomUUID(),
        customLogLevel(_req, res, err) {
          if (err || res.statusCode >= 500) return 'error';
          if (res.statusCode >= 400) return 'warn';
          return 'info';
        },
      })
    );
  }

  app.get('/api/health', (_req, res) =>
    res.json({ ok: true, service: 'keep-notes-api', time: new Date().toISOString() })
  );

  // Attachments. `immutable` is safe because the filename is a random UUID —
  // the content behind a given URL can never change, so it can be cached hard.
  app.use(
    '/uploads',
    express.static(env.uploadDir, {
      maxAge: '365d',
      immutable: true,
      index: false,
      dotfiles: 'deny',
    })
  );

  app.use('/api/auth', authRoutes);
  app.use('/api/notes', noteRoutes);
  app.use('/api/labels', labelRoutes);
  app.use('/api', miscRoutes);

  mountDocs(app);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
