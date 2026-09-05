export default {
  testEnvironment: 'node',
  transform: {},
  testMatch: ['**/tests/**/*.test.js'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  // Generous on purpose: on a fresh checkout mongodb-memory-server downloads
  // the mongod binary inside the first beforeAll, which is slow exactly once
  // and has nothing to do with the code under test.
  testTimeout: 60000,
};
