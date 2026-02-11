import { BigNumber } from 'ethers';
import { resolveModulePath } from '../helpers/testUtils.js';

type CollectorSetupOptions = {
  chainConfig?: {
    rpcUrl?: string;
    contractAddress?: string;
    startPoint?: string;
  };
  claimExpiredOrFailedMock?: jest.Mock;
  claimNextRangeMock?: jest.Mock;
  createJobMock?: jest.Mock;
  upsertFeeEventsMock?: jest.Mock;
  markCompletedMock?: jest.Mock;
  markFailedMock?: jest.Mock;
  seedCursorMock?: jest.Mock;
  withRetryMock?: jest.Mock;
  rpcClient?: {
    loadFeeCollectorEvents: jest.Mock;
    parseFeeCollectorEvents: jest.Mock;
    testConnection: jest.Mock;
    getMaxBlock: jest.Mock;
  };
};

const loadCollector = async (options: CollectorSetupOptions = {}) => {
  jest.resetModules();

  const logger = {
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  };

  const config = {
    collectorConfig: {
      batchSize: 10,
      jobLeaseTtlMs: 60_000,
      historicalpollIntervalMs: 5_000,
      realtimePollIntervalMs: 60_000,
    },
    chainConfig: {
      rpcUrl: 'https://rpc.example',
      contractAddress: '0x0000000000000000000000000000000000000001',
      startPoint: '100',
      ...(options.chainConfig ?? {}),
    },
  };

  const rpcClient = options.rpcClient ?? {
    loadFeeCollectorEvents: jest.fn().mockResolvedValue([]),
    parseFeeCollectorEvents: jest.fn().mockResolvedValue([]),
    testConnection: jest.fn().mockResolvedValue(undefined),
    getMaxBlock: jest.fn().mockResolvedValue(200),
  };

  const mocks = {
    seedCursor: options.seedCursorMock ?? jest.fn().mockResolvedValue(undefined),
    claimNextRange: options.claimNextRangeMock ?? jest.fn().mockResolvedValue(null),
    createJob: options.createJobMock ?? jest.fn(),
    claimExpiredOrFailed: options.claimExpiredOrFailedMock ?? jest.fn().mockResolvedValue(null),
    markCompleted: options.markCompletedMock ?? jest.fn().mockResolvedValue(undefined),
    markFailed: options.markFailedMock ?? jest.fn().mockResolvedValue(undefined),
    upsertFeeEvents: options.upsertFeeEventsMock ?? jest.fn().mockResolvedValue(0),
    withRetry:
      options.withRetryMock ??
      jest.fn(async (fn: () => Promise<unknown>) => {
        return await fn();
      }),
    Rpc: jest.fn().mockImplementation(() => rpcClient),
  };

  const loggerModulePath = resolveModulePath(import.meta.url, '../../utils/logger.ts');
  const configModulePath = resolveModulePath(import.meta.url, '../../config.ts');
  const rpcModulePath = resolveModulePath(import.meta.url, '../../utils/rpc.ts');
  const lastBlockModulePath = resolveModulePath(import.meta.url, '../../repositories/LastBlock.ts');
  const blockJobModulePath = resolveModulePath(import.meta.url, '../../repositories/BlockJob.ts');
  const feeEventModulePath = resolveModulePath(import.meta.url, '../../repositories/FeeEvent.ts');
  const helpersModulePath = resolveModulePath(import.meta.url, '../../utils/helpers.ts');

  jest.unstable_mockModule(loggerModulePath, () => ({ logger }));
  jest.unstable_mockModule(configModulePath, () => ({
    collectorConfig: config.collectorConfig,
    chainConfig: config.chainConfig,
  }));
  jest.unstable_mockModule(rpcModulePath, () => ({ Rpc: mocks.Rpc }));
  jest.unstable_mockModule(lastBlockModulePath, () => ({
    seedCursor: mocks.seedCursor,
    claimNextRange: mocks.claimNextRange,
  }));
  jest.unstable_mockModule(blockJobModulePath, () => ({
    createJob: mocks.createJob,
    claimExpiredOrFailed: mocks.claimExpiredOrFailed,
    markCompleted: mocks.markCompleted,
    markFailed: mocks.markFailed,
  }));
  jest.unstable_mockModule(feeEventModulePath, () => ({
    upsertFeeEvents: mocks.upsertFeeEvents,
  }));
  jest.unstable_mockModule(helpersModulePath, () => ({
    withRetry: mocks.withRetry,
  }));

  const { Collector } = await import('../../fee-collector/collector.js');
  return { Collector, mocks, rpcClient };
};

