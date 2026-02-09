import { logger } from './logger.js';

async function withRetry<T>(
    fn: () => Promise<T>,
    maxAttempts: number = 3,
    delayMs: number = 2000,
  ): Promise<T> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (err) {
        if (attempt === maxAttempts) {
            logger.error(`Retry failed after ${maxAttempts} attempts. Error: ${err}`);
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
    withRetry, 
    sleep 
};