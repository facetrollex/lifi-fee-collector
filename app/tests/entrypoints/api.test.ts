import { flushPromises, mockProcessHandlersAndExit, resolveModulePath } from '../helpers/testUtils.js';

type ApiLoadOptions = {
  connectDBMock?: jest.Mock;
  disconnectDBMock?: jest.Mock;
  findFeeEventsMock?: jest.Mock;
  appConfig?: { apiPort: number; env: string; logLevel: string };
};

type RouteHandler = (req: { query: Record<string, unknown> }, res: Record<string, unknown>) => Promise<void> | void;

const makeResponse = () => {
  const res: {
    status: jest.Mock;
    send: jest.Mock;
    json: jest.Mock;
  } = {
    status: jest.fn(),
    send: jest.fn(),
    json: jest.fn(),
  };
  res.status.mockReturnValue(res);
  res.send.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res;
};

const loadApiModule = async (options: ApiLoadOptions = {}) => {
  jest.resetModules();

  const routeHandlers: Record<string, RouteHandler> = {};
  const app = {
    get: jest.fn((path: string, handler: RouteHandler) => {
      routeHandlers[path] = handler;
      return app;
    }),
    listen: jest.fn((_: number | string, callback: () => void) => {
      callback();
      return { close: jest.fn() };
    }),
  };

  const expressMock = jest.fn(() => app);
  const connectDBMock = options.connectDBMock ?? jest.fn().mockResolvedValue(undefined);
  const disconnectDBMock = options.disconnectDBMock ?? jest.fn().mockResolvedValue(undefined);
  const findFeeEventsMock =
    options.findFeeEventsMock ?? jest.fn().mockResolvedValue({ data: [], total: 0 });
  const logger = { info: jest.fn(), error: jest.fn() };
  const appConfig = options.appConfig ?? { apiPort: 9999, env: 'test', logLevel: 'debug' };

  const processMock = mockProcessHandlersAndExit();

  const loggerModulePath = resolveModulePath(import.meta.url, '../../utils/logger.ts');
  const mongoModulePath = resolveModulePath(import.meta.url, '../../utils/mongo.ts');
  const configModulePath = resolveModulePath(import.meta.url, '../../config.ts');
  const feeEventModulePath = resolveModulePath(import.meta.url, '../../repositories/FeeEvent.ts');

  jest.unstable_mockModule('express', () => ({ default: expressMock }));
  jest.unstable_mockModule(loggerModulePath, () => ({ logger }));
  jest.unstable_mockModule(mongoModulePath, () => ({
    connectDB: connectDBMock,
    disconnectDB: disconnectDBMock,
    testDBConnection: jest.fn(),
  }));
  jest.unstable_mockModule(configModulePath, () => ({ appConfig }));
  jest.unstable_mockModule(feeEventModulePath, () => ({
    findFeeEvents: findFeeEventsMock,
  }));

  await import('../../api.js');
  await flushPromises();

  return {
    app,
    routeHandlers,
    connectDBMock,
    disconnectDBMock,
    findFeeEventsMock,
    logger,
    processHandlers: processMock.handlers,
    processOnSpy: processMock.onSpy,
    processExitSpy: processMock.exitSpy,
  };
};

