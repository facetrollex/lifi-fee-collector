import mongoose from 'mongoose';
import { dbConfig } from '../../config.js';
import { logger } from '../../utils/logger.js';
import { connectDB, disconnectDB, testDBConnection } from '../../utils/mongo.js';

describe('mongo utils', () => {
  const originalReadyState = mongoose.connection.readyState;
  const originalDb = mongoose.connection.db;

  afterEach(() => {
    (mongoose.connection as { readyState: number }).readyState = originalReadyState;
    (mongoose.connection as { db: typeof mongoose.connection.db }).db = originalDb;
  });

  it('connectDB connects and logs success', async () => {
    const connectSpy = jest.spyOn(mongoose, 'connect').mockResolvedValue(mongoose);
    const logSpy = jest.spyOn(logger, 'info').mockImplementation(() => logger);

    await connectDB('Worker-A');

    expect(connectSpy).toHaveBeenCalledWith(dbConfig.mongoURI);
    expect(logSpy).toHaveBeenCalledWith('[Worker-A] Successfully connected to database.');
  });

  it('connectDB uses default API entity label', async () => {
    const connectSpy = jest.spyOn(mongoose, 'connect').mockResolvedValue(mongoose);
    const logSpy = jest.spyOn(logger, 'info').mockImplementation(() => logger);

    await connectDB();

    expect(connectSpy).toHaveBeenCalledWith(dbConfig.mongoURI);
    expect(logSpy).toHaveBeenCalledWith('[API] Successfully connected to database.');
  });

  it('disconnectDB disconnects and logs success', async () => {
    const disconnectSpy = jest.spyOn(mongoose, 'disconnect').mockResolvedValue(undefined);
    const logSpy = jest.spyOn(logger, 'info').mockImplementation(() => logger);

    await disconnectDB('Worker-B');

    expect(disconnectSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith('[Worker-B] Successfully disconnected from database.');
  });

  it('disconnectDB uses default API entity label', async () => {
    const disconnectSpy = jest.spyOn(mongoose, 'disconnect').mockResolvedValue(undefined);
    const logSpy = jest.spyOn(logger, 'info').mockImplementation(() => logger);

    await disconnectDB();

    expect(disconnectSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith('[API] Successfully disconnected from database.');
  });

  it('testDBConnection returns false when mongoose is not connected', async () => {
    (mongoose.connection as { readyState: number }).readyState = 0;
    await expect(testDBConnection()).resolves.toBe(false);
  });

  it('testDBConnection returns false when db handle is unavailable', async () => {
    (mongoose.connection as { readyState: number }).readyState = 1;
    (mongoose.connection as { db: typeof mongoose.connection.db }).db = undefined;

    await expect(testDBConnection()).resolves.toBe(false);
  });

  it('testDBConnection returns true when ping succeeds', async () => {
    const ping = jest.fn().mockResolvedValue(undefined);
    (mongoose.connection as { readyState: number }).readyState = 1;
    (mongoose.connection as { db: typeof mongoose.connection.db }).db = {
      admin: () => ({ ping }),
    } as unknown as typeof mongoose.connection.db;

    await expect(testDBConnection()).resolves.toBe(true);
    expect(ping).toHaveBeenCalledTimes(1);
  });

  it('testDBConnection returns false when ping throws', async () => {
    const ping = jest.fn().mockRejectedValue(new Error('ping failed'));
    (mongoose.connection as { readyState: number }).readyState = 1;
    (mongoose.connection as { db: typeof mongoose.connection.db }).db = {
      admin: () => ({ ping }),
    } as unknown as typeof mongoose.connection.db;

    await expect(testDBConnection()).resolves.toBe(false);
  });
});
