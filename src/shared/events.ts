import { logger } from '../infrastructure/logger/index.js';

export type AppEvent =
  | { type: 'ORDER_CREATED'; orderId: string; orderNumber: string; userId: string }
  | {
      type: 'ORDER_STATUS_CHANGED';
      orderId: string;
      orderNumber: string;
      from: string;
      to: string;
    };

type Listener = (event: AppEvent) => void | Promise<void>;

const listeners: Listener[] = [];

export function onAppEvent(listener: Listener) {
  listeners.push(listener);
}

export async function emitAppEvent(event: AppEvent): Promise<void> {
  logger.info('AppEvent', { ...event });
  for (const listener of listeners) {
    try {
      await listener(event);
    } catch (err) {
      logger.error('Event listener failed', {
        type: event.type,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
