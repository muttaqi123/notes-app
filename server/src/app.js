import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import authRoutes from './routes/auth.routes.js';
import noteRoutes from './routes/notes.routes.js';
import labelRoutes from './routes/labels.routes.js';
import { notFound, errorHandler } from './middleware/error.js';
import { env } from './config/env.js';

/**
 * Builds the Express app without starting a server or touching a database.
 * That separation is what lets the test suite mount the whole API against an
 * in-memory MongoDB and drive it with supertest, no port and no listener.
 */
export function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.use(helmet());
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
  if (!env.isTest) app.use(morgan('dev'));

  app.get('/api/health', (_req, res) =>
    res.json({ ok: true, service: 'keep-notes-api', time: new Date().toISOString() })
  );

  app.use('/api/auth', authRoutes);
  app.use('/api/notes', noteRoutes);
  app.use('/api/labels', labelRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
