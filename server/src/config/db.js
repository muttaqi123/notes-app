import mongoose from 'mongoose';
import { env } from './env.js';

let memoryServer = null;

/**
 * Connect to MongoDB.
 *
 * With MONGODB_URI set we connect to that (a local mongod, or Atlas in
 * production). With it empty in development we start an in-memory MongoDB
 * instead, so `npm run dev` works on a machine with no database installed.
 * Production refuses that fallback — an in-memory database silently losing
 * every note on restart is not something to discover in production.
 */
export async function connectDb(uri = env.mongoUri) {
  mongoose.set('strictQuery', true);

  let target = uri;
  if (!target) {
    if (env.isProd) {
      throw new Error('MONGODB_URI is required in production');
    }
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    memoryServer = await MongoMemoryServer.create();
    target = memoryServer.getUri('keep-notes');
    console.log('[db] no MONGODB_URI set — started an in-memory MongoDB');
  }

  await mongoose.connect(target);
  return mongoose.connection;
}

export async function disconnectDb() {
  await mongoose.disconnect();
  if (memoryServer) {
    await memoryServer.stop();
    memoryServer = null;
  }
}
