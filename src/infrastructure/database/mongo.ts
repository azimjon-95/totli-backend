import mongoose from 'mongoose';
import { env, isProd } from '../../config/env.js';
import { logger } from '../logger/index.js';

export async function connectDatabase(): Promise<void> {
  mongoose.set('strictQuery', true);

  mongoose.connection.on('connected', () => {
    logger.info('MongoDB connected');
  });

  mongoose.connection.on('error', (err) => {
    logger.error('MongoDB connection error', { error: String(err) });
  });

  mongoose.connection.on('disconnected', () => {
    logger.warn('MongoDB disconnected');
  });

  try {
    await mongoose.connect(env.MONGODB_URI, {
      serverSelectionTimeoutMS: 8000,
      maxPoolSize: 10,
    });
  } catch (error) {
    logger.error('MongoDB connection failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    if (isProd) {
      process.exit(1);
    }
  }
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
  logger.info('MongoDB disconnected');
}

export function getConnectionState(): number {
  return mongoose.connection.readyState;
}
