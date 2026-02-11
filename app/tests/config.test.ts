const ORIGINAL_ENV = process.env;

const loadConfig = async () => {
  jest.resetModules();
  return import('../config.js');
};

describe('config', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.APP_ENV;
    delete process.env.API_PORT;
    delete process.env.LOG_LEVEL;
    delete process.env.MONGO_URI;
    delete process.env.BATCH_SIZE;
    delete process.env.JOB_LEASE_TTL_MS;
    delete process.env.HISTORICAL_POLL_INTERVAL_MS;
    delete process.env.REALTIME_POLL_INTERVAL_MS;
    delete process.env.ACTIVE_CHAIN;
    delete process.env.RPC_URL;
    delete process.env.CONTRACT_ADDRESS;
    delete process.env.START_POINT;
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('uses default values when env vars are missing', async () => {
    const { appConfig, dbConfig, collectorConfig, activeChain, chainConfig } = await loadConfig();

    expect(appConfig).toEqual({
      env: 'development',
      apiPort: 9999,
      logLevel: 'debug',
    });
    expect(dbConfig.mongoURI).toBe('mongodb://localhost:27017/lf-fee-collector');
    expect(collectorConfig).toEqual({
      batchSize: 100,
      jobLeaseTtlMs: 120000,
      historicalpollIntervalMs: 5000,
      realtimePollIntervalMs: 60000,
    });
    expect(Number.isNaN(activeChain)).toBe(true);
    expect(chainConfig).toEqual({
      rpcUrl: undefined,
      contractAddress: undefined,
      startPoint: undefined,
    });
  });

  it('reads explicit env values', async () => {
    process.env.APP_ENV = 'production';
    process.env.API_PORT = '8080';
    process.env.LOG_LEVEL = 'error';
    process.env.MONGO_URI = 'mongodb://example';
    process.env.BATCH_SIZE = '25';
    process.env.JOB_LEASE_TTL_MS = '9000';
    process.env.HISTORICAL_POLL_INTERVAL_MS = '111';
    process.env.REALTIME_POLL_INTERVAL_MS = '222';
    process.env.ACTIVE_CHAIN = '137';
    process.env.RPC_URL = 'https://rpc';
    process.env.CONTRACT_ADDRESS = '0xabc';
    process.env.START_POINT = '500';

    const { appConfig, dbConfig, collectorConfig, activeChain, chainConfig } = await loadConfig();

    expect(appConfig).toEqual({
      env: 'production',
      apiPort: '8080',
      logLevel: 'error',
    });
    expect(dbConfig.mongoURI).toBe('mongodb://example');
    expect(collectorConfig).toEqual({
      batchSize: 25,
      jobLeaseTtlMs: 9000,
      historicalpollIntervalMs: 111,
      realtimePollIntervalMs: 222,
    });
    expect(activeChain).toBe(137);
    expect(chainConfig).toEqual({
      rpcUrl: 'https://rpc',
      contractAddress: '0xabc',
      startPoint: '500',
    });
  });
});
