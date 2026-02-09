import express, { type Express } from 'express';
import { logger } from './utils/logger.js';
import { connectDB, disconnectDB } from './utils/mongo.js';
import { appConfig } from './config.js';

async function main(): Promise<void> {
  await connectDB();

  const app: Express = express();


  app.get('/', (_req, res) => {
    res.status(200).send('Api Running');
  });

  app.listen(appConfig.apiPort, (): void => {
    logger.info(`[API] Listening on port ${appConfig.apiPort}`);
    logger.info(`[API] Environment: ${appConfig.env}`);
  });
}

main().catch((err) => {
  logger.error(`[API] ${err.message}`);
  process.exit(1);
});

process.on('SIGINT', async () => {
  await disconnectDB();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await disconnectDB();
  process.exit(0);
});


