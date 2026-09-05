import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { jest, beforeAll, afterAll, afterEach } from '@jest/globals';

// One in-memory MongoDB for the whole run, wiped between tests. Real Mongo
// semantics — indexes, validation, ObjectIds — with no database to install,
// which is what makes `npm test` work on a clean checkout.
let mongo;

jest.setTimeout(60000);

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri('keep-notes-test'));
});

afterEach(async () => {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});
