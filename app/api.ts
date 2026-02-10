import express, { type Express } from 'express';
import { logger } from './utils/logger.js';
import { connectDB, disconnectDB } from './utils/mongo.js';
import { appConfig } from './config.js';
import { findFeeEvents } from './repositories/FeeEvent.js';

async function main(): Promise<void> {
  await connectDB();

  const app: Express = express();


  app.get('/', (_req, res) => {
    res.status(200).send('Api Running');
  });

  app.get('/fees', async (req, res) => {
    try {
      const integratorParam = req.query.integrator as string | undefined;
      const chainId = integratorParam ? Number(integratorParam) : 137;

      if (Number.isNaN(chainId)) {
        res.status(400).json({ error: 'Invalid integrator value. Expected numeric chain id.' });
        return;
      }

      const page = Math.max(Number(req.query.page) || 1, 1);
      const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
      const skip = (page - 1) * limit;

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
    } catch (err) {
      logger.error(err);
      res.status(500).json({ error: 'Internal server error' });
    }
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


