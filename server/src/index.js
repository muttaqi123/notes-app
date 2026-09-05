import { createApp } from './app.js';
import { connectDb } from './config/db.js';
import { env } from './config/env.js';

async function main() {
  await connectDb();
  const app = createApp();
  app.listen(env.port, () => {
    console.log(`[api] listening on http://localhost:${env.port}`);
  });
}

main().catch((err) => {
  console.error('[api] failed to start:', err);
  process.exit(1);
});
