import mongoose from 'mongoose';
import { logger } from './logger.js';
import { dbConfig } from '../config.js';

export async function connectDB(entity: string = 'API'): Promise<void> {
  await mongoose.connect(dbConfig.mongoURI);
  logger.info(`[${entity}] Successfully connected to database.`);
}

export async function disconnectDB(entity: string = 'API'): Promise<void> {
  await mongoose.disconnect();
  logger.info(`[${entity}] Successfully disconnected from database.`);
}

export async function testDBConnection(): Promise<boolean> {
  if (mongoose.connection.readyState !== 1) {
    return false;
  }

  const db = mongoose.connection.db;

  if (!db) {
    return false;
  }

  try {
    await db.admin().ping();
    return true;
  } catch {
    return false;
  }
}
