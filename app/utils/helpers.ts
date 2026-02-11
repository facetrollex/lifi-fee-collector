import { logger } from './logger.js';
import { connectDB, testDBConnection } from './mongo.js';

const toErrorMessage = (error: unknown): string => {
  return error instanceof Error ? error.message : String(error);
};

// Retry function which is used for database related operations.
async function withRetry<T>(
    fn: () => Promise<T>,
    entity: string,
    maxAttempts: number = 3,
    delayMs: number = 2000,
  ): Promise<T> {
    let connection = false;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {

        if(attempt > 1) {
          logger.debug(`[${entity}] Processing retry ${attempt} of ${maxAttempts}.`);
          connection = await testDBConnection();
          if(!connection) {
            logger.debug(`[${entity}] Database connection lost, reconnecting...`);
            await connectDB(entity);
          }
        }
        
        return await fn();
      } catch (err) {
        if (attempt === maxAttempts) {
            logger.error(
                `[${entity}] Retry failed after ${maxAttempts} attempts. Error: ${toErrorMessage(err)}`
            );
            throw err;
        }
        await new Promise((r) => setTimeout(r, delayMs * attempt)); // linear backoff: 2,4,6 secs
      }
    }
    throw new Error('unreachable');
};

async function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export { 
    toErrorMessage,
    withRetry, 
    sleep 
};