import { createServer } from 'node:http';
import { createApp } from './app.js';
import {
  connectDatabase,
  disconnectDatabase,
  getConnectionState,
} from './infrastructure/database/mongo.js';
import { connectRedis, disconnectRedis } from './infrastructure/redis/client.js';
import { env, isProd } from './config/env.js';
import { logger } from './infrastructure/logger/index.js';
import { startBot, stopBot } from './bot/bot.js';
import { NotificationService } from './modules/notifications/notification.service.js';

async function bootstrap() {
  logger.info('Starting TOTLI server', { env: env.NODE_ENV });

  await connectDatabase();

  if (getConnectionState() !== 1 && isProd) {
    logger.error('MongoDB not connected — refusing to start in production');
    process.exit(1);
  }

  await connectRedis();

  // Order events → notifications
  NotificationService.registerEventHandlers();

  const app = createApp();
  const httpServer = createServer(app);

  httpServer.listen(env.PORT, env.HOST, () => {
    logger.info(`Server listening on http://${env.HOST}:${env.PORT}`);
    logger.info('Health: /api/v1/health');
  });

  await startBot();

  let shuttingDown = false;

  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`${signal} received, shutting down gracefully`);

    await stopBot();

    httpServer.close(async () => {
      try {
        await disconnectRedis();
        await disconnectDatabase();
        logger.info('Shutdown complete');
        process.exit(0);
      } catch (err) {
        logger.error('Shutdown error', {
          error: err instanceof Error ? err.message : String(err),
        });
        process.exit(1);
      }
    });

    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 15_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap().catch((err) => {
  logger.error('Failed to start server', {
    error: err instanceof Error ? err.message : String(err),
  });
  process.exit(1);
});
