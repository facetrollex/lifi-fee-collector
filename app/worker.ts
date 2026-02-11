import { logger } from './utils/logger.js';
import { connectDB, disconnectDB } from './utils/mongo.js';
import { activeChain } from './config.js';
import { Collector } from './fee-collector/collector.js';
import { sleep } from './utils/helpers.js';

const workerId = `Worker ${process.pid}`;

const shutdown = async (exitCode: number): Promise<void> => {
  await disconnectDB(workerId);
  process.exit(exitCode);
};

const registerProcessHandlers = (): void => {
  process.on('SIGINT', async () => {
    await shutdown(0);
  });

  process.on('SIGTERM', async () => {
    await shutdown(0);
  });

  process.on('uncaughtException', async (error) => {
    logger.error(error);
    await shutdown(1);
  });

  process.on('unhandledRejection', async (error) => {
    logger.error(error);
    await shutdown(1);
  });
};

async function main(): Promise<void> {
  await connectDB(workerId);

  logger.info(`[${workerId}] is started.`);

  const collector = new Collector(workerId, activeChain);

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
  await shutdown(1);
});

registerProcessHandlers();