describe('Collector', () => {
  it('throws when required chain config values are missing', async () => {
    const { Collector } = await loadCollector({
      chainConfig: { rpcUrl: undefined, contractAddress: undefined, startPoint: undefined },
    });
    expect(() => new Collector('Worker-1', 137)).toThrow('Invalid chain config');
  });

  it('throws when start point is not numeric', async () => {
    const { Collector } = await loadCollector({
      chainConfig: { startPoint: 'abc' },
    });
    expect(() => new Collector('Worker-1', 137)).toThrow('START_POINT must be a number');
  });

  it('seeds cursor through retry wrapper', async () => {
    const { Collector, mocks } = await loadCollector();
    const collector = new Collector('Worker-1', 137);

    await collector.seedCursor();

    expect(mocks.withRetry).toHaveBeenCalledTimes(1);
    expect(mocks.seedCursor).toHaveBeenCalledWith(137, 100);
  });

  it('delegates testConnection to rpc client', async () => {
    const { Collector, rpcClient } = await loadCollector();
    const collector = new Collector('Worker-1', 137);

    await collector.testConnection();
    expect(rpcClient.testConnection).toHaveBeenCalledWith(137);
  });

  it('returns false and switches to realtime mode when no range is available', async () => {
    const { Collector } = await loadCollector({
      claimExpiredOrFailedMock: jest.fn().mockResolvedValue(null),
      claimNextRangeMock: jest.fn().mockResolvedValue(null),
    });
    const collector = new Collector('Worker-1', 137);

    await expect(collector.collect()).resolves.toBe(false);
    expect(collector.getMode()).toBe('realtime');
  });

  it('retries an already claimed job before fetching new ranges', async () => {
    const job = { _id: 'existing-job', fromBlock: 10, toBlock: 20, attempts: 2 };
    const claimExpiredOrFailedMock = jest.fn().mockResolvedValue(job);
    const createJobMock = jest.fn();
    const { Collector, mocks } = await loadCollector({
      claimExpiredOrFailedMock,
      createJobMock,
      upsertFeeEventsMock: jest.fn().mockResolvedValue(0),
    });
    const collector = new Collector('Worker-1', 137);

    await expect(collector.collect()).resolves.toBe(true);
    expect(mocks.claimExpiredOrFailed).toHaveBeenCalledTimes(1);
    expect(mocks.createJob).not.toHaveBeenCalled();
  });

  it('processes a claimed range and marks job completed', async () => {
    const job = { _id: 'job-1', fromBlock: 100, toBlock: 109, attempts: 1 };
    const { Collector, mocks } = await loadCollector({
      claimExpiredOrFailedMock: jest.fn().mockResolvedValue(null),
      claimNextRangeMock: jest.fn().mockResolvedValue({ fromBlock: 100, toBlock: 109 }),
      createJobMock: jest.fn().mockResolvedValue(job),
      rpcClient: {
        loadFeeCollectorEvents: jest
          .fn()
          .mockResolvedValue([{ transactionHash: '0xhash', logIndex: 0, blockNumber: 100 }]),
        parseFeeCollectorEvents: jest.fn().mockResolvedValue([
          {
            transactionHash: '0xhash',
            logIndex: 0,
            blockNumber: 100,
            token: '0x0000000000000000000000000000000000000001',
            integrator: '0x0000000000000000000000000000000000000002',
            integratorFee: BigNumber.from(1),
            lifiFee: BigNumber.from(2),
          },
        ]),
        testConnection: jest.fn(),
        getMaxBlock: jest.fn().mockResolvedValue(130),
      },
      upsertFeeEventsMock: jest.fn().mockResolvedValue(1),
      markCompletedMock: jest.fn().mockResolvedValue(undefined),
    });
    const collector = new Collector('Worker-1', 137);

    await expect(collector.collect()).resolves.toBe(true);
    expect(mocks.upsertFeeEvents).toHaveBeenCalledWith(137, expect.any(Array));
    expect(mocks.markCompleted).toHaveBeenCalledWith('job-1');
  });

  it('marks job as failed and returns false when processing fails', async () => {
    const { Collector, mocks } = await loadCollector({
      claimExpiredOrFailedMock: jest.fn().mockResolvedValue({
        _id: 'job-failed',
        fromBlock: 5,
        toBlock: 6,
        attempts: 3,
      }),
      rpcClient: {
        loadFeeCollectorEvents: jest.fn().mockRejectedValue(new Error('rpc down')),
        parseFeeCollectorEvents: jest.fn(),
        testConnection: jest.fn(),
        getMaxBlock: jest.fn(),
      },
    });
    const collector = new Collector('Worker-1', 137);

    await expect(collector.collect()).resolves.toBe(false);
    expect(mocks.markFailed).toHaveBeenCalledWith('job-failed', 'rpc down');
  });

  it('converts non-Error failures to strings when no job exists yet', async () => {
    const { Collector } = await loadCollector({
      withRetryMock: jest.fn().mockRejectedValue('broken'),
    });
    const collector = new Collector('Worker-1', 137);

    await expect(collector.collect()).resolves.toBe(true);
  });

  it('switches poll interval by mode transitions', async () => {
    const { Collector } = await loadCollector();
    const collector = new Collector('Worker-1', 137);

    expect(collector.getPollIntervalMs()).toBe(5000);
    (collector as unknown as { updateModeByLag: (lagBlocks: number) => void }).updateModeByLag(5);
    expect(collector.getMode()).toBe('realtime');
    expect(collector.getPollIntervalMs()).toBe(60000);
    (collector as unknown as { updateModeByLag: (lagBlocks: number) => void }).updateModeByLag(50);
    expect(collector.getMode()).toBe('historical');
  });

  it('keeps mode unchanged when setting current mode again', async () => {
    const { Collector } = await loadCollector();
    const collector = new Collector('Worker-1', 137);

    (collector as unknown as { changeMode: (mode: 'historical' | 'realtime') => void }).changeMode(
      'historical',
    );
    expect(collector.getMode()).toBe('historical');
  });
});
