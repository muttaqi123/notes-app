import dotenv from 'dotenv';

dotenv.config();

const isTest = process.env.NODE_ENV === 'test';
const isProd = process.env.NODE_ENV === 'production';

/**
 * A secret must never fall back to a default in production. A development
 * default is a convenience; the same default shipped to production is a
 * published private key, so the process refuses to start without a real one.
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
};
