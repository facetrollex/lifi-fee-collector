import { flushPromises, mockProcessHandlersAndExit, resolveModulePath } from '../helpers/testUtils.js';

type WorkerLoadOptions = {
  activeChain?: number;
  connectDBMock?: jest.Mock;
  disconnectDBMock?: jest.Mock;
  collectorInstance?: {
    testConnection: jest.Mock;
    seedCursor: jest.Mock;
    collect: jest.Mock;
    getPollIntervalMs: jest.Mock;
    getMode: jest.Mock;
  };
  sleepMock?: jest.Mock;
};

const loadWorkerModule = async (options: WorkerLoadOptions = {}) => {
  jest.resetModules();

  const connectDBMock = options.connectDBMock ?? jest.fn().mockResolvedValue(undefined);
  const disconnectDBMock = options.disconnectDBMock ?? jest.fn().mockResolvedValue(undefined);
  const sleepMock =
    options.sleepMock ??
    jest.fn().mockResolvedValue(undefined);

  const collectorInstance = options.collectorInstance ?? {
    testConnection: jest.fn().mockResolvedValue(undefined),
    seedCursor: jest.fn().mockResolvedValue(undefined),
    collect: jest.fn().mockImplementation(() => new Promise(() => undefined)),
    getPollIntervalMs: jest.fn().mockReturnValue(1000),
    getMode: jest.fn().mockReturnValue('historical'),
  };
  const CollectorMock = jest.fn().mockImplementation(() => collectorInstance);

  const logger = {
    info: jest.fn(),
    error: jest.fn(),
  };

  const processMock = mockProcessHandlersAndExit();

  const loggerModulePath = resolveModulePath(import.meta.url, '../../utils/logger.ts');
  const mongoModulePath = resolveModulePath(import.meta.url, '../../utils/mongo.ts');
  const configModulePath = resolveModulePath(import.meta.url, '../../config.ts');
  const collectorModulePath = resolveModulePath(import.meta.url, '../../fee-collector/collector.ts');
  const helpersModulePath = resolveModulePath(import.meta.url, '../../utils/helpers.ts');

  jest.unstable_mockModule(loggerModulePath, () => ({ logger }));
  jest.unstable_mockModule(mongoModulePath, () => ({
    connectDB: connectDBMock,
    disconnectDB: disconnectDBMock,
    testDBConnection: jest.fn(),
  }));
  jest.unstable_mockModule(configModulePath, () => ({
    activeChain: options.activeChain ?? 137,
  }));
  jest.unstable_mockModule(collectorModulePath, () => ({
    Collector: CollectorMock,
  }));
  jest.unstable_mockModule(helpersModulePath, () => ({
    sleep: sleepMock,
  }));

  await import('../../worker.js');
  await flushPromises();

  return {
    connectDBMock,
    disconnectDBMock,
    CollectorMock,
    collectorInstance,
    sleepMock,
    logger,
    processHandlers: processMock.handlers,
    processOnSpy: processMock.onSpy,
    processExitSpy: processMock.exitSpy,
  };
};

describe('worker entrypoint', () => {
  it('boots worker and initializes collector with active chain', async () => {
    const loaded = await loadWorkerModule();
    const expectedWorkerId = `Worker ${process.pid}`;

    expect(loaded.connectDBMock).toHaveBeenCalledWith(expectedWorkerId);
    expect(loaded.CollectorMock).toHaveBeenCalledWith(expectedWorkerId, 137);
    expect(loaded.collectorInstance.testConnection).toHaveBeenCalledTimes(1);
    expect(loaded.collectorInstance.seedCursor).toHaveBeenCalledTimes(1);
  });

  it('logs idle message when no work is found', async () => {
    const loaded = await loadWorkerModule({
      collectorInstance: {
        testConnection: jest.fn().mockResolvedValue(undefined),
        seedCursor: jest.fn().mockResolvedValue(undefined),
        collect: jest.fn().mockResolvedValue(false),
        getPollIntervalMs: jest.fn().mockReturnValue(50),
        getMode: jest.fn().mockReturnValue('historical'),
      },
      sleepMock: jest.fn().mockRejectedValue(new Error('stop loop')),
    });
    const expectedWorkerId = `Worker ${process.pid}`;

    expect(loaded.logger.info).toHaveBeenCalledWith(`[${expectedWorkerId}] Nothing to do this iteration.`);
    expect(loaded.logger.info).toHaveBeenCalledWith(
      `[${expectedWorkerId}] Idle for 50ms (historical mode)`,
    );
    expect(loaded.processExitSpy).toHaveBeenCalledWith(1);
  });

  it('skips the empty-work log when a batch was processed', async () => {
    const loaded = await loadWorkerModule({
      collectorInstance: {
        testConnection: jest.fn().mockResolvedValue(undefined),
        seedCursor: jest.fn().mockResolvedValue(undefined),
        collect: jest.fn().mockResolvedValue(true),
        getPollIntervalMs: jest.fn().mockReturnValue(25),
        getMode: jest.fn().mockReturnValue('realtime'),
      },
      sleepMock: jest.fn().mockRejectedValue(new Error('stop loop')),
    });
    const expectedWorkerId = `Worker ${process.pid}`;

    expect(loaded.logger.info).not.toHaveBeenCalledWith(
      `[${expectedWorkerId}] Nothing to do this iteration.`,
    );
    expect(loaded.logger.info).toHaveBeenCalledWith(
      `[${expectedWorkerId}] Idle for 25ms (realtime mode)`,
    );
  });

  it('handles startup failure and exits with code 1', async () => {
    const loaded = await loadWorkerModule({
      connectDBMock: jest.fn().mockRejectedValue(new Error('db down')),
    });
    const expectedWorkerId = `Worker ${process.pid}`;

    expect(loaded.logger.error).toHaveBeenNthCalledWith(
      1,
      `[${expectedWorkerId}] Critical error, shutting down.`,
    );
    expect(loaded.disconnectDBMock).toHaveBeenCalledWith(expectedWorkerId);
    expect(loaded.processExitSpy).toHaveBeenCalledWith(1);
  });

  it('handles SIGINT and SIGTERM by disconnecting and exiting 0', async () => {
    const loaded = await loadWorkerModule();

    await loaded.processHandlers.SIGINT?.();
    await loaded.processHandlers.SIGTERM?.();

    expect(loaded.disconnectDBMock).toHaveBeenCalledTimes(2);
    expect(loaded.processExitSpy).toHaveBeenNthCalledWith(1, 0);
    expect(loaded.processExitSpy).toHaveBeenNthCalledWith(2, 0);
  });

  it('handles uncaughtException and unhandledRejection by exiting 1', async () => {
    const loaded = await loadWorkerModule();

    await loaded.processHandlers.uncaughtException?.(new Error('boom'));
    await loaded.processHandlers.unhandledRejection?.(new Error('reject'));

    expect(loaded.logger.error).toHaveBeenCalledTimes(2);
    expect(loaded.disconnectDBMock).toHaveBeenCalledTimes(2);
    expect(loaded.processExitSpy).toHaveBeenNthCalledWith(1, 1);
    expect(loaded.processExitSpy).toHaveBeenNthCalledWith(2, 1);
    expect(loaded.processOnSpy).toHaveBeenCalledTimes(4);
  });
});
