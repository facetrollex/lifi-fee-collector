import { appConfig } from '../../config.js';
import { logger } from '../../utils/logger.js';

describe('logger', () => {
  it('uses app log level and console transport', () => {
    expect(logger.level).toBe(appConfig.logLevel);
    expect(logger.transports.length).toBeGreaterThan(0);
    expect(logger.transports[0]?.name).toBe('console');
  });
});
