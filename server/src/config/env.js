import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config();

const isTest = process.env.NODE_ENV === 'test';
const isProd = process.env.NODE_ENV === 'production';

/**
 * A secret must never fall back to a default in production. A development
 * default is a convenience; the same default shipped to production is a
 * published private key, so the process refuses to start without a real one.
 *
 * This check lives in code rather than in a deployment file on purpose. A
 * `render.yaml` only applies to a service created from a Blueprint — a service
 * created by hand in the dashboard ignores it entirely, and a security default
 * that depends on remembering a file is not a default at all.
 */
function secret(name, devFallback) {
  const value = process.env[name];
  if (value) return value;
  if (isProd) {
    throw new Error(`${name} must be set in production`);
  }
  return devFallback;
}

export const env = {
  isTest,
  isProd,
  port: Number(process.env.PORT || 4000),
  mongoUri: process.env.MONGODB_URI || '',

  accessSecret: secret('JWT_ACCESS_SECRET', 'dev-access-secret'),
  refreshSecret: secret('JWT_REFRESH_SECRET', 'dev-refresh-secret'),
  accessTtl: process.env.ACCESS_TOKEN_TTL || '15m',
  refreshTtlDays: Number(process.env.REFRESH_TOKEN_TTL_DAYS || 30),

  corsOrigins: (process.env.CORS_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),

  // Where re-encoded attachments land. Relative paths resolve from the server
  // package root so the value means the same thing whatever the working
  // directory happens to be.
  uploadDir: path.resolve(
    process.cwd(),
    process.env.UPLOAD_DIR || 'uploads'
  ),
  maxUploadBytes: Number(process.env.MAX_UPLOAD_BYTES || 8 * 1024 * 1024),

  // How often the reminder sweep runs, and how long the trash is kept.
  reminderIntervalSeconds: Number(process.env.REMINDER_INTERVAL_SECONDS || 30),
  trashRetentionDays: Number(process.env.TRASH_RETENTION_DAYS || 30),
  // Background jobs are off under test: a timer firing between assertions is
  // a flake nobody enjoys chasing.
  jobsEnabled: process.env.ENABLE_JOBS !== 'false' && !isTest,

  // The API reference is genuinely useful and also a map of the whole surface,
  // so it is opt-in in production rather than opt-out — forgetting the
  // variable leaves it off, which is the safe direction to fail.
  exposeDocs: isProd ? process.env.EXPOSE_API_DOCS === 'true' : true,

  logLevel: process.env.LOG_LEVEL || (isTest ? 'silent' : 'info'),

  // Sign-ins and registrations allowed per IP per 15 minutes. Configurable
  // because an end-to-end run registers a fresh account per test and will
  // otherwise trip a limit meant for people, not for suites — and raising it
  // for a test environment is honest, where switching it off would mean the
  // path under test is not the path that ships.
  authRateLimit: Number(process.env.AUTH_RATE_LIMIT || 30),
};