describe('api entrypoint', () => {
  it('boots API, connects DB, registers routes and starts listening', async () => {
    const loaded = await loadApiModule();

    expect(loaded.connectDBMock).toHaveBeenCalledTimes(1);
    expect(loaded.app.get).toHaveBeenCalledTimes(2);
    expect(loaded.app.listen).toHaveBeenCalledTimes(1);
    expect(loaded.logger.info).toHaveBeenCalledWith('[API] Listening on port 9999');
    expect(loaded.logger.info).toHaveBeenCalledWith('[API] Environment: test');
  });

  it('health route returns running message', async () => {
    const loaded = await loadApiModule();
    const res = makeResponse();

    loaded.routeHandlers['/']?.({ query: {} }, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.send).toHaveBeenCalledWith('Api Running');
  });

  it('fees route validates integrator and returns 400 for non-numeric values', async () => {
    const loaded = await loadApiModule();
    const res = makeResponse();

    await loaded.routeHandlers['/fees']?.({ query: { integrator: 'abc' } }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Invalid integrator value. Expected numeric chain id.',
    });
  });

  it('fees route applies defaults and pagination bounds', async () => {
    const findFeeEventsMock = jest.fn().mockResolvedValue({
      data: [{ transactionHash: '0x1' }],
      total: 250,
    });
    const loaded = await loadApiModule({ findFeeEventsMock });
    const res = makeResponse();

    await loaded.routeHandlers['/fees']?.(
      { query: { integrator: '137', page: '2', limit: '500' } },
      res,
    );

    expect(findFeeEventsMock).toHaveBeenCalledWith(137, 100, 100);
    expect(res.json).toHaveBeenCalledWith({
      data: [{ transactionHash: '0x1' }],
      pagination: {
        page: 2,
        limit: 100,
        total: 250,
        totalPages: 3,
      },
    });
  });

  it.each([
    ['0'],
    ['-3'],
  ])('fees route clamps page to 1 for edge value %s', async (page) => {
    const findFeeEventsMock = jest.fn().mockResolvedValue({
      data: [],
      total: 0,
    });
    const loaded = await loadApiModule({ findFeeEventsMock });
    const res = makeResponse();

    await loaded.routeHandlers['/fees']?.({ query: { integrator: '137', page, limit: '20' } }, res);

    expect(findFeeEventsMock).toHaveBeenCalledWith(137, 0, 20);
    expect(res.json).toHaveBeenCalledWith({
      data: [],
      pagination: {
        page: 1,
        limit: 20,
        total: 0,
        totalPages: 0,
      },
    });
  });

  it.each([
    ['0', 20],
    ['-5', 1],
  ])('fees route handles limit edge value %s', async (limit, expectedLimit) => {
    const findFeeEventsMock = jest.fn().mockResolvedValue({
      data: [],
      total: 0,
    });
    const loaded = await loadApiModule({ findFeeEventsMock });
    const res = makeResponse();

    await loaded.routeHandlers['/fees']?.({ query: { integrator: '137', page: '1', limit } }, res);

    expect(findFeeEventsMock).toHaveBeenCalledWith(137, 0, expectedLimit);
    expect(res.json).toHaveBeenCalledWith({
      data: [],
      pagination: {
        page: 1,
        limit: expectedLimit,
        total: 0,
        totalPages: 0,
      },
    });
  });

  it('fees route defaults to chain 137 when integrator is missing', async () => {
    const findFeeEventsMock = jest.fn().mockResolvedValue({ data: [], total: 0 });
    const loaded = await loadApiModule({ findFeeEventsMock });
    const res = makeResponse();

    await loaded.routeHandlers['/fees']?.({ query: {} }, res);

    expect(findFeeEventsMock).toHaveBeenCalledWith(137, 0, 20);
    expect(res.json).toHaveBeenCalledTimes(1);
  });

  it('fees route treats empty integrator as missing and uses default chain', async () => {
    const findFeeEventsMock = jest.fn().mockResolvedValue({ data: [], total: 0 });
    const loaded = await loadApiModule({ findFeeEventsMock });
    const res = makeResponse();

    await loaded.routeHandlers['/fees']?.({ query: { integrator: '' } }, res);

    expect(findFeeEventsMock).toHaveBeenCalledWith(137, 0, 20);
    expect(res.status).not.toHaveBeenCalledWith(400);
  });

  it('fees route accepts numeric non-integer integrator values', async () => {
    const findFeeEventsMock = jest.fn().mockResolvedValue({ data: [], total: 0 });
    const loaded = await loadApiModule({ findFeeEventsMock });
    const res = makeResponse();

    await loaded.routeHandlers['/fees']?.({ query: { integrator: '137.5' } }, res);

    expect(findFeeEventsMock).toHaveBeenCalledWith(137.5, 0, 20);
    expect(res.status).not.toHaveBeenCalledWith(400);
  });

  it('fees route returns 500 when repository throws', async () => {
    const loaded = await loadApiModule({
      findFeeEventsMock: jest.fn().mockRejectedValue(new Error('db failed')),
    });
    const res = makeResponse();

    await loaded.routeHandlers['/fees']?.({ query: {} }, res);

    expect(loaded.logger.error).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
  });

  it('logs startup failure and exits with code 1', async () => {
    const loaded = await loadApiModule({
      connectDBMock: jest.fn().mockRejectedValue(new Error('startup failed')),
    });

    expect(loaded.logger.error).toHaveBeenCalledWith('[API] startup failed');
    expect(loaded.processExitSpy).toHaveBeenCalledWith(1);
  });

  it('handles SIGINT and SIGTERM by disconnecting and exiting 0', async () => {
    const loaded = await loadApiModule();

    await loaded.processHandlers.SIGINT?.();
    await loaded.processHandlers.SIGTERM?.();

    expect(loaded.disconnectDBMock).toHaveBeenCalledTimes(2);
    expect(loaded.processExitSpy).toHaveBeenNthCalledWith(1, 0);
    expect(loaded.processExitSpy).toHaveBeenNthCalledWith(2, 0);
    expect(loaded.processOnSpy).toHaveBeenCalledTimes(2);
  });
});
