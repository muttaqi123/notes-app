import http from 'node:http';
import { createApp } from './app.js';
import { connectDb, disconnectDb } from './config/db.js';
import { attachRealtime } from './realtime/index.js';
import { startJobs } from './jobs/index.js';
import { uploadDir } from './services/attachments.service.js';
import { logger } from './utils/logger.js';
import { env } from './config/env.js';

async function main() {
  await connectDb();
  await uploadDir();

  const app = createApp();
  // An explicit http.Server rather than app.listen(), because Socket.IO has to
  // attach to the same server — one port, and the WebSocket upgrade arrives on
  // the connection the browser already has open.
  const server = http.createServer(app);
  attachRealtime(server);
  const stopJobs = startJobs();

  server.listen(env.port, () => {
    logger.info(`[api] listening on http://localhost:${env.port}`);
    if (env.exposeDocs) logger.info(`[api] docs at http://localhost:${env.port}/api/docs`);
  });

  /**
   * Shut down in the right order: stop taking new work, finish what is in
   * flight, then close the database. A process that exits while a request is
   * mid-write is how half-written data happens.
   */
  const shutdown = async (signal) => {
    logger.info({ signal }, '[api] shutting down');
    stopJobs();
    server.close(async () => {
      await disconnectDb();
      process.exit(0);
    });
    // A connection that will not close must not hold the process open forever.
    setTimeout(() => process.exit(1), 10000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error({ err }, '[api] failed to start');
  process.exit(1);
});
