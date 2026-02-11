import { resolveModulePath } from '../helpers/testUtils.js';

type HelperModuleMocks = {
  connectDBMock: jest.Mock;
  testDBConnectionMock: jest.Mock;
  logger: {
    debug: jest.Mock;
    error: jest.Mock;
  };
};

const loadHelpers = async (
  overrides: Partial<Pick<HelperModuleMocks, 'connectDBMock' | 'testDBConnectionMock'>> = {},
) => {
  jest.resetModules();

  const connectDBMock = overrides.connectDBMock ?? jest.fn().mockResolvedValue(undefined);
  const testDBConnectionMock = overrides.testDBConnectionMock ?? jest.fn().mockResolvedValue(true);
  const logger = {
    debug: jest.fn(),
    error: jest.fn(),
  };

  const mongoModulePath = resolveModulePath(import.meta.url, '../../utils/mongo.ts');
  const loggerModulePath = resolveModulePath(import.meta.url, '../../utils/logger.ts');

  jest.unstable_mockModule(mongoModulePath, () => ({
    connectDB: connectDBMock,
    disconnectDB: jest.fn(),
    testDBConnection: testDBConnectionMock,
  }));

  jest.unstable_mockModule(loggerModulePath, () => ({
    logger,
  }));

  const module = await import('../../utils/helpers.js');
  return {
    ...module,
    mocks: { connectDBMock, testDBConnectionMock, logger },
  };
};

describe('helpers', () => {
  it('returns the result immediately on first successful attempt', async () => {
    const { withRetry, mocks } = await loadHelpers();
    const fn = jest.fn().mockResolvedValue('ok');

    await expect(withRetry(fn, 'Worker-A', 3, 0)).resolves.toBe('ok');

    expect(fn).toHaveBeenCalledTimes(1);
    expect(mocks.testDBConnectionMock).not.toHaveBeenCalled();
    expect(mocks.connectDBMock).not.toHaveBeenCalled();
  });

  it('retries and reconnects when db health check fails', async () => {
    const { withRetry, mocks } = await loadHelpers({
      testDBConnectionMock: jest.fn().mockResolvedValue(false),
    });
    const fn = jest
      .fn()
      .mockRejectedValueOnce(new Error('temporary'))
      .mockResolvedValueOnce('done');

    await expect(withRetry(fn, 'Worker-B', 3, 0)).resolves.toBe('done');

    expect(fn).toHaveBeenCalledTimes(2);
    expect(mocks.testDBConnectionMock).toHaveBeenCalledTimes(1);
    expect(mocks.connectDBMock).toHaveBeenCalledWith('Worker-B');
  });

  it('retries without reconnect when db is healthy', async () => {
    const { withRetry, mocks } = await loadHelpers({
      testDBConnectionMock: jest.fn().mockResolvedValue(true),
    });
    const fn = jest
      .fn()
      .mockRejectedValueOnce(new Error('first'))
      .mockRejectedValueOnce(new Error('second'))
      .mockResolvedValueOnce('done');

    await expect(withRetry(fn, 'Worker-C', 4, 0)).resolves.toBe('done');

    expect(fn).toHaveBeenCalledTimes(3);
    expect(mocks.testDBConnectionMock).toHaveBeenCalledTimes(2);
    expect(mocks.connectDBMock).not.toHaveBeenCalled();
  });

  it('logs and throws when retries are exhausted', async () => {
    const { withRetry, mocks } = await loadHelpers({
      testDBConnectionMock: jest.fn().mockResolvedValue(true),
    });
    const fn = jest.fn().mockRejectedValue(new Error('permanent'));

    await expect(withRetry(fn, 'Worker-D', 2, 0)).rejects.toThrow('permanent');

    expect(fn).toHaveBeenCalledTimes(2);
    expect(mocks.logger.error).toHaveBeenCalledTimes(1);
  });

  it('sleeps for provided duration', async () => {
    const { sleep } = await loadHelpers();
    jest.useFakeTimers();

    const promise = sleep(50);
    await jest.advanceTimersByTimeAsync(50);

    await expect(promise).resolves.toBeUndefined();
  });
});
