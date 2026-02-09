import winston from 'winston';
import { appConfig } from '../config.js';

export const logger = winston.createLogger({
  level: appConfig.logLevel,
  format: winston.format.combine(
    winston.format.colorize(),
    winston.format.simple(),
  ),
  transports: [new winston.transports.Console()],
});
