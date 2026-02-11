import express from 'express';
import { logger } from './utils/logger.js';
import { connectDB, disconnectDB } from './utils/mongo.js';
import { appConfig } from './config.js';
import { findFeeEvents } from './repositories/FeeEvent.js';
import { parseFeesQuery, INTERNAL_SERVER_ERROR } from './api/feesQuery.js';
import { toErrorMessage } from './utils/helpers.js';

const registerProcessHandlers = (): void => {
  const gracefulShutdown = async (): Promise<void> => {
    await disconnectDB();
    process.exit(0);
  };

  process.on('SIGINT', gracefulShutdown);
  process.on('SIGTERM', gracefulShutdown);
};

async function main(): Promise<void> {
  await connectDB();

  const app = express();

  app.get('/', (_req, res) => {
    res.status(200).send('Api Running');
  });

  app.get('/fees', async (req, res) => {
    try {
      const parsedQuery = parseFeesQuery(req.query);

      if (!parsedQuery.ok) {
        return res.status(400).json({ error: parsedQuery.error });
      }

      const { chainId, page, limit, skip } = parsedQuery.value;

      const { data, total } = await findFeeEvents(chainId, skip, limit);

      res.json({
        data,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      logger.error(error);
      res.status(500).json({ error: INTERNAL_SERVER_ERROR });
    }
  });

  app.listen(appConfig.apiPort, (): void => {
    logger.info(`[API] Listening on port ${appConfig.apiPort}`);
    logger.info(`[API] Environment: ${appConfig.env}`);
  });
}


registerProcessHandlers();

main().catch((error) => {
  logger.error(`[API] ${toErrorMessage(error)}`);
  process.exit(1);
});


