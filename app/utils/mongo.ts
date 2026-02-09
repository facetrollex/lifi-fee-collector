import mongoose from 'mongoose';
import { logger } from './logger.js';
import { dbConfig } from '../config.js';

export async function connectDB(entity: string = 'API'): Promise<void> {
  await mongoose.connect(dbConfig.mongoURI);
  logger.info(`[${entity}] Successfully connected to database.`);
}

export async function disconnectDB(): Promise<void> {
  await mongoose.disconnect();
  logger.info(`[] Successfully disconnected from database.`);
}
