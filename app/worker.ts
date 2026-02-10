import { logger } from './utils/logger.js';
import { connectDB, disconnectDB } from './utils/mongo.js';
import { activeChain } from './config.js';
import { Collector } from './fee-collector/collector.js';
import { sleep } from './utils/helpers.js';

const workerId = `Worker ${process.pid}`;

async function main(): Promise<void> {
  await connectDB(workerId);

  logger.info(`[${workerId}] is started.`);

  const collector: Collector = new Collector(workerId, activeChain);

  await collector.testConnection();
  await collector.seedCursor();

  while (true) {
    const didWork = await collector.collect();

    if (!didWork) {
      logger.info(`[${workerId}] Nothing to do this iteration.`); 
    }

    const pollIntervalMs = collector.getPollIntervalMs();
    logger.info(`[${workerId}] Idle for ${pollIntervalMs}ms (${collector.getMode()} mode)`);
    await sleep(pollIntervalMs);
  }
}

main().catch(async (err) => {
  logger.error(`[${workerId}] Critical error, shutting down.`);
  logger.error(err);
  await disconnectDB(workerId);
  process.exit(1);
});

process.on('SIGINT', async () => {
  await disconnectDB(workerId);
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await disconnectDB(workerId);
  process.exit(0);
});

process.on('uncaughtException', async (err) => {
  logger.error(err);
  await disconnectDB(workerId);
  process.exit(1);
});

process.on('unhandledRejection', async (err) => {
  logger.error(err);
  await disconnectDB(workerId);
  process.exit(1);
});
